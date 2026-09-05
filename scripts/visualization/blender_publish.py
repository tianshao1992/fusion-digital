#!/usr/bin/env python3
"""Validate or execute a Blender headless publication job.

Validation deliberately does not import bpy, so contracts can be checked in CI.
Real publication must run through Blender's Python interpreter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


JOB_SCHEMA = "fusiondigital.blender-publish-job.v1"
ARTIFACT_SCHEMA = "fusiondigital.visualization-artifact.v2"
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
DELIVERY_PROFILES = {"web-mesh", "openusd"}


class JobValidationError(ValueError):
    pass


def _object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise JobValidationError(f"{path} must be an object")
    return value


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise JobValidationError(f"{path} must be a non-empty string")
    return value


def _safe_relative_path(value: Any, path: str) -> str:
    text = _string(value, path).replace("\\", "/")
    candidate = Path(text)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise JobValidationError(f"{path} must be a safe relative path")
    return text


def validate_job(job: Any) -> dict[str, Any]:
    root = _object(job, "job")
    if root.get("schema") != JOB_SCHEMA:
        raise JobValidationError(f"job.schema must equal {JOB_SCHEMA}")

    _string(root.get("jobId"), "job.jobId")
    _string(root.get("artifactId"), "job.artifactId")
    _string(root.get("label"), "job.label")
    source = _object(root.get("source"), "job.source")
    _string(source.get("path"), "job.source.path")
    digest = _string(source.get("sha256"), "job.source.sha256")
    if not SHA256_RE.fullmatch(digest):
        raise JobValidationError("job.source.sha256 must be a SHA-256 hex digest")
    if source.get("format") not in {"glb", "gltf", "obj", "ply", "stl", "usd", "usda", "usdc"}:
        raise JobValidationError("job.source.format is not supported")

    _string(root.get("outputRoot"), "job.outputRoot")
    if root.get("authority") not in {"raw", "calibrated", "reconstructed", "simulated", "synthetic"}:
        raise JobValidationError("job.authority is invalid")
    if root.get("classification") not in {"public", "internal", "restricted"}:
        raise JobValidationError("job.classification is invalid")
    if not isinstance(root.get("clientDownloadAllowed"), bool):
        raise JobValidationError("job.clientDownloadAllowed must be a boolean")

    coordinates = _object(root.get("coordinates"), "job.coordinates")
    _string(coordinates.get("units"), "job.coordinates.units")
    if coordinates.get("upAxis") not in {"X", "Y", "Z"}:
        raise JobValidationError("job.coordinates.upAxis is invalid")
    if coordinates.get("handedness") not in {"left", "right"}:
        raise JobValidationError("job.coordinates.handedness is invalid")

    source_record = _object(root.get("sourceRecord"), "job.sourceRecord")
    if source_record.get("kind") not in {
        "facility-record", "simulation-run", "comparison-record", "design-asset"
    }:
        raise JobValidationError("job.sourceRecord.kind is invalid")
    _string(source_record.get("id"), "job.sourceRecord.id")

    deliveries = root.get("deliveries")
    if not isinstance(deliveries, list) or not deliveries:
        raise JobValidationError("job.deliveries must be a non-empty array")
    seen_paths: set[str] = set()
    for index, value in enumerate(deliveries):
        delivery = _object(value, f"job.deliveries[{index}]")
        if delivery.get("profile") not in DELIVERY_PROFILES:
            raise JobValidationError(f"job.deliveries[{index}].profile is invalid")
        output_path = _safe_relative_path(delivery.get("path"), f"job.deliveries[{index}].path")
        if output_path in seen_paths:
            raise JobValidationError(f"job.deliveries[{index}].path is duplicated")
        seen_paths.add(output_path)
        output_format = _string(delivery.get("format"), f"job.deliveries[{index}].format")
        if output_format not in {"glb", "usd", "usda", "usdc"}:
            raise JobValidationError(f"job.deliveries[{index}].format is not exportable")

    options = _object(root.get("options", {}), "job.options")
    for key in ("requireStableIds", "applyModifiers", "exportMaterials"):
        if key in options and not isinstance(options[key], bool):
            raise JobValidationError(f"job.options.{key} must be a boolean")
    if "stableIdMap" in root:
        _string(root["stableIdMap"], "job.stableIdMap")
    return root


def load_job(path: Path) -> dict[str, Any]:
    return validate_job(json.loads(path.read_text(encoding="utf-8")))


def tool_arguments(argv: list[str]) -> list[str]:
    """Return script arguments for both CPython and Blender ``--`` invocation."""
    if "--" in argv:
        return argv[argv.index("--") + 1 :]
    return argv[1:]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve(base: Path, value: str) -> Path:
    candidate = Path(value)
    return candidate.resolve() if candidate.is_absolute() else (base / candidate).resolve()


def _import_source(bpy: Any, source_path: Path, source_format: str) -> None:
    if source_format in {"glb", "gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(source_path))
    elif source_format == "obj":
        bpy.ops.wm.obj_import(filepath=str(source_path))
    elif source_format == "ply":
        bpy.ops.wm.ply_import(filepath=str(source_path))
    elif source_format == "stl":
        bpy.ops.wm.stl_import(filepath=str(source_path))
    else:
        bpy.ops.wm.usd_import(filepath=str(source_path))


def _load_stable_ids(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in value.items()):
        raise JobValidationError("stableIdMap must be a JSON object of object-name to stable-id strings")
    return value


def publish(job_path: Path, job: dict[str, Any]) -> Path:
    try:
        import bpy  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Real publication must run with Blender: blender --background --python ...") from exc

    base = job_path.parent.resolve()
    source = job["source"]
    source_path = _resolve(base, source["path"])
    if not source_path.is_file():
        raise FileNotFoundError(f"Source asset does not exist: {source_path}")
    actual_source_sha = sha256_file(source_path)
    if actual_source_sha.lower() != source["sha256"].lower():
        raise JobValidationError("Source SHA-256 does not match the publication job")

    output_root = _resolve(base, job["outputRoot"])
    output_root.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    _import_source(bpy, source_path, source["format"])

    options = job.get("options", {})
    stable_map_path = _resolve(base, job["stableIdMap"]) if job.get("stableIdMap") else None
    stable_ids = _load_stable_ids(stable_map_path)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        if obj.name in stable_ids:
            obj["fusiondigital_stable_id"] = stable_ids[obj.name]
        if options.get("requireStableIds") and "fusiondigital_stable_id" not in obj:
            raise JobValidationError(f"Mesh object is missing a stable id: {obj.name}")
        if options.get("applyModifiers"):
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            obj.select_set(False)

    vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in mesh_objects)
    exported: list[dict[str, Any]] = []
    for delivery in job["deliveries"]:
        output_path = (output_root / delivery["path"]).resolve()
        if output_root not in output_path.parents:
            raise JobValidationError("Resolved delivery path escaped outputRoot")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if delivery["format"] == "glb":
            bpy.ops.export_scene.gltf(
                filepath=str(output_path),
                export_format="GLB",
                export_extras=True,
                export_materials="EXPORT" if options.get("exportMaterials", True) else "NONE",
            )
        else:
            bpy.ops.wm.usd_export(filepath=str(output_path), export_custom_properties=True)
        exported.append({
            "profile": delivery["profile"],
            "format": delivery["format"],
            "uri": Path(delivery["path"]).as_posix(),
            "sha256": sha256_file(output_path),
            "bytes": output_path.stat().st_size,
        })

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    manifest = {
        "schema": ARTIFACT_SCHEMA,
        "artifactId": job["artifactId"],
        "version": generated_at,
        "label": job["label"],
        "sourceRecord": job["sourceRecord"],
        "provenance": {
            "authority": job["authority"],
            "generator": f"Blender {bpy.app.version_string} / FusionDigital publisher v1",
            "generatedAt": generated_at,
            "sourceSha256": actual_source_sha,
        },
        "coordinates": job["coordinates"],
        "complexity": {
            "compressedBytes": sum(item["bytes"] for item in exported),
            "decodedBytes": vertices * 48 + triangles * 12,
            "workingSetBytes": vertices * 64 + triangles * 16,
            "triangles": triangles,
            "points": vertices,
        },
        "access": {
            "classification": job["classification"],
            "clientDownloadAllowed": job["clientDownloadAllowed"],
        },
        "deliveries": exported,
    }
    manifest_path = output_root / "visualization-artifact.v2.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(tool_arguments(sys.argv))
    job_path = args.job.resolve()
    job = load_job(job_path)
    if args.validate_only:
        print(f"VALID {JOB_SCHEMA}: {job['jobId']}")
        return 0
    manifest = publish(job_path, job)
    print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
