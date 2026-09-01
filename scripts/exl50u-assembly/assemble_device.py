"""Assemble independently derived system meshes into one reviewed device LOD."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from pipeline import (
    MeshAsset,
    enclosing_git_checkout,
    read_raw_glb_mesh,
    sha256_file,
    write_raw_glb,
)


SHA256_PATTERN = re.compile(r"^[0-9A-F]{64}$")
SYSTEM_BUILD_KEYS = {
    "schemaVersion",
    "systemId",
    "role",
    "profile",
    "audit",
    "source",
    "parameters",
    "privateInventory",
    "artifact",
    "seconds",
}
ARTIFACT_KEYS = {
    "basename",
    "bytes",
    "sha256",
    "vertices",
    "triangles",
    "decodedGpuBytes",
    "boundsMetres",
    "assets",
}


def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise RuntimeError(f"private build record contains duplicate key {key!r}")
        result[key] = value
    return result


def reject_nonfinite_constant(value: str) -> object:
    raise RuntimeError(f"private build record contains non-finite constant {value}")


def exact_keys(value: object, keys: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise RuntimeError(f"{label} fields are outside the exact provenance contract")
    return value


def natural_number(value: object, label: str, *, positive: bool = False) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < (1 if positive else 0):
        raise RuntimeError(f"{label} must be a {'positive' if positive else 'non-negative'} integer")
    return value


def sha256_value(value: object, label: str) -> str:
    if not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
        raise RuntimeError(f"{label} must be an uppercase SHA-256 digest")
    return value


def load_system_record(
    record_path: Path,
    source: Path,
    system: dict[str, object],
    role: str,
    profile_bytes: int,
    profile_sha256: str,
    vertices: int,
    triangles: int,
) -> dict[str, object]:
    try:
        record = json.loads(
            record_path.read_text(encoding="utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_nonfinite_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"invalid private build record for {system['id']}") from error
    record = exact_keys(record, SYSTEM_BUILD_KEYS, "system build record")
    if (
        record["schemaVersion"] != "fusiondigital.exl50u-system-derivative-build.v1"
        or record["systemId"] != system["id"]
        or record["role"] != role
    ):
        raise RuntimeError(f"system build identity mismatch for {system['id']}")

    profile = exact_keys(record["profile"], {"bytes", "sha256"}, "profile evidence")
    if profile != {"bytes": profile_bytes, "sha256": profile_sha256}:
        raise RuntimeError(f"profile provenance mismatch for {system['id']}")
    audit = exact_keys(record["audit"], {"bytes", "sha256"}, "audit evidence")
    source_evidence = exact_keys(record["source"], {"bytes", "sha256"}, "source evidence")
    natural_number(audit["bytes"], "audit bytes", positive=True)
    audit_sha256 = sha256_value(audit["sha256"], "audit SHA-256")
    natural_number(source_evidence["bytes"], "source bytes", positive=True)
    source_sha256 = sha256_value(source_evidence["sha256"], "source SHA-256")

    parameters = exact_keys(
        record["parameters"],
        {
            "linearDeflectionMetres",
            "angularDeflectionRadians",
            "featureAngleDegrees",
            "targetTriangles",
            "qemPassesPerDefinition",
            "effectiveCascadeUnit",
            "boundsGate",
        },
        "build parameters",
    )
    if (
        parameters["targetTriangles"] != system[f"{role}TriangleBudget"]
        or parameters["qemPassesPerDefinition"] != 1
        or parameters["effectiveCascadeUnit"] != "M"
        or parameters["linearDeflectionMetres"] != 0.0005
        or parameters["angularDeflectionRadians"] != 0.25
        or parameters["featureAngleDegrees"] != 60.0
    ):
        raise RuntimeError(f"build parameters do not match the reviewed role for {system['id']}")
    bounds_gate = exact_keys(
        parameters["boundsGate"],
        {
            "maximumAbsoluteCoordinateMetres",
            "minimumDiagonalMetres",
            "maximumDiagonalMetres",
        },
        "build bounds gate",
    )
    for key in ("linearDeflectionMetres", "angularDeflectionRadians", "featureAngleDegrees"):
        value = parameters[key]
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
            raise RuntimeError(f"invalid build parameter {key} for {system['id']}")
    for key, value in bounds_gate.items():
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
            raise RuntimeError(f"invalid bounds-gate parameter {key} for {system['id']}")
    if bounds_gate != {
        "maximumAbsoluteCoordinateMetres": 100.0,
        "minimumDiagonalMetres": 1.0e-4,
        "maximumDiagonalMetres": 200.0,
    }:
        raise RuntimeError(f"build bounds gate differs from the reviewed contract for {system['id']}")
    exact_keys(
        record["privateInventory"],
        {
            "definitions",
            "occurrences",
            "rawSceneTriangles",
            "simplifiedSceneTriangles",
            "sourceSceneBoundsMetres",
            "chunks",
        },
        "private inventory",
    )

    artifact = exact_keys(record["artifact"], ARTIFACT_KEYS, "system artifact evidence")
    if artifact["basename"] != source.name:
        raise RuntimeError(f"artifact basename mismatch for {system['id']}")
    if natural_number(artifact["bytes"], "artifact bytes", positive=True) != source.stat().st_size:
        raise RuntimeError(f"artifact byte count mismatch for {system['id']}")
    if sha256_value(artifact["sha256"], "artifact SHA-256") != sha256_file(source):
        raise RuntimeError(f"artifact digest mismatch for {system['id']}")
    if artifact["vertices"] != vertices or artifact["triangles"] != triangles:
        raise RuntimeError(f"artifact geometry counts mismatch for {system['id']}")
    expected_decoded = vertices * 24 + triangles * 12
    if artifact["decodedGpuBytes"] != expected_decoded:
        raise RuntimeError(f"artifact decoded-memory evidence mismatch for {system['id']}")
    assets = artifact["assets"]
    if not isinstance(assets, list) or len(assets) != 1:
        raise RuntimeError(f"artifact asset inventory mismatch for {system['id']}")
    asset = exact_keys(
        assets[0],
        {"nodeName", "vertices", "triangles", "boundsMetres"},
        "system asset inventory",
    )
    if (
        asset["nodeName"] != system["nodeName"]
        or asset["vertices"] != vertices
        or asset["triangles"] != triangles
        or artifact["boundsMetres"] != asset["boundsMetres"]
    ):
        raise RuntimeError(f"artifact asset inventory does not match {system['id']}")
    if (
        not isinstance(record["seconds"], (int, float))
        or isinstance(record["seconds"], bool)
        or not math.isfinite(record["seconds"])
        or record["seconds"] < 0
    ):
        raise RuntimeError(f"invalid build duration for {system['id']}")
    return {
        "systemId": system["id"],
        "sourceSha256": source_sha256,
        "auditSha256": audit_sha256,
        "artifact": {
            "basename": source.name,
            "bytes": source.stat().st_size,
            "sha256": artifact["sha256"],
        },
        "buildRecord": {
            "basename": record_path.name,
            "bytes": record_path.stat().st_size,
            "sha256": sha256_file(record_path),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", type=Path)
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--role", choices=("preview", "high"), required=True)
    args = parser.parse_args()

    profile_path = args.profile.resolve(strict=True)
    input_directory = args.input_directory.resolve(strict=True)
    output = args.output.resolve()
    reviewed_profile_path = Path(__file__).with_name("profile.public.json").resolve(strict=True)
    if profile_path != reviewed_profile_path:
        raise SystemExit("aggregate builds must use the repository-reviewed public profile")
    if not input_directory.is_dir():
        raise SystemExit("input_directory must be a directory")
    for label, path in (("raw system inputs", input_directory), ("raw device LOD", output)):
        checkout = enclosing_git_checkout(path)
        if checkout is not None:
            raise SystemExit(f"{label} must stay outside every Git checkout: {checkout}")
    if output.is_relative_to(input_directory):
        raise SystemExit("aggregate output must not overlap the system input directory")
    expected_output_name = f"device.{args.role}.raw.glb"
    if output.name != expected_output_name:
        raise SystemExit(f"aggregate output filename must be {expected_output_name}")
    record_path = output.with_name(f"device.{args.role}.build.private.json")
    record_temporary = record_path.with_name(record_path.name + ".partial")
    staging_output = output.with_name(output.name + ".aggregate-stage.glb")
    generated_candidates = (
        output,
        output.with_name(output.name + ".partial"),
        record_path,
        record_temporary,
        staging_output,
        staging_output.with_name(staging_output.name + ".partial"),
    )
    if any(candidate.exists() for candidate in generated_candidates):
        raise SystemExit("aggregate output, provenance record, or partial file already exists")

    profile = json.loads(
        profile_path.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicate_keys,
        parse_constant=reject_nonfinite_constant,
    )
    profile_sha256 = sha256_file(profile_path)
    profile_bytes = profile_path.stat().st_size
    assets: list[MeshAsset] = []
    inputs: list[dict[str, object]] = []
    system_triangle_key = f"{args.role}TriangleBudget"
    source_digests: set[str] = set()
    total_triangles = 0
    total_vertices = 0
    for system in profile["systems"]:
        source = input_directory / f"{system['id']}.{args.role}.raw.glb"
        record = input_directory / f"{system['id']}.{args.role}.build.private.json"
        if not source.is_file() or not record.is_file():
            raise RuntimeError(f"missing reviewed {args.role} artifact/provenance pair: {system['id']}")
        expected_node = str(system["nodeName"])
        node_name, color, poly = read_raw_glb_mesh(source, expected_node)
        if color.upper() != str(system["color"]).upper():
            raise RuntimeError(f"public color mismatch for {system['id']}")
        triangles = int(poly.GetNumberOfPolys())
        vertices = int(poly.GetNumberOfPoints())
        if triangles <= 0 or triangles > int(system[system_triangle_key]):
            raise RuntimeError(f"{system['id']} exceeded its reviewed {args.role} triangle budget")
        evidence = load_system_record(
            record,
            source,
            system,
            args.role,
            profile_bytes,
            profile_sha256,
            vertices,
            triangles,
        )
        source_digest = str(evidence["sourceSha256"])
        if source_digest in source_digests:
            raise RuntimeError("two public systems were derived from the same private STEP bytes")
        source_digests.add(source_digest)
        inputs.append(evidence)
        total_triangles += triangles
        total_vertices += vertices
        assets.append(MeshAsset(node_name, color, poly))

    aggregate_triangle_budget = int(profile["budgets"][f"{args.role}Triangles"])
    aggregate_decoded_budget = int(profile["budgets"][f"{args.role}DecodedGpuBytes"])
    total_decoded = total_vertices * 24 + total_triangles * 12
    if total_triangles > aggregate_triangle_budget:
        raise RuntimeError(f"{args.role} device LOD exceeded its reviewed triangle budget")
    if total_decoded > aggregate_decoded_budget:
        raise RuntimeError(f"{args.role} device LOD exceeded its reviewed decoded GPU budget")

    published_output = False
    try:
        stats = write_raw_glb(staging_output, assets)
        if (
            stats["vertices"] != total_vertices
            or stats["triangles"] != total_triangles
            or stats["decodedGpuBytes"] != total_decoded
        ):
            raise RuntimeError("aggregate writer accounting changed unexpectedly")
        device_record = {
            "schemaVersion": "fusiondigital.exl50u-device-derivative-build.v1",
            "role": args.role,
            "profileSha256": profile_sha256,
            "inputs": inputs,
            "artifact": {"basename": output.name, **stats},
        }
        record_temporary.parent.mkdir(parents=True, exist_ok=True)
        record_temporary.write_text(
            json.dumps(device_record, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if output.exists() or record_path.exists():
            raise RuntimeError("aggregate destination appeared during the build; refusing to replace it")
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
    print(json.dumps({"role": args.role, "artifact": stats}), flush=True)


if __name__ == "__main__":
    main()
