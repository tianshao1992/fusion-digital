"""Build an 18-shard private high-detail ITER education package.

Each stable ITER part is reduced independently, encoded as one Meshopt GLB,
and referenced from a hash-addressed private manifest.  Source STEP is never
copied or parsed by this pipeline; it consumes the 17 reviewed private GLBs
and the exact selective-OCC divertor derivative used by the preview builder.

Nothing here writes to ``public/``.  A separate integration review is required.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import build_private_iter_preview as base  # noqa: E402


TOOL_VERSION = "0.9.0"
DEFAULT_CANDIDATE_ID = "iter-high-detail-sharded-v1"
DEFAULT_MAX_SHARD_BYTES = 24 * 1024 * 1024
DEFAULT_MAX_TOTAL_BYTES = 110_000_000
MAX_MESH_INSTANCES_PER_SHARD = 300
MAX_MESH_INSTANCES_TOTAL = 1_000
# The 7.50M-triangle cold build transferred 7.85 bytes/triangle.  Use a
# slightly conservative planning factor; actual 80–110 MB and per-shard gates
# remain authoritative and never rely on this estimate.
EMPIRICAL_BYTES_PER_TRIANGLE = 8.25
ESTIMATE_OVERHEAD_PER_SHARD = 64 * 1024
RUNTIME_QA_SCRIPT = SCRIPT_DIR / "qa_meshopt_runtime.mjs"

# Detail policy: retain every triangle for already-small education parts and
# devote the remaining budget to the visually dense cryostat/vessel systems.
# Total target = 12,280,970 triangles; real geometry, never transfer padding.
HIGH_TARGETS: dict[str, int] = {
    "cs": 1_000_000,
    "pf1": 53_777,
    "pf2": 264_156,
    "pf3": 256_158,
    "pf4": 331_588,
    "pf5": 139_694,
    "pf6": 155_666,
    "tf-a": 54_712,
    "tf-b": 58_313,
    "cryostat-base": 300_000,
    "cryostat-lower": 2_200_000,
    "cryostat-top": 173_254,
    "cryostat-upper": 2_100_000,
    "divertor": 293_652,
    "vv1": 1_200_000,
    "vv2": 1_200_000,
    "vv3": 1_300_000,
    "vv4": 1_200_000,
}


def default_paths() -> tuple[Path, Path]:
    repo_root = Path(__file__).resolve().parents[2]
    task_root = repo_root.parent.parent
    return (
        task_root / "work" / "iter-cad-private",
        task_root / "work" / "tokamak-cad-demo" / ".venv" / "Scripts" / "python.exe",
    )


def load_inputs(private_root: Path) -> dict[str, Any]:
    package_path = private_root / "local-viewer" / "local-device-package.json"
    inventory_path = private_root / "conversion-agent-inventory.private.json"
    divertor_root = private_root / "derived-candidates" / "divertor-device-frame"
    divertor_report_path = divertor_root / "occ-recovery.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    divertor_report = json.loads(divertor_report_path.read_text(encoding="utf-8"))
    components = package.get("components", [])
    inventory_by_id = {str(item["id"]): item for item in inventory.get("components", [])}
    component_ids = {str(item["id"]) for item in components}
    if len(components) != 18 or len(component_ids) != 18 or set(HIGH_TARGETS) != component_ids:
        raise RuntimeError("Package, target policy and stable identity contract must contain the same 18 parts")
    if set(inventory_by_id) != component_ids:
        raise RuntimeError("Private conversion inventory does not match the 18-part package")
    divertor_mesh = divertor_report.get("coarseStl", {})
    divertor_source = (divertor_root / str(divertor_mesh.get("fileName", ""))).resolve()
    divertor_valid = (
        divertor_source.is_file()
        and divertor_source.is_relative_to((private_root / "derived-candidates").resolve())
        and divertor_source.stat().st_size == int(divertor_mesh.get("bytes", -1))
        and base.sha256(divertor_source).lower() == str(divertor_mesh.get("sha256", "")).lower()
        and int(divertor_mesh.get("triangles", -1)) == HIGH_TARGETS["divertor"]
        and divertor_report.get("validation", {}).get("sourceHash") == "PASS"
        and bool(divertor_report.get("validation", {}).get("assemblyMatricesFromConflictFreeStreamingGraph"))
        and float(divertor_mesh.get("maxBoundDeltaMetres", math.inf)) <= 0.01
    )
    if not divertor_valid:
        raise RuntimeError("Exact device-frame divertor derivative failed source, registration or bounds gates")
    return {
        "packagePath": package_path,
        "inventoryPath": inventory_path,
        "divertorReportPath": divertor_report_path,
        "divertorMonitorPath": divertor_root / "selective-resource-monitor.jsonl",
        "package": package,
        "inventory": inventory,
        "inventoryById": inventory_by_id,
        "components": components,
        "divertorReport": divertor_report,
        "divertorSource": divertor_source,
    }


def source_contract(
    private_root: Path,
    item: dict[str, Any],
    inventory_item: dict[str, Any],
    inputs: dict[str, Any],
) -> dict[str, Any]:
    part_id = str(item["id"])
    if part_id == base.DIVERTOR_ID:
        report = inputs["divertorReport"]
        mesh = report["coarseStl"]
        source_min, source_max = mesh["boundsMetres"]
        return {
            "source": inputs["divertorSource"],
            "inputFormat": "stl",
            "coordinateMap": "cad-z-up-to-web-y-up",
            "expectedBoundsMetres": {
                "min": [source_min[0], source_min[2], -source_max[1]],
                "max": [source_max[0], source_max[2], -source_min[1]],
            },
            "record": {
                "path": base.relative_posix(inputs["divertorSource"], private_root),
                "bytes": int(mesh["bytes"]),
                "sha256": str(mesh["sha256"]).upper(),
                "triangles": int(mesh["triangles"]),
                "coordinateRegistration": {
                    "coordinateMap": "CAD metre Z-up (x,y,z) -> web metre Y-up (x,z,-y)",
                    "evidenceReport": base.relative_posix(inputs["divertorReportPath"], private_root),
                    "maxBoundDeltaMetres": float(mesh["maxBoundDeltaMetres"]),
                },
            },
        }
    derived = inventory_item.get("derived")
    registration = inventory_item.get("coordinateRegistration", {}).get("transform")
    if not isinstance(derived, dict) or registration is None:
        raise RuntimeError(f"Part {part_id} has no reviewed private derivative/registration")
    source = Path(str(derived["path"])).resolve()
    if not source.is_file() or not source.is_relative_to((private_root / "derived").resolve()):
        raise FileNotFoundError(f"Part {part_id} source is missing or outside the private derived root")
    if (
        source.stat().st_size != int(derived["bytes"])
        or base.sha256(source).lower() != str(derived["sha256"]).lower()
        or int(item["bytes"]) != int(derived["bytes"])
        or str(item["derivativeSha256"]).lower() != str(derived["sha256"]).lower()
        or int(item["triangles"]) != int(derived["triangles"])
    ):
        raise RuntimeError(f"Part {part_id} package/inventory/source identity mismatch")
    return {
        "source": source,
        "inputFormat": "glb",
        "coordinateMap": "identity",
        "expectedBoundsMetres": derived["boundsMetres"],
        "record": {
            "path": base.relative_posix(source, private_root),
            "bytes": int(derived["bytes"]),
            "sha256": str(derived["sha256"]).upper(),
            "triangles": int(derived["triangles"]),
            "coordinateRegistration": inventory_item["coordinateRegistration"],
        },
    }


def planned_parts(inputs: dict[str, Any]) -> list[dict[str, Any]]:
    inventory_by_id = inputs["inventoryById"]
    divertor_triangles = int(inputs["divertorReport"]["coarseStl"]["triangles"])
    result: list[dict[str, Any]] = []
    for item in inputs["components"]:
        part_id = str(item["id"])
        source_triangles = (
            divertor_triangles
            if part_id == base.DIVERTOR_ID
            else int(inventory_by_id[part_id]["derived"]["triangles"])
        )
        target = min(source_triangles, HIGH_TARGETS[part_id])
        estimated = int(math.ceil(target * EMPIRICAL_BYTES_PER_TRIANGLE + ESTIMATE_OVERHEAD_PER_SHARD))
        result.append({
            "partId": part_id,
            "stableNode": f"{base.STABLE_NODE_PREFIX}{part_id}",
            "nodeName": f"{base.STABLE_NODE_PREFIX}{part_id}",
            "name": item["name"],
            "nameZh": item.get("nameZh"),
            "system": item.get("system"),
            "loadTier": int(item.get("loadTier", 4)),
            "sourceTriangles": source_triangles,
            "targetTriangles": target,
            "retainedPercent": round(target / source_triangles * 100, 3),
            "estimatedTransferBytes": estimated,
            "estimatedTransferMiB": round(estimated / (1024 * 1024), 3),
            "shardPath": f"shards/{part_id}.high.meshopt.glb",
        })
    return result


def write_plan(candidate: Path, private_root: Path, inputs: dict[str, Any], max_shard_bytes: int) -> dict[str, Any]:
    parts = planned_parts(inputs)
    total_target = sum(int(item["targetTriangles"]) for item in parts)
    total_estimated = sum(int(item["estimatedTransferBytes"]) for item in parts)
    largest = max(parts, key=lambda item: int(item["estimatedTransferBytes"]))
    plan = {
        "schemaVersion": "fusiondigital.iter.high-shard-plan.v1",
        "candidateId": candidate.name,
        "status": "PRIVATE_BUILD_PLAN_NO_PUBLIC_WRITES",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": {
            "inventoryPath": base.relative_posix(inputs["inventoryPath"], private_root),
            "inventorySha256": base.sha256(inputs["inventoryPath"]),
            "packagePath": base.relative_posix(inputs["packagePath"], private_root),
            "packageSha256": base.sha256(inputs["packagePath"]),
            "sourceGlbCount": 17,
            "exactSelectiveOccDivertorCount": 1,
            "sourceStepCopiedOrParsed": False,
        },
        "targets": {
            "parts": 18,
            "shards": 18,
            "triangles": total_target,
            "estimatedTransferBytes": total_estimated,
            "estimatedTransferMB": round(total_estimated / 1_000_000, 3),
            "estimatedTransferMiB": round(total_estimated / (1024 * 1024), 3),
            "maxShardBytesExclusive": max_shard_bytes,
            "largestEstimatedShard": largest["partId"],
            "largestEstimatedShardMiB": largest["estimatedTransferMiB"],
        },
        "compressionEstimate": {
            "basisCandidate": "iter-full-device-preview-v1",
            "observedBytes": 5_149_964,
            "observedTriangles": 399_499,
            "bytesPerTriangle": EMPIRICAL_BYTES_PER_TRIANGLE,
            "fixedOverheadPerShardBytes": ESTIMATE_OVERHEAD_PER_SHARD,
            "note": "Estimate only; every emitted GLB is subject to the actual 24 MiB hard gate.",
        },
        "parts": parts,
        "runtimeContract": {
            "bootstrap": "The component-only manifest exposes no compact fallback geometry.",
            "activation": "Activating the ITER viewer starts the sole reviewed 18-shard high-detail bundle.",
            "swap": "Show a loading state and present the high scene only after all 18 shards pass byte, SHA-256, identity and parse checks.",
            "queue": "Use one concurrent transfer on lower-memory devices and at most two otherwise; AbortController cancels the complete bundle when the viewer is left or reset.",
            "residency": "The selected high mode keeps the complete reviewed bundle resident; no per-part LRU or proximity streaming is claimed in version 1.",
            "cache": "Use content-hashed immutable HTTP URLs and release CPU ArrayBuffers after parsing.",
            "fallback": "Any shard failure disposes the partial bundle and exposes an explicit retryable error; no unreviewed fallback geometry is substituted.",
        },
        "hardGates": [
            "exactly 18 unique stable ITER_PART__ IDs",
            "every shard strictly below 24 MiB",
            "total package no more than 110,000,000 bytes",
            "every shard and the total package retain at least 95% of their stated high-detail triangle targets",
            "EXT_meshopt_compression and KHR_mesh_quantization required",
            "finite positions/normals, valid indices, zero degenerate and duplicate triangles after decode/dequantize",
            "bounds remain within the preview builder's reviewed per-part tolerance",
            "no mesh is shared across stable part identities",
        ],
    }
    base.atomic_write_json(candidate / "plan.candidate.json", plan)
    rows = "\n".join(
        f"| `{item['partId']}` | {item['sourceTriangles']:,} | {item['targetTriangles']:,} | "
        f"{item['retainedPercent']:.1f}% | {item['estimatedTransferMiB']:.2f} MiB |"
        for item in parts
    )
    report = f"""# ITER high-detail sharded private candidate plan

