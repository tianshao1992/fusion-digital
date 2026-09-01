"""Shared, source-agnostic geometry helpers for EXL-50U web derivatives."""

from __future__ import annotations

import hashlib
import json
import math
import re
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class MeshAsset:
    node_name: str
    color: str
    poly: object


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(16 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest().upper()


def enclosing_git_checkout(path: Path) -> Path | None:
    """Return the nearest Git checkout containing a path, even if it is new."""

    candidate = path.resolve()
    if not candidate.exists():
        candidate = candidate.parent
        while not candidate.exists() and candidate != candidate.parent:
            candidate = candidate.parent
    for ancestor in (candidate, *candidate.parents):
        if (ancestor / ".git").exists():
            return ancestor
    return None


def vtk_modules():
    import vtk
    import vtk.util.numpy_support as ns

    return vtk, ns


def write_vtp(path: Path, poly: object) -> None:
    vtk, _ = vtk_modules()
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = vtk.vtkXMLPolyDataWriter()
    writer.SetFileName(str(path))
    writer.SetInputData(poly)
    writer.SetDataModeToBinary()
    writer.SetCompressorTypeToZLib()
    if writer.Write() != 1:
        raise RuntimeError(f"failed to write VTP: {path}")


def read_vtp(path: Path):
    vtk, _ = vtk_modules()
    reader = vtk.vtkXMLPolyDataReader()
    reader.SetFileName(str(path))
    reader.Update()
    result = vtk.vtkPolyData()
    result.DeepCopy(reader.GetOutput())
    return result


def append_polys(polys: list[object]):
    vtk, _ = vtk_modules()
    append = vtk.vtkAppendPolyData()
    for poly in polys:
        append.AddInputData(poly)
    append.Update()
    result = vtk.vtkPolyData()
    result.DeepCopy(append.GetOutput())
    return result


def transform_poly(poly: object, matrix: np.ndarray):
    vtk, _ = vtk_modules()
    vtk_matrix = vtk.vtkMatrix4x4()
    for row in range(4):
        for column in range(4):
            vtk_matrix.SetElement(row, column, float(matrix[row, column]))
    transform = vtk.vtkTransform()
    transform.SetMatrix(vtk_matrix)
    filt = vtk.vtkTransformPolyDataFilter()
    filt.SetTransform(transform)
    filt.SetInputData(poly)
    filt.Update()
    result = vtk.vtkPolyData()
    result.DeepCopy(filt.GetOutput())
    return result


def _poly_from_arrays(positions: np.ndarray, connectivity: np.ndarray):
    vtk, ns = vtk_modules()
    points = vtk.vtkPoints()
    points.SetData(ns.numpy_to_vtk(np.asarray(positions, dtype=np.float32), deep=True))
    cells = vtk.vtkCellArray()
    offsets = np.arange(0, 3 * (len(connectivity) + 1), 3, dtype=np.int64)
    cells.SetData(
        ns.numpy_to_vtkIdTypeArray(offsets, deep=True),
        ns.numpy_to_vtkIdTypeArray(np.asarray(connectivity, dtype=np.int64).ravel(), deep=True),
    )
    rebuilt = vtk.vtkPolyData()
    rebuilt.SetPoints(points)
    rebuilt.SetPolys(cells)
    return rebuilt


def _float32_delivery_cleanup(poly: object, maximum_passes: int = 4):
    """Remove faces that collapse or duplicate after delivered Float32 rounding."""

    vtk, ns = vtk_modules()
    current = vtk.vtkPolyData()
    current.DeepCopy(poly)
    for _ in range(maximum_passes):
        if current.GetPoints() is None:
            raise RuntimeError("geometry has no points")
        positions = ns.vtk_to_numpy(current.GetPoints().GetData()).astype(np.float32, copy=False)
        connectivity = ns.vtk_to_numpy(current.GetPolys().GetConnectivityArray()).astype(np.int64, copy=False)
        if connectivity.size % 3:
            raise RuntimeError("non-triangle connectivity survived the triangle filter")
        connectivity = connectivity.reshape((-1, 3))
        if len(connectivity) == 0 or len(positions) == 0:
            raise RuntimeError("geometry became empty during Float32 cleanup")
        if not np.isfinite(positions).all():
            raise RuntimeError("geometry contains non-finite delivered positions")
        if connectivity.min() < 0 or connectivity.max() >= len(positions):
            raise RuntimeError("geometry contains an out-of-range index")

        positions64 = positions.astype(np.float64)
        a = positions64[connectivity[:, 0]]
        ab = positions64[connectivity[:, 1]] - a
        ac = positions64[connectivity[:, 2]] - a
        cross = np.cross(ab, ac)
        cross_squared = np.einsum("ij,ij->i", cross, cross)
        diagonal_squared = float(np.sum((positions64.max(axis=0) - positions64.min(axis=0)) ** 2))
        area_threshold_squared = max(diagonal_squared * 1e-12, 1e-18) ** 2
        degenerate = cross_squared <= area_threshold_squared

        coordinate_ids = np.unique(positions, axis=0, return_inverse=True)[1]
        canonical = np.sort(coordinate_ids[connectivity], axis=1)
        _, first_indices = np.unique(canonical, axis=0, return_index=True)
        duplicate = np.ones(len(connectivity), dtype=bool)
        duplicate[first_indices] = False
        rejected = degenerate | duplicate
        if not np.any(rejected):
            return current

        rebuilt = _poly_from_arrays(positions, connectivity[~rejected])
        clean = vtk.vtkCleanPolyData()
        clean.SetInputData(rebuilt)
        clean.PointMergingOn()
        clean.Update()
        current = vtk.vtkPolyData()
        current.DeepCopy(clean.GetOutput())
    raise RuntimeError("Float32 delivery cleanup did not converge")


def clean_and_simplify(poly: object, target_triangles: int, feature_angle: float = 60.0):
    vtk, ns = vtk_modules()
    if not isinstance(target_triangles, int) or target_triangles < 4:
        raise ValueError("target_triangles must be an integer of at least 4")
    if not math.isfinite(feature_angle) or not 1.0 <= feature_angle <= 179.0:
        raise ValueError("feature_angle must be finite and between 1 and 179 degrees")
    triangle_filter = vtk.vtkTriangleFilter()
    triangle_filter.SetInputData(poly)
    triangle_filter.PassVertsOff()
    triangle_filter.PassLinesOff()
    triangle_filter.Update()

    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(triangle_filter.GetOutput())
    clean.PointMergingOn()
    clean.Update()
    current = clean.GetOutput()
    count = int(current.GetNumberOfPolys())
    if count > target_triangles:
        decimate = vtk.vtkQuadricDecimation()
        decimate.SetInputData(current)
        decimate.SetTargetReduction(min(0.995, max(0.0, 1.0 - target_triangles / count)))
        decimate.VolumePreservationOn()
        decimate.Update()
        current = decimate.GetOutput()

    delivered = _float32_delivery_cleanup(current)
    normals = vtk.vtkPolyDataNormals()
    normals.SetInputData(delivered)
    normals.SetFeatureAngle(feature_angle)
    normals.SplittingOn()
    normals.ConsistencyOn()
    normals.AutoOrientNormalsOn()
    normals.Update()
    result = vtk.vtkPolyData()
    result.DeepCopy(normals.GetOutput())
    return result


def web_axis_transform(poly: object):
    # OCCT Z-up -> browser Y-up: (x, y, z) -> (x, z, -y).
    matrix = np.asarray(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, -1.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )
    return transform_poly(poly, matrix)


def _pad4(blob: bytes, fill: bytes = b"\0") -> bytes:
    return blob + fill * ((-len(blob)) % 4)


def write_raw_glb(output: Path, assets: list[MeshAsset]) -> dict[str, object]:
    _, ns = vtk_modules()
    if not assets:
        raise RuntimeError("at least one mesh asset is required")
    if output.suffix.lower() != ".glb":
        raise RuntimeError("raw browser artifact must use the .glb suffix")
    if output.exists() or output.with_name(output.name + ".partial").exists():
        raise RuntimeError("raw browser artifact or its partial file already exists")
    node_names = [asset.node_name for asset in assets]
    if len(set(node_names)) != len(node_names):
        raise RuntimeError("mesh assets contain duplicate stable node names")
    binary = bytearray()
    views: list[dict[str, object]] = []
    accessors: list[dict[str, object]] = []
    meshes: list[dict[str, object]] = []
    materials: list[dict[str, object]] = []
    nodes: list[dict[str, object]] = []
    totals = {"vertices": 0, "triangles": 0}
    global_min = np.full(3, np.inf)
    global_max = np.full(3, -np.inf)
    per_asset: list[dict[str, object]] = []

    def add_view(blob: bytes, target: int) -> int:
        offset = len(binary)
        binary.extend(blob)
        binary.extend(b"\0" * ((-len(binary)) % 4))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(blob), "target": target})
        return len(views) - 1

    for asset in assets:
        if not re.fullmatch(r"EXL50U_GA_PART__[a-z0-9][a-z0-9-]*", asset.node_name):
            raise RuntimeError("mesh asset node name is outside the public stable-name contract")
        if not re.fullmatch(r"#[A-Fa-f0-9]{6}", asset.color):
            raise RuntimeError(f"{asset.node_name} has an invalid public color")
        poly = asset.poly
        if poly.GetPoints() is None:
            raise RuntimeError(f"{asset.node_name} has no positions")
        positions = ns.vtk_to_numpy(poly.GetPoints().GetData()).astype("<f4", copy=False)
        normal_data = poly.GetPointData().GetNormals()
        if normal_data is None:
            raise RuntimeError(f"{asset.node_name} has no normals")
        normals = ns.vtk_to_numpy(normal_data).astype("<f4", copy=False)
        connectivity64 = ns.vtk_to_numpy(poly.GetPolys().GetConnectivityArray()).astype(np.int64, copy=False)
        if positions.ndim != 2 or positions.shape[1] != 3 or normals.shape != positions.shape:
            raise RuntimeError(f"{asset.node_name} has inconsistent POSITION/NORMAL arrays")
        if not np.isfinite(positions).all() or not np.isfinite(normals).all():
            raise RuntimeError(f"{asset.node_name} contains non-finite geometry")
        if connectivity64.size == 0 or connectivity64.min() < 0 or connectivity64.max() >= len(positions):
            raise RuntimeError(f"{asset.node_name} contains empty or out-of-range indices")
        connectivity = connectivity64.astype("<u4", copy=False)
        if connectivity.size % 3:
            raise RuntimeError(f"{asset.node_name} contains non-triangle connectivity")
        low = positions.min(axis=0)
        high = positions.max(axis=0)
        global_min = np.minimum(global_min, low)
        global_max = np.maximum(global_max, high)
        position_view = add_view(positions.tobytes(), 34962)
        normal_view = add_view(normals.tobytes(), 34962)
        index_view = add_view(connectivity.tobytes(), 34963)
        position_accessor = len(accessors)
        accessors.append({
            "bufferView": position_view,
            "componentType": 5126,
            "count": len(positions),
            "type": "VEC3",
            "min": low.tolist(),
            "max": high.tolist(),
        })
        normal_accessor = len(accessors)
        accessors.append({
            "bufferView": normal_view,
            "componentType": 5126,
            "count": len(normals),
            "type": "VEC3",
        })
        index_accessor = len(accessors)
        accessors.append({
            "bufferView": index_view,
            "componentType": 5125,
            "count": int(connectivity.size),
            "type": "SCALAR",
        })
        rgb = [int(asset.color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
        material_index = len(materials)
        materials.append({
            "name": f"material_{asset.node_name}",
            "pbrMetallicRoughness": {
                "baseColorFactor": [*rgb, 1.0],
                "metallicFactor": 0.34,
                "roughnessFactor": 0.46,
            },
            "doubleSided": True,
        })
        mesh_index = len(meshes)
        meshes.append({
            "name": asset.node_name,
            "primitives": [{
                "attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor},
                "indices": index_accessor,
                "material": material_index,
            }],
        })
        nodes.append({"name": asset.node_name, "mesh": mesh_index})
        triangles = int(connectivity.size // 3)
        totals["vertices"] += int(len(positions))
        totals["triangles"] += triangles
        per_asset.append({
            "nodeName": asset.node_name,
            "vertices": int(len(positions)),
            "triangles": triangles,
            "boundsMetres": {"min": low.tolist(), "max": high.tolist()},
        })

    document = {
        "asset": {
            "version": "2.0",
            "generator": "FusionDigital EXL-50U integrated-assembly derivative builder",
        },
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    json_blob = _pad4(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode(), b" ")
    bin_blob = _pad4(bytes(binary))
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".partial")
    with temporary.open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, total))
        stream.write(struct.pack("<II", len(json_blob), 0x4E4F534A))
        stream.write(json_blob)
        stream.write(struct.pack("<II", len(bin_blob), 0x004E4942))
        stream.write(bin_blob)
    temporary.replace(output)
    return {
        "bytes": total,
        "sha256": sha256_file(output),
        **totals,
        "decodedGpuBytes": totals["vertices"] * 24 + totals["triangles"] * 12,
        "boundsMetres": {"min": global_min.tolist(), "max": global_max.tolist()},
        "assets": per_asset,
    }


def read_raw_glb_mesh(source: Path, expected_node: str | None = None):
    """Read only the exact raw GLB shape emitted by :func:`write_raw_glb`."""

    vtk, ns = vtk_modules()

    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise RuntimeError(f"raw GLB JSON contains duplicate key {key!r}")
            result[key] = value
        return result

    def reject_nonfinite_constant(value: str) -> object:
        raise RuntimeError(f"raw GLB JSON contains non-finite constant {value}")

    def exact_keys(value: object, keys: set[str], label: str) -> dict[str, object]:
        if not isinstance(value, dict) or set(value) != keys:
            raise RuntimeError(f"raw GLB {label} fields are outside the exact contract")
        return value

    def natural_number(value: object, label: str, *, positive: bool = False) -> int:
        if not isinstance(value, int) or isinstance(value, bool) or value < (1 if positive else 0):
            raise RuntimeError(f"raw GLB {label} must be a {'positive' if positive else 'non-negative'} integer")
        return value

    data = source.read_bytes()
    if len(data) < 28:
        raise RuntimeError("raw GLB is truncated")
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise RuntimeError(f"not a complete glTF 2.0 binary: {source}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    json_end = 20 + json_length
    if json_type != 0x4E4F534A or json_length % 4 or json_end + 8 > len(data):
        raise RuntimeError("GLB JSON chunk is missing or misaligned")
    json_chunk = data[20:json_end]
    json_payload = json_chunk.rstrip(b" ")
    if len(json_chunk) - len(json_payload) > 3:
        raise RuntimeError("raw GLB JSON has non-canonical padding")
    try:
        document = json.loads(
            json_payload.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_nonfinite_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("raw GLB JSON is invalid") from error
    binary_length, binary_type = struct.unpack_from("<II", data, json_end)
    bin_offset = json_end + 8
    if binary_type != 0x004E4942 or binary_length % 4 or bin_offset + binary_length != len(data):
        raise RuntimeError("GLB BIN chunk table is invalid")

    root = exact_keys(
        document,
        {"asset", "scene", "scenes", "nodes", "meshes", "materials", "accessors", "bufferViews", "buffers"},
        "root",
    )
    asset = exact_keys(root["asset"], {"version", "generator"}, "asset")
    if asset != {
        "version": "2.0",
        "generator": "FusionDigital EXL-50U integrated-assembly derivative builder",
    }:
        raise RuntimeError("raw GLB asset declaration is invalid")
    if root["scene"] != 0 or not isinstance(root["scenes"], list) or len(root["scenes"]) != 1:
        raise RuntimeError("raw GLB scene declaration is invalid")
    scene = exact_keys(root["scenes"][0], {"nodes"}, "scene")
    if scene["nodes"] != [0]:
        raise RuntimeError("raw GLB scene root is invalid")
    for key, count in (("nodes", 1), ("meshes", 1), ("materials", 1), ("buffers", 1), ("bufferViews", 3), ("accessors", 3)):
        if not isinstance(root[key], list) or len(root[key]) != count:
            raise RuntimeError(f"raw GLB {key} are outside the one-system structure contract")

    node = exact_keys(root["nodes"][0], {"name", "mesh"}, "node")
    node_name = node["name"]
    if node["mesh"] != 0 or not re.fullmatch(r"EXL50U_GA_PART__[a-z0-9][a-z0-9-]*", str(node_name)):
        raise RuntimeError("raw GLB stable node identity is invalid")
    if expected_node is not None and node_name != expected_node:
        raise RuntimeError("raw GLB stable node does not match the reviewed profile")

    mesh = exact_keys(root["meshes"][0], {"name", "primitives"}, "mesh")
    if mesh["name"] != node_name or not isinstance(mesh["primitives"], list) or len(mesh["primitives"]) != 1:
        raise RuntimeError("raw GLB mesh identity is invalid")
    primitive = exact_keys(mesh["primitives"][0], {"attributes", "indices", "material"}, "primitive")
    attributes = exact_keys(primitive["attributes"], {"POSITION", "NORMAL"}, "primitive attributes")
    if attributes != {"POSITION": 0, "NORMAL": 1} or primitive["indices"] != 2 or primitive["material"] != 0:
        raise RuntimeError("raw GLB primitive references are invalid")

    material = exact_keys(
        root["materials"][0],
        {"name", "pbrMetallicRoughness", "doubleSided"},
        "material",
    )
    if material["name"] != f"material_{node_name}" or material["doubleSided"] is not True:
        raise RuntimeError("raw GLB material identity is invalid")
    pbr = exact_keys(
        material["pbrMetallicRoughness"],
        {"baseColorFactor", "metallicFactor", "roughnessFactor"},
        "PBR material",
    )
    if pbr["metallicFactor"] != 0.34 or pbr["roughnessFactor"] != 0.46:
        raise RuntimeError("raw GLB material factors are invalid")
    base_color = pbr["baseColorFactor"]
    if (
        not isinstance(base_color, list)
        or len(base_color) != 4
        or base_color[3] != 1.0
        or not all(
            isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 1
            for value in base_color
        )
    ):
        raise RuntimeError("raw GLB material color is invalid")

    buffer = exact_keys(root["buffers"][0], {"byteLength"}, "buffer")
    declared_binary_length = natural_number(buffer["byteLength"], "buffer byteLength", positive=True)
    if declared_binary_length != binary_length:
        raise RuntimeError("raw GLB buffer length is not canonical")

    component_dtype = {5125: "<u4", 5126: "<f4"}
    components = {"SCALAR": 1, "VEC3": 3}
    accessor_contracts = (
        (0, 5126, "VEC3", 34962, {"bufferView", "componentType", "count", "type", "min", "max"}),
        (1, 5126, "VEC3", 34962, {"bufferView", "componentType", "count", "type"}),
        (2, 5125, "SCALAR", 34963, {"bufferView", "componentType", "count", "type"}),
    )
    arrays: list[np.ndarray] = []
    intervals: list[tuple[int, int]] = []
    for accessor_index, expected_component, expected_type, expected_target, accessor_keys in accessor_contracts:
        accessor = exact_keys(root["accessors"][accessor_index], accessor_keys, f"accessor {accessor_index}")
        if accessor["bufferView"] != accessor_index:
            raise RuntimeError("raw GLB accessor-to-bufferView ownership is invalid")
        if (accessor["componentType"], accessor["type"]) != (expected_component, expected_type):
            raise RuntimeError("raw GLB accessor encoding is invalid")
        count = natural_number(accessor["count"], f"accessor {accessor_index} count", positive=True)
        view = exact_keys(
            root["bufferViews"][accessor_index],
            {"buffer", "byteOffset", "byteLength", "target"},
            f"bufferView {accessor_index}",
        )
        view_offset = natural_number(view["byteOffset"], f"bufferView {accessor_index} byteOffset")
        view_length = natural_number(view["byteLength"], f"bufferView {accessor_index} byteLength", positive=True)
        if view["buffer"] != 0 or view["target"] != expected_target or view_offset % 4:
            raise RuntimeError("raw GLB bufferView declaration is invalid")
        dtype = np.dtype(component_dtype[expected_component])
        width = components[expected_type]
        expected_length = count * width * dtype.itemsize
        if view_length != expected_length or view_offset + view_length > declared_binary_length:
            raise RuntimeError("raw GLB accessor range is not exact")
        intervals.append((view_offset, view_offset + view_length))
        values = np.frombuffer(
            data,
            dtype=dtype,
            count=count * width,
            offset=bin_offset + view_offset,
        ).copy()
        arrays.append(values.reshape((count, width)) if width > 1 else values)

    cursor = 0
    binary = memoryview(data)[bin_offset : bin_offset + binary_length]
    for start, end in intervals:
        expected_padding = (-cursor) % 4
        if start != cursor + expected_padding or any(binary[cursor:start]):
            raise RuntimeError("raw GLB BIN has overlap, a gap, or non-zero padding")
        cursor = end
    expected_padding = (-cursor) % 4
    if declared_binary_length != cursor + expected_padding or any(binary[cursor:declared_binary_length]):
        raise RuntimeError("raw GLB BIN has unconsumed or non-zero trailing bytes")

    positions = arrays[0].astype(np.float32, copy=False)
    normals = arrays[1].astype(np.float32, copy=False)
    indices = arrays[2].astype(np.int64, copy=False)
    if positions.shape != normals.shape or len(indices) % 3:
        raise RuntimeError("raw GLB geometry array sizes are inconsistent")
    if not np.isfinite(positions).all() or not np.isfinite(normals).all():
        raise RuntimeError("raw GLB geometry contains non-finite values")
    if indices.min() < 0 or indices.max() >= len(positions):
        raise RuntimeError("raw GLB contains an out-of-range index")
    position_accessor = root["accessors"][0]
    for key, actual in (("min", positions.min(axis=0)), ("max", positions.max(axis=0))):
        declared = position_accessor[key]
        if not isinstance(declared, list) or len(declared) != 3 or not np.array_equal(np.asarray(declared, dtype=np.float32), actual):
            raise RuntimeError(f"raw GLB POSITION {key} is not exact")
    normal_lengths = np.linalg.norm(normals.astype(np.float64), axis=1)
    if not np.all((normal_lengths >= 0.9) & (normal_lengths <= 1.1)):
        raise RuntimeError("raw GLB contains invalid delivered normals")

    points = vtk.vtkPoints()
    points.SetData(ns.numpy_to_vtk(positions, deep=True))
    cells = vtk.vtkCellArray()
    offsets = np.arange(0, len(indices) + 1, 3, dtype=np.int64)
    cells.SetData(
        ns.numpy_to_vtkIdTypeArray(offsets, deep=True),
        ns.numpy_to_vtkIdTypeArray(indices, deep=True),
    )
    poly = vtk.vtkPolyData()
    poly.SetPoints(points)
    poly.SetPolys(cells)
    poly.GetPointData().SetNormals(ns.numpy_to_vtk(normals, deep=True))
    color = "#" + "".join(f"{round(value * 255):02X}" for value in base_color[:3])
    return str(node_name), color, poly
