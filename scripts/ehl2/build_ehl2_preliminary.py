#!/usr/bin/env python3
"""Build the public EHL-2 preliminary browser visualization derivative.

The five user-provided GLBs share one millimetre-based assembly origin.  This
pipeline bakes their node transforms into metres, preserves six selectable
parts, removes invalid/degenerate faces, and reduces each part to about 50% of
its source triangle count before Meshopt transport compression.

Required Python packages:
  trimesh==4.8.3 fast-simplification==0.1.12 numpy>=2.0 scipy>=1.14
Required Node packages are pinned in the repository package.json.

The source GLBs are controlled inputs and are never copied into the website.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals


GLTF_TRANSFORM_VERSION = "4.4.2"
TARGET_FACE_RATIO = 0.5


@dataclass(frozen=True)
class SourceAsset:
    filename: str
    bytes: int
    sha256: str


@dataclass(frozen=True)
class PartSpec:
    source: str
    stable_name: str
    source_rank_by_faces: int | None
    color: tuple[int, int, int, int]


SOURCES = {
    item.filename: item
    for item in (
        SourceAsset("VV.glb", 23_913_500, "65E19914C4276CFE135498DABF8730664A9348719126F519092E9F7F65748FCF"),
        SourceAsset("CenterPost.glb", 12_929_492, "692D0EF9F9DE767FA196AA848F481DE5BB701B2BFE179A9DDBAFA20C5273CD59"),
        SourceAsset("Divertor.glb", 6_927_136, "1562DE6E267318FE17BFAE7E17084FF463EFE13F3DF36F514B0AED8DF1ECB016"),
        SourceAsset("bowenguan.glb", 159_767_060, "BB89D72737AD651ACC53275ADC452352870046904DC6FF157D3EBDBE8E3AD7ED"),
        SourceAsset("duwa.glb", 165_630_580, "C43A21B0619FBD8603EAEC7CF86C159867A4280CD7BA5DB2201BFE06766C3E06"),
    )
}


PARTS = (
    PartSpec("VV.glb", "EHL2_PART__vacuum-vessel", 0, (174, 184, 188, 255)),
    PartSpec("VV.glb", "EHL2_PART__fixed-limiter", 1, (207, 124, 71, 255)),
    PartSpec("CenterPost.glb", "EHL2_PART__center-post", None, (190, 126, 77, 255)),
    PartSpec("Divertor.glb", "EHL2_PART__divertor", None, (218, 104, 55, 255)),
    PartSpec("bowenguan.glb", "EHL2_PART__bellows", None, (154, 169, 176, 255)),
    PartSpec("duwa.glb", "EHL2_PART__dewar", None, (116, 133, 142, 255)),
)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def validate_sources(source_dir: pathlib.Path) -> None:
    actual_files = {path.name for path in source_dir.iterdir() if path.is_file()}
    missing = set(SOURCES) - actual_files
    if missing:
        raise RuntimeError(f"missing controlled source assets: {sorted(missing)}")
    for name, contract in SOURCES.items():
        path = source_dir / name
        if path.stat().st_size != contract.bytes:
            raise RuntimeError(f"{name}: byte length does not match the reviewed source contract")
        if sha256(path) != contract.sha256:
            raise RuntimeError(f"{name}: SHA-256 does not match the reviewed source contract")


def source_mesh(scene: trimesh.Scene, spec: PartSpec) -> trimesh.Trimesh:
    nodes = list(scene.graph.nodes_geometry)
    if not nodes:
        raise RuntimeError(f"{spec.source}: no renderable geometry nodes")
    if spec.source_rank_by_faces is not None:
        nodes.sort(
            key=lambda node: len(scene.geometry[scene.graph.get(node)[1]].faces),
            reverse=True,
        )
        if spec.source_rank_by_faces >= len(nodes):
            raise RuntimeError(f"{spec.source}: expected geometry rank is missing")
        node = nodes[spec.source_rank_by_faces]
    else:
        if len(nodes) != 1:
            raise RuntimeError(f"{spec.source}: expected exactly one geometry node")
        node = nodes[0]

    transform, geometry_name = scene.graph.get(node)
    mesh = scene.geometry[geometry_name].copy()
    if not isinstance(mesh, trimesh.Trimesh):
        raise RuntimeError(f"{spec.source}: selected geometry is not a triangle mesh")
    mesh.apply_transform(transform)
    return mesh


def remove_duplicate_coordinate_faces(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, int]:
    coordinate_ids = np.unique(mesh.vertices, axis=0, return_inverse=True)[1]
    canonical = np.sort(coordinate_ids[mesh.faces], axis=1)
    _, first_indices = np.unique(canonical, axis=0, return_index=True)
    keep = np.zeros(len(mesh.faces), dtype=bool)
    keep[first_indices] = True
    removed = int(np.count_nonzero(~keep))
    if removed:
        mesh.update_faces(keep)
        mesh.remove_unreferenced_vertices()
    return mesh, removed


def remove_float32_delivery_artifacts(
    mesh: trimesh.Trimesh,
) -> tuple[trimesh.Trimesh, dict[str, int]]:
    """Remove faces that fail the browser's delivered-Float32 geometry gate.

    glTF stores the retained positions as Float32.  Perform the same rounding,
    scale-relative area test, and coordinate-identity duplicate test used by
    the Three.js runtime QA before exporting.  This removes only triangles
    that would be unusable after delivery; it does not simplify valid detail.
    """

    removed_degenerate = 0
    removed_duplicate = 0
    passes = 0
    for _ in range(4):
        passes += 1
        positions = np.asarray(mesh.vertices, dtype=np.float32).astype(np.float64)
        mesh.vertices = positions
        faces = np.asarray(mesh.faces, dtype=np.int64)
        if len(faces) == 0:
            raise RuntimeError("Float32 cleanup removed every triangle")

        bounds_min = positions.min(axis=0)
        bounds_max = positions.max(axis=0)
        diagonal_squared = float(np.sum((bounds_max - bounds_min) ** 2))
        area_threshold_squared = max(diagonal_squared * 1e-12, 1e-18) ** 2

        a = positions[faces[:, 0]]
        ab = positions[faces[:, 1]] - a
        ac = positions[faces[:, 2]] - a
        cross = np.cross(ab, ac)
        cross_squared = np.einsum("ij,ij->i", cross, cross)
        degenerate = cross_squared <= area_threshold_squared

        coordinate_ids = np.unique(positions, axis=0, return_inverse=True)[1]
        canonical = np.sort(coordinate_ids[faces], axis=1)
        _, first_indices = np.unique(canonical, axis=0, return_index=True)
        duplicate = np.ones(len(faces), dtype=bool)
        duplicate[first_indices] = False

        removed_degenerate += int(np.count_nonzero(degenerate))
        removed_duplicate += int(np.count_nonzero(duplicate & ~degenerate))
        rejected = degenerate | duplicate
        if not np.any(rejected):
            break
        mesh.update_faces(~rejected)
        mesh.remove_unreferenced_vertices()
    else:
        raise RuntimeError("Float32 delivery cleanup did not converge")

    return mesh, {
        "removedFloat32DegenerateTriangles": removed_degenerate,
        "removedFloat32DuplicateTriangles": removed_duplicate,
        "float32CleanupPasses": passes,
    }


def derive_part(mesh: trimesh.Trimesh, spec: PartSpec) -> tuple[trimesh.Trimesh, dict[str, Any]]:
    if not np.isfinite(mesh.vertices).all():
        raise RuntimeError(f"{spec.stable_name}: source positions are not finite")
    original_vertices = len(mesh.vertices)
    original_faces = len(mesh.faces)
    if original_faces == 0:
        raise RuntimeError(f"{spec.stable_name}: source mesh has no triangles")

    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    mesh.merge_vertices()
    mesh.remove_unreferenced_vertices()
    welded_vertices = len(mesh.vertices)

    target_faces = max(4, math.floor(original_faces * TARGET_FACE_RATIO))
    if len(mesh.faces) > target_faces:
        mesh = mesh.simplify_quadric_decimation(
            face_count=target_faces,
            aggression=5,
        )

    before_degenerate_cleanup = len(mesh.faces)
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    removed_degenerate = before_degenerate_cleanup - len(mesh.faces)
    mesh, removed_duplicate = remove_duplicate_coordinate_faces(mesh)
    mesh, float32_cleanup = remove_float32_delivery_artifacts(mesh)
    mesh.fix_normals(multibody=True)
    if len(mesh.faces) > math.ceil(original_faces * 0.505):
        raise RuntimeError(
            f"{spec.stable_name}: derivative retained more than 50.5% of source triangles"
        )
    if not np.isfinite(mesh.vertices).all() or not np.isfinite(mesh.vertex_normals).all():
        raise RuntimeError(f"{spec.stable_name}: derived geometry is not finite")

    material = PBRMaterial(
        name=f"{spec.stable_name}__material",
        baseColorFactor=np.asarray(spec.color, dtype=np.uint8),
        metallicFactor=0.15,
        roughnessFactor=0.55,
        doubleSided=True,
    )
    mesh.visual = TextureVisuals(material=material)

    return mesh, {
        "stableNode": spec.stable_name,
        "sourceFile": spec.source,
        "sourceVertices": original_vertices,
        "sourceTriangles": original_faces,
        "weldedVertices": welded_vertices,
        "derivedVertices": len(mesh.vertices),
        "derivedTriangles": len(mesh.faces),
        "triangleRetention": len(mesh.faces) / original_faces,
        "geometryCleanup": {
            "removedDegenerateTriangles": removed_degenerate,
            "removedDuplicateTriangles": removed_duplicate,
            **float32_cleanup,
        },
        "boundsMetres": {
            "min": [float(value) for value in mesh.bounds[0]],
            "max": [float(value) for value in mesh.bounds[1]],
        },
    }


def run_meshopt(raw_path: pathlib.Path, final_path: pathlib.Path) -> None:
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("node executable was not found")
    compressor = pathlib.Path(__file__).with_name("meshopt_float_position.mjs")
    if not compressor.is_file():
        raise RuntimeError("EHL-2 Meshopt compressor script was not found")
    command = [
        node,
        str(compressor),
        str(raw_path),
        str(final_path),
    ]
    subprocess.run(command, check=True)


def build(source_dir: pathlib.Path, output_dir: pathlib.Path, keep_intermediate: bool) -> None:
    validate_sources(source_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = output_dir / "ehl2-preliminary.raw.glb"
    final_path = output_dir / "ehl2-preliminary.meshopt.glb"
    record_path = output_dir / "build-record.json"

    scene_cache: dict[str, trimesh.Scene] = {}
    result = trimesh.Scene(base_frame="EHL2_WEB_METRES")
    part_records: list[dict[str, Any]] = []
    for spec in PARTS:
        if spec.source not in scene_cache:
            scene_cache[spec.source] = trimesh.load_scene(
                source_dir / spec.source,
                process=False,
            )
        derived, record = derive_part(source_mesh(scene_cache[spec.source], spec), spec)
        result.add_geometry(
            derived,
            node_name=spec.stable_name,
            geom_name=spec.stable_name,
        )
        part_records.append(record)
        print(json.dumps(record, ensure_ascii=False), flush=True)

    raw_path.write_bytes(result.export(file_type="glb"))
    run_meshopt(raw_path, final_path)
    if not final_path.is_file() or final_path.stat().st_size == 0:
        raise RuntimeError("Meshopt output was not created")

    record = {
        "schemaVersion": "fusiondigital.ehl2.public-derivative-build.v1",
        "sourceContract": [
            {
                "filename": item.filename,
                "bytes": item.bytes,
                "sha256": item.sha256,
            }
            for item in SOURCES.values()
        ],
        "pipeline": {
            "trimesh": trimesh.__version__,
            "fastSimplification": "0.1.12",
            "gltfTransform": GLTF_TRANSFORM_VERSION,
            "triangleRetentionTarget": TARGET_FACE_RATIO,
            "positionEncoding": "Float32 (not quantized, preserving thin preliminary-CAD sheets)",
            "normalQuantizationBits": 8,
            "meshoptEncoderMethod": "FILTER",
            "recentered": False,
        },
        "parts": part_records,
        "totals": {
            "sourceTriangles": sum(item["sourceTriangles"] for item in part_records),
            "derivedTriangles": sum(item["derivedTriangles"] for item in part_records),
            "derivedVertices": sum(item["derivedVertices"] for item in part_records),
            "triangleRetention": (
                sum(item["derivedTriangles"] for item in part_records)
                / sum(item["sourceTriangles"] for item in part_records)
            ),
            "boundsMetres": {
                "min": [float(value) for value in result.bounds[0]],
                "max": [float(value) for value in result.bounds[1]],
            },
        },
        "artifact": {
            "filename": final_path.name,
            "bytes": final_path.stat().st_size,
            "sha256": sha256(final_path),
            "format": (
                "glTF 2.0 binary + EXT_meshopt_compression; "
                "POSITION Float32; NORMAL normalized Int8"
            ),
        },
    }
    record_path.write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not keep_intermediate:
        raw_path.unlink()
    print(json.dumps(record["totals"], ensure_ascii=False), flush=True)
    print(json.dumps(record["artifact"], ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=pathlib.Path)
    parser.add_argument("output_dir", type=pathlib.Path)
    parser.add_argument("--keep-intermediate", action="store_true")
    args = parser.parse_args()
    build(args.source_dir.resolve(), args.output_dir.resolve(), args.keep_intermediate)


if __name__ == "__main__":
    main()