Status: private build plan; no public asset writes, commits or deployment.

The existing 17 registered uncompressed GLBs and the exact selective-OCC
divertor derivative can be repacked directly. No STEP parsing is required.
The package uses one independently cacheable Meshopt GLB per stable part ID.

| Part | Source triangles | High target | Retained | Estimated transfer |
|---|---:|---:|---:|---:|
{rows}

Total target: **{total_target:,} triangles** across **18 shards**. Estimated
transfer: **{total_estimated / 1_000_000:.1f} MB**
({total_estimated / (1024 * 1024):.1f} MiB). Largest estimated shard:
`{largest['partId']}` at {largest['estimatedTransferMiB']:.1f} MiB; the actual
builder rejects any shard at or above {max_shard_bytes / (1024 * 1024):.0f} MiB.

Expected generation time on the current workstation is 15–35 minutes for a
cold sequential build, plus 5–10 minutes for decoded geometry QA. The build is
resumable per part and recursively monitors each worker process tree.

Runtime policy: activation shows a loading state, fetches the complete 18-shard
bundle with one or two concurrent transfers, and presents the high scene only
after every shard passes verification. Any failure disposes the partial bundle
and exposes a retryable error. No compact fallback geometry, per-part LRU, or
proximity streaming is claimed in version 1.
"""
    (candidate / "REPORT.private.md").write_text(report, encoding="utf-8")
    return plan


def resumable_shard(
    record_path: Path,
    final: Path,
    target: int,
    source_record: dict[str, Any],
    coordinate_map: str,
    feature_angle: float,
    max_shard_bytes: int,
) -> dict[str, Any] | None:
    if not record_path.is_file() or not final.is_file():
        return None
    try:
        record = json.loads(record_path.read_text(encoding="utf-8"))
        fingerprint = record["buildFingerprint"]
        current_orchestrator_sha = base.sha256(Path(__file__).resolve())
        current_base_builder_sha = base.sha256(Path(base.__file__).resolve())
        if (
            str(fingerprint["pipelineVersion"]) != TOOL_VERSION
            or int(fingerprint["targetTriangles"]) != target
            or str(fingerprint.get("sourceSha256", "")).upper() != str(source_record["sha256"]).upper()
            or int(fingerprint.get("sourceBytes", -1)) != int(source_record["bytes"])
            or str(fingerprint.get("coordinateMap", "")) != coordinate_map
            or fingerprint.get("coordinateRegistration") != source_record.get("coordinateRegistration")
            or float(fingerprint.get("featureAngleDegrees", math.nan)) != float(feature_angle)
            or int(fingerprint.get("maximumShardBytesExclusive", -1)) != int(max_shard_bytes)
            or str(fingerprint.get("runtimeQaScriptSha256", "")).upper() != base.sha256(RUNTIME_QA_SCRIPT)
            or record.get("source") != source_record
            or int(record["artifact"]["bytes"]) != final.stat().st_size
            or final.stat().st_size >= max_shard_bytes
            or str(record["artifact"]["sha256"]).upper() != base.sha256(final)
            or int(record["artifact"]["triangles"]) < math.ceil(0.95 * target)
            or record["qualityGates"]["decodedGeometry"] != "PASS"
            or any(value != "PASS" for value in record["qualityGates"].values())
            or str(fingerprint.get("orchestratorSha256", "")).upper() != current_orchestrator_sha
            or str(fingerprint.get("baseBuilderSha256", "")).upper() != current_base_builder_sha
        ):
            return None
        return record
    except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError):
        return None


def production_runtime_geometry_qa(path: Path, log_path: Path) -> dict[str, Any]:
    """Decode with the product's Three.js + Meshopt path and keep Int16 exactness."""
    completed = subprocess.run(
        ["node", str(RUNTIME_QA_SCRIPT), str(path)],
        cwd=SCRIPT_DIR.parents[1],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
        check=False,
    )
    log_path.write_text(
        completed.stdout + ("\nSTDERR\n" + completed.stderr if completed.stderr else ""),
        encoding="utf-8",
    )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError(f"Production runtime QA emitted no JSON for {path.name}")
    try:
        result = json.loads(lines[-1])
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Production runtime QA emitted invalid JSON for {path.name}") from error
    result["exitCode"] = completed.returncode
    return result


