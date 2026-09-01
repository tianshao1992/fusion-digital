"""Build one bounded raw GLB from one private, system-level STEP export."""

from __future__ import annotations

import argparse
import gc
import json
import math
import os
import re
import time
from collections import Counter
from pathlib import Path

import numpy as np

from pipeline import (
    MeshAsset,
    append_polys,
    clean_and_simplify,
    sha256_file,
    transform_poly,
    web_axis_transform,
    write_raw_glb,
    write_vtp,
    read_vtp,
)
from source_audit import (
    PrivateStepAuditError,
    load_private_step_audit,
    safe_format_facts,
    scan_stream,
    validate_private_step_audit,
    validate_private_step_audit_schema,
)


HARD_MAX_SOURCE_BYTES = 2_500_000_000
HARD_MAX_DEFINITION_TRIANGLES = 2_000_000
HARD_MAX_SCENE_TRIANGLES = 12_000_000
CHUNK_TRIANGLES = 500_000
LINEAR_DEFLECTION_METRES = 0.0005
ANGULAR_DEFLECTION_RADIANS = 0.25
FEATURE_ANGLE_DEGREES = 60.0
HARD_MAX_ABSOLUTE_COORDINATE_METRES = 100.0
HARD_MIN_DIAGONAL_METRES = 1.0e-4
HARD_MAX_DIAGONAL_METRES = 200.0
SYSTEM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
WORKER_ENVIRONMENT_KEY = "FUSIONDIGITAL_EXL50U_BOUNDED_WORKER"


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def paths_overlap(first: Path, second: Path) -> bool:
    return first == second or is_within(first, second) or is_within(second, first)


def enclosing_git_checkout(path: Path) -> Path | None:
    for candidate in (path, *path.parents):
        if (candidate / ".git").exists():
            return candidate
    return None


