#!/usr/bin/env python3
"""Validate or compose an OpenUSD stage from versioned visualization assets."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


JOB_SCHEMA = "fusiondigital.openusd-compose-job.v1"
PRIM_PATH_RE = re.compile(r"^/[A-Za-z_][A-Za-z0-9_]*(?:/[A-Za-z_][A-Za-z0-9_]*)*$")


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


def _vector(value: Any, path: str, default: list[float]) -> list[float]:
    if value is None:
        return default
    if not isinstance(value, list) or len(value) != 3 or any(not isinstance(item, (int, float)) for item in value):
        raise JobValidationError(f"{path} must contain three numbers")
    return [float(item) for item in value]


def validate_job(job: Any) -> dict[str, Any]:
    root = _object(job, "job")
    if root.get("schema") != JOB_SCHEMA:
        raise JobValidationError(f"job.schema must equal {JOB_SCHEMA}")
    _string(root.get("jobId"), "job.jobId")
    output = _object(root.get("output"), "job.output")
    _safe_relative_path(output.get("path"), "job.output.path")
    if output.get("upAxis") not in {"Y", "Z"}:
        raise JobValidationError("job.output.upAxis must be Y or Z")
    meters = output.get("metersPerUnit")
    if not isinstance(meters, (int, float)) or meters <= 0:
        raise JobValidationError("job.output.metersPerUnit must be greater than zero")
    root_prim = _string(output.get("rootPrim"), "job.output.rootPrim")
    if not PRIM_PATH_RE.fullmatch(root_prim) or root_prim.count("/") != 1:
        raise JobValidationError("job.output.rootPrim must be a top-level USD prim path")

    assets = root.get("assets")
    if not isinstance(assets, list) or not assets:
        raise JobValidationError("job.assets must be a non-empty array")
    prim_paths: set[str] = set()
    for index, value in enumerate(assets):
        asset = _object(value, f"job.assets[{index}]")
        _string(asset.get("artifactId"), f"job.assets[{index}].artifactId")
        _safe_relative_path(asset.get("artifactManifest"), f"job.assets[{index}].artifactManifest")
        _safe_relative_path(asset.get("layer"), f"job.assets[{index}].layer")
        prim_path = _string(asset.get("primPath"), f"job.assets[{index}].primPath")
        if not PRIM_PATH_RE.fullmatch(prim_path) or not prim_path.startswith(root_prim + "/"):
            raise JobValidationError(f"job.assets[{index}].primPath must be below {root_prim}")
        if prim_path in prim_paths:
            raise JobValidationError(f"job.assets[{index}].primPath is duplicated")
        prim_paths.add(prim_path)
        transform = _object(asset.get("transform", {}), f"job.assets[{index}].transform")
        _vector(transform.get("translate"), f"job.assets[{index}].transform.translate", [0, 0, 0])
        _vector(transform.get("rotateXYZ"), f"job.assets[{index}].transform.rotateXYZ", [0, 0, 0])
        _vector(transform.get("scale"), f"job.assets[{index}].transform.scale", [1, 1, 1])
    return root


def load_job(path: Path) -> dict[str, Any]:
    return validate_job(json.loads(path.read_text(encoding="utf-8")))


def compose(job_path: Path, job: dict[str, Any]) -> Path:
    try:
        from pxr import Gf, Usd, UsdGeom  # type: ignore
    except ImportError as exc:
        raise RuntimeError("OpenUSD Python bindings are required for composition") from exc

    base = job_path.parent.resolve()
    output = job["output"]
    output_path = (base / output["path"]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    stage = Usd.Stage.CreateNew(str(output_path))
    UsdGeom.SetStageMetersPerUnit(stage, float(output["metersPerUnit"]))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z if output["upAxis"] == "Z" else UsdGeom.Tokens.y)
    root = UsdGeom.Xform.Define(stage, output["rootPrim"])
    stage.SetDefaultPrim(root.GetPrim())

    for asset in job["assets"]:
        manifest_path = (base / asset["artifactManifest"]).resolve()
        layer_path = (base / asset["layer"]).resolve()
        if not manifest_path.is_file():
            raise FileNotFoundError(f"Artifact manifest does not exist: {manifest_path}")
        if not layer_path.is_file():
            raise FileNotFoundError(f"USD layer does not exist: {layer_path}")
        prim = UsdGeom.Xform.Define(stage, asset["primPath"]).GetPrim()
        reference_path = Path(layer_path).relative_to(output_path.parent).as_posix() if output_path.parent in layer_path.parents else str(layer_path)
        prim.GetReferences().AddReference(reference_path)
        prim.SetCustomDataByKey("fusiondigital:artifactId", asset["artifactId"])
        prim.SetCustomDataByKey("fusiondigital:artifactManifest", str(manifest_path))
        transform = asset.get("transform", {})
        api = UsdGeom.XformCommonAPI(prim)
        api.SetTranslate(Gf.Vec3d(*_vector(transform.get("translate"), "translate", [0, 0, 0])))
        api.SetRotate(Gf.Vec3f(*_vector(transform.get("rotateXYZ"), "rotateXYZ", [0, 0, 0])))
        api.SetScale(Gf.Vec3f(*_vector(transform.get("scale"), "scale", [1, 1, 1])))

    stage.GetRootLayer().Save()
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    job_path = args.job.resolve()
    job = load_job(job_path)
    if args.validate_only:
        print(f"VALID {JOB_SCHEMA}: {job['jobId']}")
        return 0
    print(compose(job_path, job))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