def apply_runtime_geometry_metrics(
    artifact: dict[str, Any],
    runtime_qa: dict[str, Any],
    part_id: str,
) -> None:
    expected_node = f"{base.STABLE_NODE_PREFIX}{part_id}"
    if runtime_qa.get("status") != "PASS" or runtime_qa.get("stableNodes") != [expected_node]:
        raise RuntimeError(
            f"Production Three.js/Meshopt QA failed for {part_id}: "
            f"status={runtime_qa.get('status')}, stable={runtime_qa.get('stableNodes')}, "
            f"degenerate={runtime_qa.get('degenerateTriangles')}, "
            f"duplicate={runtime_qa.get('duplicateTriangles')}"
        )
    if (
        int(runtime_qa["uniqueGeometryTriangles"]) != int(artifact["triangles"])
        or int(runtime_qa["uniqueGeometryVertices"]) != int(artifact["vertices"])
        or int(runtime_qa["decodedGeometryBytes"]) != int(artifact["decodedGeometryBytes"])
    ):
        raise RuntimeError(f"Runtime/resource geometry or decoded-byte counts differ for {part_id}")
    artifact.update({
        "sceneDrawTriangles": int(runtime_qa["sceneDrawTriangles"]),
        "sceneDrawVertices": int(runtime_qa["sceneDrawVertices"]),
        "meshInstances": int(runtime_qa["meshInstances"]),
        "uniqueGeometryTriangles": int(runtime_qa["uniqueGeometryTriangles"]),
        "uniqueGeometryVertices": int(runtime_qa["uniqueGeometryVertices"]),
        "runtimeDecodedGeometryBytes": int(runtime_qa["decodedGeometryBytes"]),
        "productionRuntimeQa": runtime_qa,
    })


