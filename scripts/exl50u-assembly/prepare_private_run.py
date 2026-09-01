"""Bind one verified eight-system export set to a private build run.

The command is deliberately private and additive. It revalidates the PASS
export-set audit against the current public profile, rescans every canonical
STEP export, writes one strict system audit per export, and publishes the run
manifest last. No source path, source label, author field, or CAD payload is
copied into the manifest.

The run directory must not already exist and must resolve outside every Git
checkout. A directory without ``private-run.manifest.json`` is incomplete and
must never be consumed by the bounded CAD runner.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from source_audit import (
    TOKENS,
    enclosing_git_checkout,
    safe_format_facts,
    scan_stream,
    supported_application_protocol,
    validate_private_step_audit,
)


EXPORT_SET_SCHEMA = "fusiondigital.private-exl50u-export-set-audit.v1"
RUN_SCHEMA = "fusiondigital.private-exl50u-build-run.v1"
SYSTEM_AUDIT_SCHEMA = "fusiondigital.private-step-audit.v1"
MAX_SYSTEM_STEP_BYTES = 2_500_000_000
SHA256_HEX = frozenset("0123456789ABCDEF")


def fail(message: str) -> None:
    raise SystemExit(message)


def exact_keys(value: object, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        fail(f"{label} has an unexpected schema")
    return value


def natural_number(value: object, label: str, *, positive: bool = False) -> int:
    minimum = 1 if positive else 0
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        fail(f"{label} must be a {'positive' if positive else 'non-negative'} integer")
    return value


def sha256_value(value: object, label: str) -> str:
    normalized = value.upper() if isinstance(value, str) else ""
    if len(normalized) != 64 or any(character not in SHA256_HEX for character in normalized):
        fail(f"{label} must be a SHA-256 digest")
    return normalized


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            fail(f"private JSON contains duplicate key {key!r}")
        result[key] = value
    return result


def read_private_json(path: Path, label: str) -> tuple[Path, dict[str, Any], bytes]:
    if path.is_symlink():
        fail(f"{label} cannot be a symlink")
    try:
        resolved = path.resolve(strict=True)
    except OSError as error:
        fail(f"{label} cannot be resolved: {error}")
    if not resolved.is_file():
        fail(f"{label} must be a regular file")
    if enclosing_git_checkout(resolved) is not None:
        fail(f"{label} must stay outside every Git checkout")
    raw = resolved.read_bytes()
    try:
        parsed = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"{label} is not valid strict UTF-8 JSON: {error}")
    if not isinstance(parsed, dict):
        fail(f"{label} must contain a JSON object")
    return resolved, parsed, raw


def load_profile() -> tuple[dict[str, Any], bytes]:
    path = Path(__file__).with_name("profile.public.json")
    raw = path.read_bytes()
    try:
        profile = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"public profile is not valid strict UTF-8 JSON: {error}")
    if not isinstance(profile, dict):
        fail("public profile must contain a JSON object")
    systems = profile.get("systems")
    if not isinstance(systems, list) or len(systems) != 8:
        fail("public profile must define exactly eight systems")
    system_ids = [system.get("id") if isinstance(system, dict) else None for system in systems]
    if any(not isinstance(value, str) or not value for value in system_ids):
        fail("public profile contains an invalid system identity")
    if len(set(system_ids)) != 8:
        fail("public profile contains duplicate system identities")
    return profile, raw


def validate_counts(value: object, label: str) -> dict[str, int]:
    counts = exact_keys(value, set(TOKENS), label)
    return {
        key: natural_number(counts[key], f"{label}.{key}")
        for key in TOKENS
    }


def validate_export_set(
    report: dict[str, Any],
    profile: dict[str, Any],
) -> tuple[list[dict[str, Any]], str, dict[str, Any]]:
    exact_keys(
        report,
        {
            "schemaVersion",
            "profile",
            "privatePlan",
            "sourceAssembly",
            "contract",
            "exports",
            "issues",
            "status",
        },
        "export-set audit",
    )
    if report["schemaVersion"] != EXPORT_SET_SCHEMA or report["status"] != "PASS":
        fail("export-set audit is missing or did not pass")
    if report["issues"] != []:
        fail("PASS export-set audit must have no issues")

    systems = profile["systems"]
    expected_ids = [system["id"] for system in systems]
    profile_evidence = exact_keys(
        report["profile"],
        {"schemaVersion", "deviceId", "systemCount"},
        "export-set profile evidence",
    )
    if profile_evidence != {
        "schemaVersion": profile.get("schemaVersion"),
        "deviceId": profile.get("deviceId"),
        "systemCount": 8,
    }:
        fail("export-set audit was not created for the current public profile")

    private_plan = exact_keys(report["privatePlan"], {"sha256"}, "private plan evidence")
    private_plan_sha256 = sha256_value(private_plan["sha256"], "private plan SHA-256")
    source_assembly = exact_keys(
        report["sourceAssembly"], {"bytes", "sha256"}, "source assembly evidence"
    )
    source_assembly = {
        "bytes": natural_number(source_assembly["bytes"], "source assembly bytes", positive=True),
        "sha256": sha256_value(source_assembly["sha256"], "source assembly SHA-256"),
    }
    contract = exact_keys(
        report["contract"],
        {
            "applicationProtocols",
            "preserveCommonAssemblyOrigin",
            "preserveWorldPlacements",
            "recenter",
            "maximumSystemStepBytes",
        },
        "export-set contract",
    )
    if contract != {
        "applicationProtocols": ["AP214", "AP242"],
        "preserveCommonAssemblyOrigin": True,
        "preserveWorldPlacements": True,
        "recenter": False,
        "maximumSystemStepBytes": MAX_SYSTEM_STEP_BYTES,
    }:
        fail("export-set audit contract is not the fail-closed public derivative contract")

    exports = report["exports"]
    if not isinstance(exports, list) or len(exports) != 8:
        fail("export-set audit must contain exactly eight exports")
    validated: list[dict[str, Any]] = []
    seen_digests: set[str] = set()
    for index, (record, expected_id) in enumerate(zip(exports, expected_ids, strict=True)):
        record = exact_keys(
            record,
            {"publicSystemId", "artifact", "format", "counts"},
            f"export record {index}",
        )
        if record["publicSystemId"] != expected_id:
            fail("export-set system order or identity differs from the current public profile")
        artifact = exact_keys(
            record["artifact"], {"basename", "bytes", "sha256"}, f"{expected_id} artifact"
        )
        if artifact["basename"] != f"{expected_id}.step":
            fail(f"{expected_id} export basename is not canonical")
        bytes_count = natural_number(artifact["bytes"], f"{expected_id} bytes", positive=True)
        if bytes_count > MAX_SYSTEM_STEP_BYTES:
            fail(f"{expected_id} exceeds the system STEP ceiling")
        digest = sha256_value(artifact["sha256"], f"{expected_id} SHA-256")
        if digest in seen_digests:
            fail("export-set audit contains duplicate system content")
        seen_digests.add(digest)
        format_facts = exact_keys(
            record["format"],
            {"iso10303", "closed", "applicationProtocolFamily"},
            f"{expected_id} format",
        )
        if format_facts.get("iso10303") is not True or format_facts.get("closed") is not True:
            fail(f"{expected_id} is not a closed ISO-10303-21 export")
        if format_facts.get("applicationProtocolFamily") not in {"AP214", "AP242"}:
            fail(f"{expected_id} does not use AP214 or AP242")
        counts = validate_counts(record["counts"], f"{expected_id} counts")
        if counts["productDeclarations"] <= 0:
            fail(f"{expected_id} has no PRODUCT declaration")
        validated.append(
            {
                "publicSystemId": expected_id,
                "artifact": {
                    "basename": artifact["basename"],
                    "bytes": bytes_count,
                    "sha256": digest,
                },
                "format": dict(format_facts),
                "counts": counts,
            }
        )
    return validated, private_plan_sha256, source_assembly


def prepare_run_root(path: Path) -> Path:
    if path.is_symlink():
        fail("private run directory cannot be a symlink")
    candidate = path.resolve()
    parent = candidate.parent
    try:
        parent = parent.resolve(strict=True)
    except OSError as error:
        fail(f"private run parent must already exist: {error}")
    if not parent.is_dir():
        fail("private run parent must be a directory")
    if enclosing_git_checkout(parent) is not None:
        fail("private run directory must stay outside every Git checkout")
    if candidate.exists():
        fail("private run directory already exists; refusing to overwrite it")
    try:
        candidate.mkdir()
        (candidate / "audits").mkdir()
    except FileExistsError:
        fail("private run directory appeared concurrently; refusing to overwrite it")
    return candidate


def atomic_write_no_replace(path: Path, serialized: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.partial")
    if path.exists() or temporary.exists():
        fail(f"private output already exists: {path.name}")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            stream.write(serialized)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            fail(f"private output appeared concurrently: {path.name}")
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_set_audit", type=Path)
    parser.add_argument("export_root", type=Path)
    parser.add_argument("run_root", type=Path)
    args = parser.parse_args()

    export_audit_path, export_report, export_report_raw = read_private_json(
        args.export_set_audit, "export-set audit"
    )
    profile, profile_raw = load_profile()
    expected_exports, private_plan_sha256, source_assembly = validate_export_set(
        export_report, profile
    )

    if args.export_root.is_symlink():
        fail("private export root cannot be a symlink")
    try:
        export_root = args.export_root.resolve(strict=True)
    except OSError as error:
        fail(f"private export root cannot be resolved: {error}")
    if not export_root.is_dir():
        fail("private export root must be a directory")
    if enclosing_git_checkout(export_root) is not None:
        fail("private export root must stay outside every Git checkout")

    run_root = prepare_run_root(args.run_root)
    profile_sha256 = sha256_bytes(profile_raw)
    export_set_sha256 = sha256_bytes(export_report_raw)
    run_systems: list[dict[str, Any]] = []
    for expected in expected_exports:
        system_id = expected["publicSystemId"]
        source_path = export_root / expected["artifact"]["basename"]
        if source_path.is_symlink():
            fail(f"{system_id} STEP cannot be a symlink")
        try:
            source = source_path.resolve(strict=True)
        except OSError as error:
            fail(f"{system_id} STEP cannot be resolved: {error}")
        if not source.is_file() or source.parent != export_root:
            fail(f"{system_id} STEP escaped the verified export root")
        source_bytes = source.stat().st_size
        with source.open("rb") as stream:
            source_sha256, counts = scan_stream(stream)
        format_facts = safe_format_facts(source)
        supported, protocol_family = supported_application_protocol(
            format_facts.get("applicationProtocol")
        )
        format_facts["applicationProtocolFamily"] = protocol_family
        checks = {
            "expectedBytes": source_bytes == expected["artifact"]["bytes"],
            "expectedSha256": source_sha256 == expected["artifact"]["sha256"],
            "iso10303": format_facts.get("iso10303") is True,
            "closed": format_facts.get("closed") is True,
            "ap214OrAp242": supported,
        }
        if counts != expected["counts"]:
            fail(f"{system_id} STEP token counts changed after export-set verification")
        if protocol_family != expected["format"]["applicationProtocolFamily"]:
            fail(f"{system_id} STEP protocol changed after export-set verification")
        if not all(checks.values()):
            fail(f"{system_id} STEP changed after export-set verification")

        audit = {
            "schemaVersion": SYSTEM_AUDIT_SCHEMA,
            "publicSystemId": system_id,
            "source": {"bytes": source_bytes, "sha256": source_sha256},
            "format": format_facts,
            "counts": counts,
            "checks": checks,
            "status": "PASS",
        }
        validate_private_step_audit(
            audit,
            expected_public_system_id=system_id,
            actual_source_bytes=source_bytes,
            actual_source_sha256=source_sha256,
            actual_format={
                key: format_facts[key]
                for key in (
                    "iso10303",
                    "closed",
                    "applicationProtocol",
                    "maximumEntityIdInTrailer",
                )
            },
            actual_counts=counts,
        )
        audit_bytes = (json.dumps(audit, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        audit_name = f"{system_id}.audit.private.json"
        atomic_write_no_replace(run_root / "audits" / audit_name, audit_bytes)
        run_systems.append(
            {
                "publicSystemId": system_id,
                "source": expected["artifact"],
                "audit": {
                    "relativePath": f"audits/{audit_name}",
                    "bytes": len(audit_bytes),
                    "sha256": sha256_bytes(audit_bytes),
                },
                "roles": {
                    "preview": {
                        "status": "PENDING",
                        "artifactBasename": f"{system_id}.preview.raw.glb",
                        "buildRecordBasename": f"{system_id}.preview.build.private.json",
                    },
                    "high": {
                        "status": "PENDING",
                        "artifactBasename": f"{system_id}.high.raw.glb",
                        "buildRecordBasename": f"{system_id}.high.build.private.json",
                    },
                },
            }
        )

    manifest = {
        "schemaVersion": RUN_SCHEMA,
        "status": "PENDING",
        "profile": {
            "schemaVersion": profile["schemaVersion"],
            "deviceId": profile["deviceId"],
            "bytes": len(profile_raw),
            "sha256": profile_sha256,
        },
        "exportSetAudit": {
            "basename": export_audit_path.name,
            "bytes": len(export_report_raw),
            "sha256": export_set_sha256,
        },
        "privatePlan": {"sha256": private_plan_sha256},
        "sourceAssembly": source_assembly,
        "systems": run_systems,
        "aggregateRoles": {
            "preview": {
                "status": "PENDING",
                "rawBasename": "device.preview.raw.glb",
                "encodedBasename": "device.preview.meshopt.glb",
            },
            "high": {
                "status": "PENDING",
                "rawBasename": "device.high.raw.glb",
                "encodedBasename": "device.high.meshopt.glb",
            },
        },
        "review": {
            "commonOrigin": "PENDING",
            "visual": "PENDING",
            "publication": "CANDIDATE_NOT_RELEASED",
        },
        "publication": {
            "privateEvidenceOnly": True,
            "commitToGit": False,
            "includeInRelease": False,
        },
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    atomic_write_no_replace(run_root / "private-run.manifest.json", manifest_bytes)
    print(
        json.dumps(
            {
                "status": "PREPARED_PRIVATE_RUN",
                "systemCount": len(run_systems),
                "runManifestSha256": sha256_bytes(manifest_bytes),
            }
        )
    )


if __name__ == "__main__":
    main()