def multiply_transform_matrices(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Multiply two 4x4 transforms without invoking an optional BLAS runtime."""

    if left.shape != (4, 4) or right.shape != (4, 4):
        raise RuntimeError("assembly transform matrices must be 4x4")
    result = np.empty((4, 4), dtype=np.float64)
    for row in range(4):
        for column in range(4):
            result[row, column] = sum(
                float(left[row, index]) * float(right[index, column]) for index in range(4)
            )
    if not np.isfinite(result).all():
        raise RuntimeError("non-finite coordinates were produced by an assembly transform")
    return result


def transformed_bounds(low: np.ndarray, high: np.ndarray, matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if matrix.shape != (4, 4):
        raise RuntimeError("assembly transform matrices must be 4x4")
    transformed = np.asarray(
        [
            [
                sum(float(matrix[row, column]) * float(value[column]) for column in range(4))
                for row in range(3)
            ]
            for value in (
                (x, y, z, 1.0)
                for x in (low[0], high[0])
                for y in (low[1], high[1])
                for z in (low[2], high[2])
            )
        ],
        dtype=np.float64,
    )
    if not np.isfinite(transformed).all():
        raise RuntimeError("non-finite coordinates were produced by an assembly transform")
    return transformed.min(axis=0), transformed.max(axis=0)


def validate_scene_bounds(
    low: np.ndarray,
    high: np.ndarray,
    maximum_absolute_coordinate_metres: float,
    minimum_diagonal_metres: float,
    maximum_diagonal_metres: float,
) -> dict[str, object]:
    if not np.isfinite(low).all() or not np.isfinite(high).all() or np.any(high < low):
        raise RuntimeError("scene bounds are invalid or non-finite")
    maximum_absolute = float(np.max(np.abs(np.concatenate((low, high)))))
    diagonal = float(np.linalg.norm(high - low))
    if maximum_absolute > maximum_absolute_coordinate_metres:
        raise RuntimeError(
            "scene bounds exceed the reviewed metre-scale absolute-coordinate limit "
            f"({maximum_absolute:.9g} > {maximum_absolute_coordinate_metres:.9g} m)"
        )
    if not minimum_diagonal_metres <= diagonal <= maximum_diagonal_metres:
        raise RuntimeError(
            "scene diagonal is outside the reviewed metre-scale range "
            f"({diagonal:.9g} m not in [{minimum_diagonal_metres:.9g}, "
            f"{maximum_diagonal_metres:.9g}])"
        )
    return {
        "min": low.tolist(),
        "max": high.tolist(),
        "diagonal": diagonal,
        "maximumAbsoluteCoordinate": maximum_absolute,
    }


def load_xcaf_occurrences(source: Path):
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.Interface import Interface_Static
    from OCP.STEPCAFControl import STEPCAFControl_Controller, STEPCAFControl_Reader
    from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
    from OCP.TDF import TDF_Label, TDF_LabelSequence, TDF_Tool
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_DocumentTool

    if not STEPCAFControl_Controller.Init_s():
        raise RuntimeError("failed to initialize the STEP-XCAF controller")
    if not Interface_Static.SetIVal_s("read.stepcaf.subshapes.name", 0):
        raise RuntimeError("failed to disable private STEP subshape names")
    if not Interface_Static.SetCVal_s("xstep.cascade.unit", "M"):
        raise RuntimeError("failed to normalize STEP coordinates to metres")
    if Interface_Static.IVal_s("read.stepcaf.subshapes.name") != 0:
        raise RuntimeError("private STEP subshape names remained enabled")
    effective_unit = Interface_Static.CVal_s("xstep.cascade.unit")
    if effective_unit != "M":
        raise RuntimeError(f"unexpected effective OCCT cascade unit: {effective_unit!r}")

    reader = STEPCAFControl_Reader()
    if Interface_Static.CVal_s("xstep.cascade.unit") != "M":
        raise RuntimeError("STEP reader construction reset the OCCT cascade unit")
    for mode in (
        "Color",
        "Name",
        "Layer",
        "SHUO",
        "Props",
        "Meta",
        "ProductMeta",
        "GDT",
        "Mat",
        "View",
    ):
        setter = getattr(reader, f"Set{mode}Mode", None)
        getter = getattr(reader, f"Get{mode}Mode", None)
        if not callable(setter) or not callable(getter):
            raise RuntimeError(f"OCP reader lacks the required fail-closed {mode} mode API")
        setter(False)
        if getter():
            raise RuntimeError(f"failed to disable private STEP {mode} mode")
    if reader.ReadFile(str(source)) != IFSelect_RetDone:
        raise RuntimeError("STEP ReadFile failed")
    document = TDocStd_Document(TCollection_ExtendedString("FusionDigital-System-Derivative"))
    if not reader.Transfer(document):
        raise RuntimeError("STEP XCAF transfer failed")
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())

    def entry(label) -> str:
        value = TCollection_AsciiString()
        TDF_Tool.Entry_s(label, value)
        return value.ToCString()

    def local_matrix(label) -> np.ndarray:
        transform = shape_tool.GetLocation_s(label).Transformation()
        matrix = np.eye(4, dtype=np.float64)
        for row in range(1, 4):
            for column in range(1, 5):
                matrix[row - 1, column - 1] = float(transform.Value(row, column))
        return matrix

    definitions: dict[str, object] = {}
    occurrences: list[tuple[str, np.ndarray]] = []

    def record_shape(label, world: np.ndarray) -> None:
        key = entry(label)
        definitions.setdefault(key, shape_tool.GetShape_s(label))
        occurrences.append((key, world))

    def walk_definition(definition, parent_world: np.ndarray, ancestry: frozenset[str]) -> None:
        definition_key = entry(definition)
        if definition_key in ancestry:
            raise RuntimeError(f"cyclic XCAF assembly reference at {definition_key}")
        child_ancestry = ancestry | {definition_key}
        components = TDF_LabelSequence()
        shape_tool.GetComponents_s(definition, components)
        if components.Length() == 0:
            record_shape(definition, parent_world)
            return
        for index in range(1, components.Length() + 1):
            occurrence = components.Value(index)
            world = multiply_transform_matrices(parent_world, local_matrix(occurrence))
            referred = TDF_Label()
            if shape_tool.IsReference_s(occurrence):
                shape_tool.GetReferredShape_s(occurrence, referred)
            else:
                referred = occurrence
            if shape_tool.IsAssembly_s(referred):
                walk_definition(referred, world, child_ancestry)
            else:
                record_shape(referred, world)

    free = TDF_LabelSequence()
    shape_tool.GetFreeShapes(free)
    if free.Length() == 0:
        raise RuntimeError("XCAF document contains no free shapes")
    for index in range(1, free.Length() + 1):
        root = free.Value(index)
        root_world = local_matrix(root)
        referred = TDF_Label()
        if shape_tool.IsReference_s(root):
            shape_tool.GetReferredShape_s(root, referred)
            root = referred
        if shape_tool.IsAssembly_s(root):
            walk_definition(root, root_world, frozenset())
        else:
            record_shape(root, root_world)
    return document, definitions, occurrences, effective_unit


def mesh_shape(shape: object, linear_deflection: float, angular_deflection: float, maximum_triangles: int):
    from cadquery import Shape
    from OCP.BRep import BRep_Tool
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.BRepTools import BRepTools
    from OCP.TopAbs import TopAbs_Orientation
    from OCP.TopLoc import TopLoc_Location
    import vtk
    import vtk.util.numpy_support as ns

    BRepTools.Clean_s(shape, True)
    BRepMesh_IncrementalMesh(shape, linear_deflection, False, angular_deflection, False)
    point_parts: list[np.ndarray] = []
    triangle_parts: list[np.ndarray] = []
    point_offset = 0
    triangle_count = 0
    for face in Shape.cast(shape).Faces():
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(face.wrapped, location)
        if triangulation is None:
            continue
        face_nodes = int(triangulation.NbNodes())
        face_triangles = int(triangulation.NbTriangles())
        if face_triangles <= 0:
            continue
        if face_nodes <= 0:
            BRepTools.Clean_s(shape, True)
            raise RuntimeError("a triangulated face reported triangles without nodes")
        if triangle_count + face_triangles > maximum_triangles:
            BRepTools.Clean_s(shape, True)
            raise RuntimeError(f"one definition exceeded the {maximum_triangles:,}-triangle safety limit")
        transform = location.Transformation()
        points = np.asarray(
            [
                tuple(triangulation.Node(index).Transformed(transform).Coord())
                for index in range(1, face_nodes + 1)
            ],
            dtype=np.float32,
        )
        triangles = np.asarray(
            [
                (triangle.Value(1), triangle.Value(2), triangle.Value(3))
                for triangle in triangulation.Triangles()
            ],
            dtype=np.int64,
        ) - 1
        if face.wrapped.Orientation() == TopAbs_Orientation.TopAbs_REVERSED:
            triangles = triangles[:, [0, 2, 1]]
        triangles += point_offset
        point_parts.append(points)
        triangle_parts.append(triangles)
        point_offset += len(points)
        triangle_count += len(triangles)
        if len(points) != face_nodes or len(triangles) != face_triangles:
            BRepTools.Clean_s(shape, True)
            raise RuntimeError("OCCT triangulation counts changed during extraction")
    BRepTools.Clean_s(shape, True)
    if not point_parts or not triangle_parts:
        raise RuntimeError("definition produced no renderable triangulation")
    positions = np.concatenate(point_parts)
    triangles = np.concatenate(triangle_parts)
    points = vtk.vtkPoints()
    points.SetData(ns.numpy_to_vtk(positions, deep=True))
    cells = vtk.vtkCellArray()
    offsets = np.arange(0, 3 * (len(triangles) + 1), 3, dtype=np.int64)
    cells.SetData(
        ns.numpy_to_vtkIdTypeArray(offsets, deep=True),
        ns.numpy_to_vtkIdTypeArray(triangles.ravel(), deep=True),
    )
    poly = vtk.vtkPolyData()
    poly.SetPoints(points)
    poly.SetPolys(cells)
    return poly


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("scratch", type=Path)
    parser.add_argument("--system-id", required=True)
    parser.add_argument("--role", choices=("preview", "high"), required=True)
    parser.add_argument("--audit", type=Path, required=True)
    args = parser.parse_args()

    if os.environ.get(WORKER_ENVIRONMENT_KEY) != "1":
        raise SystemExit("run this worker through run_system_build.py so memory and disk limits are enforced")
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    scratch = args.scratch.resolve()
    if not source.is_file() or source.suffix.lower() not in {".stp", ".step"}:
        raise SystemExit("source must be a regular .stp/.step file")
    if source.stat().st_size > HARD_MAX_SOURCE_BYTES:
        raise SystemExit(
            "refusing a monolithic/oversized STEP; export the approved top-level system first "
            f"({source.stat().st_size:,} > {HARD_MAX_SOURCE_BYTES:,} bytes)"
        )
    if not SYSTEM_ID_PATTERN.fullmatch(args.system_id):
        raise SystemExit("system-id must match ^[a-z0-9][a-z0-9-]*$")
    if output.suffix.lower() != ".glb":
        raise SystemExit("output must use the .glb extension")

    profile_path = Path(__file__).with_name("profile.public.json").resolve(strict=True)
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    matching_systems = [system for system in profile["systems"] if system["id"] == args.system_id]
    if len(matching_systems) != 1:
        raise SystemExit("system-id is outside the reviewed public profile")
    system = matching_systems[0]
    coordinate_system = profile.get("coordinateSystem", {})
    if (
        coordinate_system.get("linearUnit") != "metre"
        or coordinate_system.get("sourceUpAxis") != "Z"
        or coordinate_system.get("sourceHandedness") != "right"
        or coordinate_system.get("upAxis") != "Y"
        or coordinate_system.get("handedness") != "right"
        or coordinate_system.get("sourceToWebScale") != 1
    ):
        raise SystemExit("reviewed public profile contains an unsupported coordinate transform")
    node_name = str(system["nodeName"])
    color = str(system["color"])
    if node_name != f"EXL50U_GA_PART__{args.system_id}" or not COLOR_PATTERN.fullmatch(color):
        raise SystemExit("reviewed public profile contains an invalid system identity")
    target_triangles = int(system[f"{args.role}TriangleBudget"])
    expected_output_name = f"{args.system_id}.{args.role}.raw.glb"
    if output.name != expected_output_name:
        raise SystemExit(f"output filename must be {expected_output_name}")

    audit_path = args.audit.resolve(strict=True)
    try:
        audit = load_private_step_audit(audit_path)
        validate_private_step_audit_schema(
            audit,
            expected_public_system_id=args.system_id,
        )
        with source.open("rb") as stream:
            source_sha256, source_counts = scan_stream(stream)
        validate_private_step_audit(
            audit,
            expected_public_system_id=args.system_id,
            actual_source_bytes=source.stat().st_size,
            actual_source_sha256=source_sha256,
            actual_format=safe_format_facts(source),
            actual_counts=source_counts,
        )
    except PrivateStepAuditError as error:
        raise SystemExit(f"private source audit validation failed: {error}") from error
    audit_sha256 = sha256_file(audit_path)
    profile_sha256 = sha256_file(profile_path)

    for first_label, first, second_label, second in (
        ("source", source, "output", output),
        ("source", source, "scratch", scratch),
        ("audit", audit_path, "output", output),
        ("audit", audit_path, "scratch", scratch),
        ("output", output, "scratch", scratch),
    ):
        if paths_overlap(first, second):
            raise SystemExit(f"{first_label} and {second_label} paths cannot overlap")
    for label, path in (("source", source), ("audit", audit_path), ("output", output), ("scratch", scratch)):
        checkout = enclosing_git_checkout(path)
        if checkout is not None:
            raise SystemExit(f"{label} must stay outside every Git checkout: {checkout}")
    record_path = output.with_name(f"{args.system_id}.{args.role}.build.private.json")
    record_temporary = record_path.with_name(record_path.name + ".partial")
    staging_output = output.with_name(output.name + ".build-stage.glb")
    generated_candidates = (
        output,
        output.with_name(output.name + ".partial"),
        record_path,
        record_temporary,
        staging_output,
        staging_output.with_name(staging_output.name + ".partial"),
    )
    if any(candidate.exists() for candidate in generated_candidates):
        raise SystemExit("output, provenance record, or partial file already exists; refusing to overwrite it")
    if scratch.exists():
        if not scratch.is_dir():
            raise SystemExit("scratch must be a directory")
        if any(scratch.iterdir()):
            raise SystemExit("scratch must be an exclusive empty directory; use a new --run-id")
    scratch.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    document, definitions, occurrences, effective_unit = load_xcaf_occurrences(source)
    if not definitions or not occurrences:
        raise RuntimeError("XCAF transfer produced no renderable definitions or occurrences")
    occurrence_counts = Counter(key for key, _ in occurrences)
    by_definition: dict[str, list[np.ndarray]] = {}
    for key, matrix in occurrences:
        by_definition.setdefault(key, []).append(matrix)
    definition_records: dict[str, dict[str, object]] = {}
    scene_triangles = 0
    scene_low = np.full(3, np.inf, dtype=np.float64)
    scene_high = np.full(3, -np.inf, dtype=np.float64)

    for index, (key, shape) in enumerate(definitions.items(), 1):
        raw = mesh_shape(
            shape,
            LINEAR_DEFLECTION_METRES,
            ANGULAR_DEFLECTION_RADIANS,
            HARD_MAX_DEFINITION_TRIANGLES,
        )
        raw_triangles = int(raw.GetNumberOfPolys())
        weighted_triangles = raw_triangles * occurrence_counts[key]
        if scene_triangles + weighted_triangles > HARD_MAX_SCENE_TRIANGLES:
            raise RuntimeError(
                f"scene exceeded the {HARD_MAX_SCENE_TRIANGLES:,}-triangle pre-decimation safety limit "
                f"while processing definition {index} ({scene_triangles + weighted_triangles:,})"
            )
        scene_triangles += weighted_triangles
        bounds = raw.GetBounds()
        local_low = np.asarray((bounds[0], bounds[2], bounds[4]), dtype=np.float64)
        local_high = np.asarray((bounds[1], bounds[3], bounds[5]), dtype=np.float64)
        if not np.isfinite(local_low).all() or not np.isfinite(local_high).all():
            raise RuntimeError(f"definition {index} produced non-finite bounds")
        for matrix in by_definition[key]:
            occurrence_low, occurrence_high = transformed_bounds(local_low, local_high, matrix)
            scene_low = np.minimum(scene_low, occurrence_low)
            scene_high = np.maximum(scene_high, occurrence_high)
            partial_absolute = float(np.max(np.abs(np.concatenate((scene_low, scene_high)))))
            if partial_absolute > HARD_MAX_ABSOLUTE_COORDINATE_METRES:
                raise RuntimeError(
                    "scene bounds exceed the reviewed metre-scale absolute-coordinate limit "
                    f"while processing definition {index} "
                    f"({partial_absolute:.9g} > {HARD_MAX_ABSOLUTE_COORDINATE_METRES:.9g} m)"
                )
        path = scratch / "definitions-raw" / f"definition-{index:05d}.vtp"
        write_vtp(path, raw)
        definition_records[key] = {
            "rawPath": path,
            "rawTriangles": raw_triangles,
            "occurrences": occurrence_counts[key],
        }
        print(
            json.dumps(
                {
                    "stage": "mesh-definition",
                    "index": index,
                    "definitions": len(definitions),
                    "triangles": raw_triangles,
                    "weightedSceneTriangles": scene_triangles,
                }
            ),
            flush=True,
        )
    scene_bounds = validate_scene_bounds(
        scene_low,
        scene_high,
        HARD_MAX_ABSOLUTE_COORDINATE_METRES,
        HARD_MIN_DIAGONAL_METRES,
        HARD_MAX_DIAGONAL_METRES,
    )
    minimum_weighted_triangles = sum(
        min(4, int(record["rawTriangles"])) * int(record["occurrences"])
        for record in definition_records.values()
    )
    if minimum_weighted_triangles > target_triangles:
        raise RuntimeError(
            "the reviewed system budget cannot retain one valid triangle mesh per occurrence "
            f"({minimum_weighted_triangles:,} > {target_triangles:,})"
        )
    for record in definition_records.values():
        raw_triangles = int(record["rawTriangles"])
        proportional = math.floor(raw_triangles * target_triangles / max(1, scene_triangles))
        record["allocatedTriangles"] = max(min(4, raw_triangles), min(raw_triangles, proportional))
    allocated_weighted_triangles = sum(
        int(record["allocatedTriangles"]) * int(record["occurrences"])
        for record in definition_records.values()
    )
    excess = max(0, allocated_weighted_triangles - target_triangles)
    for record in sorted(definition_records.values(), key=lambda item: int(item["occurrences"]), reverse=True):
        if excess <= 0:
            break
        occurrences_for_definition = int(record["occurrences"])
        minimum = min(4, int(record["rawTriangles"]))
        reducible = int(record["allocatedTriangles"]) - minimum
        if reducible <= 0:
            continue
        reduction = min(reducible, math.ceil(excess / occurrences_for_definition))
        record["allocatedTriangles"] = int(record["allocatedTriangles"]) - reduction
        excess -= reduction * occurrences_for_definition
    if excess > 0:
        raise RuntimeError("unable to allocate the reviewed triangle budget across repeated definitions")

    for index, (key, record) in enumerate(definition_records.items(), 1):
        raw = read_vtp(record["rawPath"])
        definition_target = max(4, int(record["allocatedTriangles"]))
        simplified = clean_and_simplify(raw, definition_target, FEATURE_ANGLE_DEGREES)
        path = scratch / "definitions-simplified" / f"definition-{index:05d}.vtp"
        write_vtp(path, simplified)
        record["simplifiedPath"] = path
        record["simplifiedTriangles"] = int(simplified.GetNumberOfPolys())

    simplified_scene_triangles = sum(
        int(record["simplifiedTriangles"]) * int(record["occurrences"])
        for record in definition_records.values()
    )
    if simplified_scene_triangles > target_triangles:
        raise RuntimeError(
            "definition-local QEM did not meet the reviewed system budget; refusing a second QEM pass "
            f"({simplified_scene_triangles:,} > {target_triangles:,})"
        )

    chunks: list[Path] = []
    pending: list[object] = []
    pending_triangles = 0

    def flush_chunk() -> None:
        nonlocal pending, pending_triangles
        if not pending:
            return
        merged = append_polys(pending)
        # Chunk cleanup removes only invalid or duplicate delivered-Float32
        # triangles. The reviewed QEM pass already happened once per
        # definition; chunking must not apply another geometric reduction.
        reduced = clean_and_simplify(merged, max(4, pending_triangles), FEATURE_ANGLE_DEGREES)
        path = scratch / "chunks" / f"chunk-{len(chunks):04d}.vtp"
        write_vtp(path, reduced)
        chunks.append(path)
        pending = []
        pending_triangles = 0
        gc.collect()

    for key, matrices in by_definition.items():
        base = read_vtp(definition_records[key]["simplifiedPath"])
        for matrix in matrices:
            transformed = transform_poly(base, matrix)
            pending.append(transformed)
            pending_triangles += int(transformed.GetNumberOfPolys())
            if pending_triangles >= CHUNK_TRIANGLES:
                flush_chunk()
    flush_chunk()

    merged = append_polys([read_vtp(path) for path in chunks])
    merged_triangles = int(merged.GetNumberOfPolys())
    final_poly = clean_and_simplify(merged, max(4, merged_triangles), FEATURE_ANGLE_DEGREES)
    final_triangles = int(final_poly.GetNumberOfPolys())
    if final_triangles > target_triangles:
        raise RuntimeError(
            f"final cleanup exceeded the reviewed triangle budget "
            f"({final_triangles:,} > {target_triangles:,})"
        )
    final_poly = web_axis_transform(final_poly)
    predicted_decoded_bytes = int(final_poly.GetNumberOfPoints()) * 24 + final_triangles * 12
    if args.role == "high" and predicted_decoded_bytes > int(system["highDecodedGpuByteBudget"]):
        raise RuntimeError("system high LOD exceeded its reviewed decoded GPU budget")
    published_output = False
    try:
        stats = write_raw_glb(staging_output, [MeshAsset(node_name, color, final_poly)])
        if stats["decodedGpuBytes"] != predicted_decoded_bytes:
            raise RuntimeError("system artifact decoded-memory accounting changed unexpectedly")
        build_record = {
            "schemaVersion": "fusiondigital.exl50u-system-derivative-build.v1",
            "systemId": args.system_id,
            "role": args.role,
            "profile": {
                "bytes": profile_path.stat().st_size,
                "sha256": profile_sha256,
            },
            "audit": {
                "bytes": audit_path.stat().st_size,
                "sha256": audit_sha256,
            },
            "source": {
                "bytes": source.stat().st_size,
                "sha256": source_sha256,
            },
            "parameters": {
                "linearDeflectionMetres": LINEAR_DEFLECTION_METRES,
                "angularDeflectionRadians": ANGULAR_DEFLECTION_RADIANS,
                "featureAngleDegrees": FEATURE_ANGLE_DEGREES,
                "targetTriangles": target_triangles,
                "qemPassesPerDefinition": 1,
                "effectiveCascadeUnit": effective_unit,
                "boundsGate": {
                    "maximumAbsoluteCoordinateMetres": HARD_MAX_ABSOLUTE_COORDINATE_METRES,
                    "minimumDiagonalMetres": HARD_MIN_DIAGONAL_METRES,
                    "maximumDiagonalMetres": HARD_MAX_DIAGONAL_METRES,
                },
            },
            "privateInventory": {
                "definitions": len(definitions),
                "occurrences": len(occurrences),
                "rawSceneTriangles": scene_triangles,
                "simplifiedSceneTriangles": simplified_scene_triangles,
                "sourceSceneBoundsMetres": scene_bounds,
                "chunks": len(chunks),
            },
            "artifact": {"basename": output.name, **stats},
            "seconds": round(time.perf_counter() - started, 3),
        }
        record_temporary.write_text(
            json.dumps(build_record, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if output.exists() or record_path.exists():
            raise RuntimeError("output destination appeared during the build; refusing to replace it")
        staging_output.rename(output)
        published_output = True
        record_temporary.rename(record_path)
    except BaseException:
        staging_output.unlink(missing_ok=True)
        staging_output.with_name(staging_output.name + ".partial").unlink(missing_ok=True)
        record_temporary.unlink(missing_ok=True)
        if published_output:
            output.unlink(missing_ok=True)
        raise
    print(json.dumps({"artifact": stats, "seconds": build_record["seconds"]}), flush=True)
    _ = document


if __name__ == "__main__":
    main()