def remove_decoded_sliver_and_duplicate_triangles(source: Path, output: Path) -> dict[str, int]:
    """Remove only triangles already invalid after the exact delivery quantization.

    The input is the dequantized Meshopt result. Re-encoding this cleaned artifact
    is idempotent on the existing position grid and avoids accepting collapsed
    source slivers while preserving every representable triangle.
    """
    raise RuntimeError(
        "Triangle-deleting post-quantization repair is disabled by contract; "
        "move every at-risk valid triangle into a local normalized-Int16 QCAP instead"
    )
    document, chunks = base.read_glb(source)
    binary_chunk = next((data for kind, data in chunks if kind == base.BIN_CHUNK), None)
    if binary_chunk is None:
        raise RuntimeError("Decoded repair input has no BIN chunk")
    binary = bytearray(binary_chunk)
    accessors = document.get("accessors", [])
    views = document.get("bufferViews", [])

    def read_positions(accessor_id: int) -> list[tuple[float, float, float]]:
        accessor = accessors[accessor_id]
        if int(accessor.get("componentType", 0)) != 5126 or accessor.get("type") != "VEC3" or accessor.get("sparse"):
            raise RuntimeError("Post-quantization repair requires float32 VEC3 positions")
        view = views[int(accessor["bufferView"])]
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", 12))
        return [struct.unpack_from("<3f", binary, start + row * stride) for row in range(int(accessor["count"]))]

    def read_indices(accessor_id: int) -> list[int]:
        accessor = accessors[accessor_id]
        formats = {5121: ("<B", 1), 5123: ("<H", 2), 5125: ("<I", 4)}
        component_type = int(accessor.get("componentType", 0))
        if component_type not in formats or accessor.get("type") != "SCALAR" or accessor.get("sparse"):
            raise RuntimeError("Post-quantization repair found unsupported indices")
        fmt, size = formats[component_type]
        view = views[int(accessor["bufferView"])]
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", size))
        return [struct.unpack_from(fmt, binary, start + row * stride)[0] for row in range(int(accessor["count"]))]

    removed_degenerate = 0
    removed_duplicate = 0
    rewritten_primitives = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if int(primitive.get("mode", 4)) != 4 or "indices" not in primitive:
                raise RuntimeError("Post-quantization repair supports indexed triangle primitives only")
            position_id = int(primitive.get("attributes", {}).get("POSITION", -1))
            if position_id < 0:
                raise RuntimeError("Post-quantization repair found a primitive without POSITION")
            positions = read_positions(position_id)
            indices = read_indices(int(primitive["indices"]))
            if len(indices) % 3 or (indices and max(indices) >= len(positions)):
                raise RuntimeError("Post-quantization repair found malformed indices")
            low = [min(point[axis] for point in positions) for axis in range(3)]
            high = [max(point[axis] for point in positions) for axis in range(3)]
            diagonal_squared = sum((high[axis] - low[axis]) ** 2 for axis in range(3))
            area_threshold_squared = max(diagonal_squared * 1e-12, 1e-18) ** 2
            kept: list[int] = []
            seen: set[tuple[tuple[float, float, float], ...]] = set()
            primitive_removed = 0
            for offset in range(0, len(indices), 3):
                triangle = indices[offset : offset + 3]
                points = [positions[index] for index in triangle]
                ab = [points[1][axis] - points[0][axis] for axis in range(3)]
                ac = [points[2][axis] - points[0][axis] for axis in range(3)]
                cross = (
                    ab[1] * ac[2] - ab[2] * ac[1],
                    ab[2] * ac[0] - ab[0] * ac[2],
                    ab[0] * ac[1] - ab[1] * ac[0],
                )
                if sum(value * value for value in cross) <= area_threshold_squared:
                    removed_degenerate += 1
                    primitive_removed += 1
                    continue
                canonical = tuple(sorted(points))
                if canonical in seen:
                    removed_duplicate += 1
                    primitive_removed += 1
                    continue
                seen.add(canonical)
                kept.extend(triangle)
            if not primitive_removed:
                continue
            if not kept:
                raise RuntimeError("Post-quantization repair would empty a primitive")
            component_type = 5123 if max(kept) <= 65535 else 5125
            fmt = "<H" if component_type == 5123 else "<I"
            while len(binary) % 4:
                binary.append(0)
            byte_offset = len(binary)
            for value in kept:
                binary.extend(struct.pack(fmt, value))
            view_id = len(views)
            views.append({
                "buffer": 0,
                "byteOffset": byte_offset,
                "byteLength": len(binary) - byte_offset,
                "target": 34963,
            })
            accessor_id = len(accessors)
            accessors.append({
                "bufferView": view_id,
                "componentType": component_type,
                "count": len(kept),
                "type": "SCALAR",
                "min": [min(kept)],
                "max": [max(kept)],
            })
            primitive["indices"] = accessor_id
            rewritten_primitives += 1
    if not rewritten_primitives:
        raise RuntimeError("Post-quantization repair was requested but found no invalid triangles")
    document.setdefault("buffers", [{}])[0]["byteLength"] = len(binary)
    rebuilt_chunks = [
        (kind, bytes(binary) if kind == base.BIN_CHUNK else data)
        for kind, data in chunks
    ]
    base.write_glb_document(output, document, rebuilt_chunks)
    return {
        "removedDegenerateTriangles": removed_degenerate,
        "removedDuplicateTriangles": removed_duplicate,
        "rewrittenPrimitives": rewritten_primitives,
    }


def build(args: argparse.Namespace) -> int:
    private_root = args.private_root.resolve()
    inputs = load_inputs(private_root)
    candidate = base.safe_output(private_root / "derived-candidates" / args.candidate_id, private_root)
    stage = base.safe_output(candidate / "stage", private_root)
    shards_dir = base.safe_output(candidate / "shards", private_root)
    logs = base.safe_output(candidate / "logs", private_root)
    plan = write_plan(candidate, private_root, inputs, args.max_shard_bytes)
    if args.plan_only:
        print(json.dumps(plan["targets"], ensure_ascii=False))
        return 0
    free = base.available_physical_memory()
    if free is not None and free < args.min_free_memory:
        raise MemoryError(
            f"Generation not started: available physical memory {free} is below the "
            f"fail-closed floor {args.min_free_memory}"
        )
    inventory_by_id = inputs["inventoryById"]
    shard_records: list[dict[str, Any]] = []
    components = sorted(
        inputs["components"],
        key=lambda item: int(HIGH_TARGETS[str(item["id"])]),
    )
    for item in components:
        part_id = str(item["id"])
        target = HIGH_TARGETS[part_id]
        inventory_item = inventory_by_id[part_id]
        contract = source_contract(private_root, item, inventory_item, inputs)
        source = contract["source"]
        source_record = contract["record"]
        target = min(target, int(source_record["triangles"]))
        final = shards_dir / f"{part_id}.high.meshopt.glb"
        record_path = shards_dir / f"{part_id}.high.manifest.json"
        completed_record = resumable_shard(
            record_path,
            final,
            target,
            source_record,
            contract["coordinateMap"],
            args.feature_angle,
            args.max_shard_bytes,
        ) if args.resume else None
        if completed_record is not None:
            runtime_qa = production_runtime_geometry_qa(
                final,
                logs / f"{part_id}.runtime-qa.json",
            )
            try:
                apply_runtime_geometry_metrics(completed_record["artifact"], runtime_qa, part_id)
            except RuntimeError:
                completed_record = None
                print(json.dumps({
                    "stage": "invalidate-high-shard-production-qa",
                    "partId": part_id,
                    "degenerate": runtime_qa.get("degenerateTriangles"),
                    "duplicate": runtime_qa.get("duplicateTriangles"),
                }), flush=True)
            else:
                completed_record["qualityGates"]["productionRuntimeGeometry"] = "PASS"
                completed_record["qualityGates"]["triangleTarget"] = (
                    "PASS" if completed_record["artifact"]["triangles"] <= target else "FAIL"
                )
                completed_record["qualityGates"]["triangleDetailFloor95Percent"] = (
                    "PASS" if completed_record["artifact"]["triangles"] >= math.ceil(0.95 * target) else "FAIL"
                )
                if any(value != "PASS" for value in completed_record["qualityGates"].values()):
                    completed_record = None
                else:
                    base.atomic_write_json(record_path, completed_record)
                    shard_records.append(completed_record)
                    print(json.dumps({"stage": "resume-high-shard", "partId": part_id, "bytes": final.stat().st_size}), flush=True)
                    continue
        raw = stage / f"{part_id}.high.raw.glb"
        raw_stats_path = raw.with_suffix(".build.json")
        resumed = None
        if args.resume:
            resumed = base.validate_resumable_part(
                raw,
                raw_stats_path,
                part_id,
                target,
                source_record["sha256"],
                contract["coordinateMap"],
                args.feature_angle,
                int(source_record["bytes"]),
            )
        if resumed is None:
            command = [
                str(args.vtk_python),
                str(Path(base.__file__).resolve()),
                "--worker",
                "--source", str(source),
                "--output", str(raw),
                "--part-id", part_id,
                "--title", str(item["name"]),
                "--color", str(item["color"]),
                "--target", str(target),
                "--feature-angle", str(args.feature_angle),
                "--input-format", contract["inputFormat"],
                "--coordinate-map", contract["coordinateMap"],
            ]
            print(json.dumps({"stage": "reduce-high-shard", "partId": part_id, "target": target}), flush=True)
            memory = base.monitored_worker(
                command,
                logs / f"{part_id}.worker.log",
                args.max_working_set,
                args.min_free_memory,
            )
            raw_stats = json.loads(raw_stats_path.read_text(encoding="utf-8"))
            raw_stats.update(memory)
            raw_stats["buildDisposition"] = "fresh-recursive-memory-monitored"
        else:
            raw_stats = resumed
            raw_stats["buildDisposition"] = "resumed-structurally-validated"
            print(json.dumps({"stage": "resume-high-raw", "partId": part_id}), flush=True)
        observed_source = raw_stats.get("source", {})
        observed_fingerprint = raw_stats.get("buildFingerprint", {})
        if (
            int(observed_source.get("bytes", -1)) != int(source_record["bytes"])
            or str(observed_source.get("sha256", "")).upper() != str(source_record["sha256"]).upper()
            or str(observed_fingerprint.get("sourceSha256", "")).upper() != str(source_record["sha256"]).upper()
            or int(observed_fingerprint.get("targetTriangles", -1)) != target
            or float(observed_fingerprint.get("featureAngleDegrees", math.nan)) != float(args.feature_angle)
            or str(observed_fingerprint.get("coordinateMap", "")) != contract["coordinateMap"]
        ):
            raise RuntimeError(f"Worker/source fingerprint mismatch for {part_id}")
        # The worker's measured source identity has now been checked.  Enrich
        # it with the reviewed registration/path contract without masking a
        # hash or byte mismatch.
        raw_stats["source"] = source_record
        raw_stats["boundsQa"] = base.compare_bounds_qa(
            raw_stats["boundsMetres"],
            raw_stats.get("sourceBoundsMetres", contract["expectedBoundsMetres"]),
            base.visualization_bounds_tolerance(contract["expectedBoundsMetres"], part_id),
        )
        raw_stats["quantizationRiskTrianglesRemoved"] = int(
            raw_stats.get("quality", {}).get("quantizationRiskTrianglesRemoved", -1)
        )
        base.atomic_write_json(raw_stats_path, raw_stats)

        decoded_quantized = stage / f"{part_id}.high.decoded-quantized.glb"
        decoded = stage / f"{part_id}.high.decoded-float-qa.glb"
        environment = dict(os.environ)
        environment["NO_COLOR"] = "1"
        # The worker output is already the reviewed, quantization-risk-split
        # pre-encoding artifact.  Feeding it directly to Meshopt is deliberate:
        # glTF-Transform's broad `optimize` command can deduplicate/reorganize
        # primitives even when join/instance/weld are disabled, invalidating
        # the exact per-mesh Int16 QCAP preflight.  Direct Meshopt preserves the
        # reviewed topology while quantizing each local mesh volume.
        pre_quantization_artifact = base.final_document_qa(raw, [item])
        base.run_logged_monitored(
            base.gltf_transform_command() + [
                "meshopt", base.relative_posix(raw, private_root), base.relative_posix(final, private_root),
                "--level", "high", "--quantize-position", "16", "--quantize-normal", "8",
                "--quantization-volume", "mesh",
            ],
            private_root,
            logs / f"{part_id}.meshopt.log",
            args.max_working_set,
            args.min_free_memory,
            environment,
        )
        artifact = base.final_document_qa(final, [item])
        runtime_qa = production_runtime_geometry_qa(
            final,
            logs / f"{part_id}.runtime-qa.json",
        )
        apply_runtime_geometry_metrics(artifact, runtime_qa, part_id)
        triangle_retention = {
            "preQuantizationTriangles": int(pre_quantization_artifact["triangles"]),
            "postQuantizationTriangles": int(artifact["triangles"]),
            "removedTriangles": int(pre_quantization_artifact["triangles"] - artifact["triangles"]),
            "preQuantizationSceneDrawTriangles": int(pre_quantization_artifact["sceneDrawTriangles"]),
            "postQuantizationSceneDrawTriangles": int(artifact["sceneDrawTriangles"]),
            "removedSceneDrawTriangles": int(
                pre_quantization_artifact["sceneDrawTriangles"] - artifact["sceneDrawTriangles"]
            ),
        }
        base.run_logged_monitored(
            base.gltf_transform_command() + [
                "optimize", base.relative_posix(final, private_root), base.relative_posix(decoded_quantized, private_root),
                "--compress", "false", "--flatten", "false", "--join", "false", "--instance", "false",
                "--palette", "false", "--simplify", "false", "--weld", "false", "--texture-compress", "false",
            ],
            private_root,
            logs / f"{part_id}.decode.log",
            args.max_working_set,
            args.min_free_memory,
            environment,
        )
        base.run_logged_monitored(
            base.gltf_transform_command() + [
                "dequantize", base.relative_posix(decoded_quantized, private_root), base.relative_posix(decoded, private_root),
            ],
            private_root,
            logs / f"{part_id}.dequantize.log",
            args.max_working_set,
            args.min_free_memory,
            environment,
        )
        decoded_qa = base.decoded_final_geometry_qa(decoded, raise_on_error=False)
        if decoded_qa["degenerateTriangles"] or decoded_qa["duplicateTriangles"]:
            raise RuntimeError(
                f"Float-decoded secondary QA failed for {part_id}; refusing triangle deletion. "
                "Quantization-risk geometry must be preserved in local capsules before encoding."
            )
        post_quantization_repair: dict[str, Any] | None = None
        current_decoded = decoded
        current_final = final
        repair_passes: list[dict[str, int]] = []
        for repair_round in range(1, 4):
            if not (decoded_qa["degenerateTriangles"] or decoded_qa["duplicateTriangles"]):
                break
            print(json.dumps({
                "stage": "repair-post-quantization-slivers",
                "partId": part_id,
                "round": repair_round,
                "degenerate": decoded_qa["degenerateTriangles"],
                "duplicate": decoded_qa["duplicateTriangles"],
            }), flush=True)
            stem = f"{part_id}.high.postquant-{repair_round}"
            cleaned = stage / f"{stem}-clean.glb"
            repaired_optimized = stage / f"{stem}-optimized.glb"
            repaired_final = stage / f"{stem}.meshopt.glb"
            repaired_decoded_quantized = stage / f"{stem}-decoded-quantized.glb"
            repaired_decoded = stage / f"{stem}-decoded-float-qa.glb"
            pass_record = remove_decoded_sliver_and_duplicate_triangles(current_decoded, cleaned)
            repair_passes.append(pass_record)
            base.run_logged_monitored(
                base.gltf_transform_command() + [
                    "optimize", base.relative_posix(cleaned, private_root), base.relative_posix(repaired_optimized, private_root),
                    "--compress", "false", "--flatten", "false", "--join", "false", "--instance", "false",
                    "--palette", "false", "--simplify", "false", "--weld", "false", "--texture-compress", "false",
                ],
                private_root,
                logs / f"{part_id}.postquant-{repair_round}-optimize.log",
                args.max_working_set,
                args.min_free_memory,
                environment,
            )
            base.run_logged_monitored(
                base.gltf_transform_command() + [
                    "meshopt", base.relative_posix(repaired_optimized, private_root), base.relative_posix(repaired_final, private_root),
                    "--level", "high", "--quantize-position", "16", "--quantize-normal", "8",
                    "--quantization-volume", "mesh",
                ],
                private_root,
                logs / f"{part_id}.postquant-{repair_round}-meshopt.log",
                args.max_working_set,
                args.min_free_memory,
                environment,
            )
            artifact = base.final_document_qa(repaired_final, [item])
            base.run_logged_monitored(
                base.gltf_transform_command() + [
                    "optimize", base.relative_posix(repaired_final, private_root), base.relative_posix(repaired_decoded_quantized, private_root),
                    "--compress", "false", "--flatten", "false", "--join", "false", "--instance", "false",
                    "--palette", "false", "--simplify", "false", "--weld", "false", "--texture-compress", "false",
                ],
                private_root,
                logs / f"{part_id}.postquant-{repair_round}-decode.log",
                args.max_working_set,
                args.min_free_memory,
                environment,
            )
            base.run_logged_monitored(
                base.gltf_transform_command() + [
                    "dequantize", base.relative_posix(repaired_decoded_quantized, private_root), base.relative_posix(repaired_decoded, private_root),
                ],
                private_root,
                logs / f"{part_id}.postquant-{repair_round}-dequantize.log",
                args.max_working_set,
                args.min_free_memory,
                environment,
            )
            current_decoded = repaired_decoded
            current_final = repaired_final
            decoded_qa = base.decoded_final_geometry_qa(current_decoded, raise_on_error=False)
        if repair_passes:
            post_quantization_repair = {
                "rounds": len(repair_passes),
                "removedDegenerateTriangles": sum(int(record["removedDegenerateTriangles"]) for record in repair_passes),
                "removedDuplicateTriangles": sum(int(record["removedDuplicateTriangles"]) for record in repair_passes),
                "passes": repair_passes,
            }
            # Fail closed if quantization does not converge within the bounded
            # repair loop; never accept or repeatedly mutate an unstable mesh.
            base.decoded_final_geometry_qa(current_decoded)
            if current_final != final:
                os.replace(current_final, final)
        inspect = base.run_logged_monitored(
            base.gltf_transform_command() + ["inspect", base.relative_posix(final, private_root), "--format", "csv"],
            private_root,
            logs / f"{part_id}.inspect.csv",
            args.max_working_set,
            args.min_free_memory,
            environment,
        )
        bounds = base.parse_scene_bounds(inspect)
        if bounds is None:
            raise RuntimeError(f"No inspect bounds for high shard {part_id}")
        expected_bounds = raw_stats.get("sourceBoundsMetres", contract["expectedBoundsMetres"])
        bounds_tolerance = base.visualization_bounds_tolerance(contract["expectedBoundsMetres"], part_id)
        inspect_bounds_qa = base.compare_bounds_qa(
            bounds,
            expected_bounds,
            bounds_tolerance,
        )
        runtime_bounds = runtime_qa["worldBoundsMetres"]
        runtime_bounds_qa = base.compare_bounds_qa(
            runtime_bounds,
            expected_bounds,
            bounds_tolerance,
        )
        runtime_artifact_bounds_qa = base.compare_bounds_qa(
            runtime_bounds,
            bounds,
            0.0001,
        )
        required = set(artifact["extensionsRequired"])
        gates = {
            "stablePartIdentity": "PASS" if artifact["stableNodes"] == [f"{base.STABLE_NODE_PREFIX}{part_id}"] else "FAIL",
            "uniqueMeshOwnership": "PASS" if len(artifact["stableMeshOwnership"]) == 1 else "FAIL",
            "meshopt": "PASS" if "EXT_meshopt_compression" in required else "FAIL",
            "quantization": "PASS" if "KHR_mesh_quantization" in required else "FAIL",
            "triangleTarget": "PASS" if artifact["triangles"] <= target else "FAIL",
            "triangleDetailFloor95Percent": "PASS" if artifact["triangles"] >= math.ceil(0.95 * target) else "FAIL",
            "bytesStrictlyBelow24MiB": "PASS" if artifact["bytes"] < args.max_shard_bytes else "FAIL",
            "decodedGeometry": "PASS" if decoded_qa["status"] == "PASS" else "FAIL",
            "productionRuntimeGeometry": "PASS" if runtime_qa["status"] == "PASS" else "FAIL",
            "exactEncodingAndExtensions": "PASS" if (
                runtime_qa["exactExtensions"]
                and runtime_qa["positionEncodings"] == ["Int16Array:normalized"]
                and runtime_qa["normalEncodings"] == ["Int8Array:normalized"]
                and int(runtime_qa["positionEncodingFailures"]) == 0
                and int(runtime_qa["normalEncodingFailures"]) == 0
            ) else "FAIL",
            "selfContainedGlb": "PASS" if (
                runtime_qa["selfContainedBuffers"]
                and runtime_qa["selfContainedImages"]
                and int(runtime_qa["internalBinChunks"]) == 1
            ) else "FAIL",
            "worldTransformGeometry": "PASS" if (
                runtime_qa["finiteWorldMatrices"]
                and runtime_qa["nonSingularWorldMatrices"]
                and runtime_qa["finiteWorldPositions"]
                and int(runtime_qa["worldDegenerateTriangles"]) == 0
                and int(runtime_qa["worldDuplicateTriangles"]) == 0
            ) else "FAIL",
            "drawCallBudget": "PASS" if artifact["meshInstances"] <= MAX_MESH_INSTANCES_PER_SHARD else "FAIL",
            "postQuantizationTriangleRetention": "PASS" if (
                triangle_retention["removedTriangles"] == 0
                and triangle_retention["removedSceneDrawTriangles"] == 0
                and raw_stats["quantizationRiskTrianglesRemoved"] == 0
            ) else "FAIL",
            "bounds": "PASS" if (
                inspect_bounds_qa["status"] == "PASS"
                and runtime_bounds_qa["status"] == "PASS"
                and runtime_artifact_bounds_qa["status"] == "PASS"
            ) else "FAIL",
        }
        if any(value != "PASS" for value in gates.values()):
            raise RuntimeError(f"High shard {part_id} failed hard gates: {gates}")
        record = {
            "partId": part_id,
            "stableNode": f"{base.STABLE_NODE_PREFIX}{part_id}",
            "nodeName": f"{base.STABLE_NODE_PREFIX}{part_id}",
            "name": item["name"],
            "nameZh": item.get("nameZh"),
            "system": item.get("system"),
            "loadTier": int(item.get("loadTier", 4)),
            "lod": "high",
            "source": source_record,
            "buildFingerprint": {
                "pipelineVersion": TOOL_VERSION,
                "orchestratorSha256": base.sha256(Path(__file__).resolve()),
                "baseBuilderSha256": base.sha256(Path(base.__file__).resolve()),
                "runtimeQaScriptSha256": base.sha256(RUNTIME_QA_SCRIPT),
                "targetTriangles": target,
                "featureAngleDegrees": args.feature_angle,
                "maximumShardBytesExclusive": args.max_shard_bytes,
                "sourceSha256": str(source_record["sha256"]).upper(),
                "sourceBytes": int(source_record["bytes"]),
                "coordinateMap": contract["coordinateMap"],
                "coordinateRegistration": source_record.get("coordinateRegistration"),
            },
            "artifact": {
                "path": base.relative_posix(final, candidate),
                "format": (
                    "glTF 2.0 binary + EXT_meshopt_compression + KHR_mesh_quantization; "
                    "POSITION normalized Int16 per mesh; NORMAL normalized Int8 (8-bit)"
                ),
                **artifact,
                "decodedUniqueAccessorBytes": artifact["decodedGeometryBytes"],
                "boundsMetres": runtime_bounds,
                "inspectBoundsMetres": bounds,
                "decodedQa": decoded_qa,
            },
            "rawReduction": raw_stats,
            "postQuantizationRepair": None,
            "triangleRetention": triangle_retention,
            "runtimeQa": runtime_qa,
            "boundsQa": runtime_bounds_qa,
            "inspectBoundsQa": inspect_bounds_qa,
            "runtimeArtifactBoundsQa": runtime_artifact_bounds_qa,
            "qualityGates": gates,
        }
        base.atomic_write_json(record_path, record)
        shard_records.append(record)
        print(json.dumps({"stage": "high-shard-complete", "partId": part_id, "bytes": artifact["bytes"], "triangles": artifact["triangles"]}), flush=True)

    stable_ids = [str(item["partId"]) for item in shard_records]
    total_bytes = sum(int(item["artifact"]["bytes"]) for item in shard_records)
    total_triangles = sum(int(item["artifact"]["triangles"]) for item in shard_records)
    total_vertices = sum(int(item["artifact"]["vertices"]) for item in shard_records)
    total_scene_draw_triangles = sum(int(item["artifact"]["sceneDrawTriangles"]) for item in shard_records)
    total_scene_draw_vertices = sum(int(item["artifact"]["sceneDrawVertices"]) for item in shard_records)
    total_mesh_instances = sum(int(item["artifact"]["meshInstances"]) for item in shard_records)
    total_decoded_unique_accessor_bytes = sum(
        int(item["artifact"]["decodedUniqueAccessorBytes"]) for item in shard_records
    )
    package_runtime_bounds = {
        "min": [
            min(float(item["artifact"]["boundsMetres"]["min"][axis]) for item in shard_records)
            for axis in range(3)
        ],
        "max": [
            max(float(item["artifact"]["boundsMetres"]["max"][axis]) for item in shard_records)
            for axis in range(3)
        ],
    }
    max_shard = max(int(item["artifact"]["bytes"]) for item in shard_records)
    package_gates = {
        "exactStableParts18": "PASS" if len(stable_ids) == 18 and len(set(stable_ids)) == 18 else "FAIL",
        "triangleTarget": "PASS" if total_triangles <= sum(HIGH_TARGETS.values()) else "FAIL",
        "triangleDetailFloor95Percent": "PASS" if total_triangles >= math.ceil(0.95 * sum(HIGH_TARGETS.values())) else "FAIL",
        "eachShardStrictlyBelow24MiB": "PASS" if max_shard < args.max_shard_bytes else "FAIL",
        "totalBytesBetween80And110MB": "PASS" if 80_000_000 <= total_bytes <= args.max_total_bytes else "FAIL",
        "decodedGeometryAllShards": "PASS" if all(item["qualityGates"]["decodedGeometry"] == "PASS" for item in shard_records) else "FAIL",
        "productionRuntimeGeometryAllShards": "PASS" if all(
            item["qualityGates"]["productionRuntimeGeometry"] == "PASS" for item in shard_records
        ) else "FAIL",
        "exactEncodingAndExtensionsAllShards": "PASS" if all(
            item["qualityGates"]["exactEncodingAndExtensions"] == "PASS" for item in shard_records
        ) else "FAIL",
        "selfContainedGlbAllShards": "PASS" if all(
            item["qualityGates"]["selfContainedGlb"] == "PASS" for item in shard_records
        ) else "FAIL",
        "worldTransformGeometryAllShards": "PASS" if all(
            item["qualityGates"]["worldTransformGeometry"] == "PASS" for item in shard_records
        ) else "FAIL",
        "postQuantizationTriangleRetentionAllShards": "PASS" if all(
            item["qualityGates"]["postQuantizationTriangleRetention"] == "PASS"
            and item["postQuantizationRepair"] is None
            and int(item["rawReduction"]["quantizationRiskTrianglesRemoved"]) == 0
            for item in shard_records
        ) else "FAIL",
        "drawCallBudget": "PASS" if total_mesh_instances <= MAX_MESH_INSTANCES_TOTAL else "FAIL",
        "publicationReady": "REVIEW_REQUIRED",
    }
    manifest = {
        "schemaVersion": "fusiondigital.iter.high-shard-package.v1",
        "candidateId": args.candidate_id,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PRIVATE_HIGH_DETAIL_COMPLETE_PUBLICATION_REVIEW_REQUIRED",
        "distribution": "private candidate only; no public write, commit or deployment performed",
        "lodContract": {
            "previewCandidate": None,
            "highReplacementGranularity": "one reviewed 18-part bundle assembled from independently verified stable-part shards",
            "initialHighLoads": "all 18 reviewed shards after viewer activation",
            "activation": "sole component-only browser model",
            "fallback": "dispose any partial bundle and expose a retryable error if any shard fails fetch, byte/hash, identity or parse checks",
        },
        "budgets": {
            "targetTriangles": sum(HIGH_TARGETS.values()),
            "maximumShardBytesExclusive": args.max_shard_bytes,
            "maximumTotalBytes": args.max_total_bytes,
            "maximumMeshInstancesPerShard": MAX_MESH_INSTANCES_PER_SHARD,
            "maximumMeshInstancesTotal": MAX_MESH_INSTANCES_TOTAL,
            "maximumWorkerWorkingSetBytes": args.max_working_set,
            "minimumAvailablePhysicalBytes": args.min_free_memory,
        },
        "actual": {
            "shards": len(shard_records),
            "uniqueGeometryTriangles": total_triangles,
            "uniqueGeometryVertices": total_vertices,
            "triangles": total_triangles,
            "vertices": total_vertices,
            "sceneDrawTriangles": total_scene_draw_triangles,
            "sceneDrawVertices": total_scene_draw_vertices,
            "meshInstances": total_mesh_instances,
            "decodedUniqueAccessorBytes": total_decoded_unique_accessor_bytes,
            "boundsMetres": package_runtime_bounds,
            "bytes": total_bytes,
            "megabytes": round(total_bytes / 1_000_000, 3),
            "mebibytes": round(total_bytes / (1024 * 1024), 3),
            "largestShardBytes": max_shard,
        },
        "shards": shard_records,
        "qualityGates": package_gates,
    }
    base.atomic_write_json(candidate / "manifest.candidate.json", manifest)
    print(json.dumps({"actual": manifest["actual"], "qualityGates": package_gates}, ensure_ascii=False))
    advisory = {"publicationReady"}
    return 0 if all(value == "PASS" for key, value in package_gates.items() if key not in advisory) else 2


def parse_args() -> argparse.Namespace:
    private_default, vtk_default = default_paths()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-root", type=Path, default=private_default)
    parser.add_argument("--vtk-python", type=Path, default=vtk_default)
    parser.add_argument("--candidate-id", default=DEFAULT_CANDIDATE_ID)
    parser.add_argument("--feature-angle", type=float, default=55.0)
    parser.add_argument("--max-shard-bytes", type=int, default=DEFAULT_MAX_SHARD_BYTES)
    parser.add_argument("--max-total-bytes", type=int, default=DEFAULT_MAX_TOTAL_BYTES)
    parser.add_argument("--max-working-set", type=int, default=base.DEFAULT_MAX_WORKING_SET)
    parser.add_argument("--min-free-memory", type=int, default=base.DEFAULT_MIN_FREE_MEMORY)
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--plan-only", action="store_true")
    args = parser.parse_args()
    if not args.plan_only and not args.vtk_python.is_file():
        parser.error(f"VTK Python environment not found: {args.vtk_python}")
    return args


if __name__ == "__main__":
    raise SystemExit(build(parse_args()))
