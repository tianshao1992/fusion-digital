"""Verify the private eight-system STEP export set without loading CAD.

This is a pre-conversion gate. It binds the reviewed private export plan to
the monolithic source audit, verifies the exact generic filenames, and scans
each STEP as a byte stream. Private CAD labels and filesystem paths are never
written to the report or printed to stdout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from source_audit import (
    PrivateStepAuditError,
    enclosing_git_checkout,
    safe_format_facts,
    scan_stream,
    supported_application_protocol,
    validate_private_step_audit_schema,
)


MAX_SYSTEM_STEP_BYTES = 2_500_000_000
PLAN_SCHEMA = "fusiondigital.private-exl50u-system-export-plan.v1"
SOURCE_AUDIT_SCHEMA = "fusiondigital.private-step-audit.v1"
REPORT_SCHEMA = "fusiondigital.private-exl50u-export-set-audit.v1"


def fail(message: str) -> None:
    raise SystemExit(message)


def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            fail(f"private JSON contains duplicate key {key!r}")
        result[key] = value
    return result


def exact_keys(value: object, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        fail(f"{label} has an unexpected schema")
    return value


def read_private_json(path: Path, label: str) -> tuple[Path, dict[str, Any], bytes]:
    if path.is_symlink():
        fail(f"{label} cannot be a symlink")
    resolved = path.resolve(strict=True)
    if not resolved.is_file():
        fail(f"{label} must be a regular file")
    if enclosing_git_checkout(resolved) is not None:
        fail(f"{label} must stay outside every Git checkout")
    raw = resolved.read_bytes()
    try:
        parsed = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"{label} is not valid UTF-8 JSON: {error}")
    if not isinstance(parsed, dict):
        fail(f"{label} must contain a JSON object")
    return resolved, parsed, raw


def validate_sha256(value: object, label: str) -> str:
    normalized = str(value).upper() if isinstance(value, str) else ""
    if len(normalized) != 64 or any(character not in "0123456789ABCDEF" for character in normalized):
        fail(f"{label} must be an uppercase-compatible SHA-256 digest")
    return normalized


def validate_plan(plan: dict[str, Any], public_system_ids: list[str]) -> None:
    exact_keys(
        plan,
        {"schemaVersion", "sourceAssembly", "exportContract", "systems", "publication"},
        "private export plan",
    )
    if plan["schemaVersion"] != PLAN_SCHEMA:
        fail("private export plan schemaVersion is not supported")

    source = exact_keys(plan["sourceAssembly"], {"bytes", "sha256"}, "plan sourceAssembly")
    if not isinstance(source["bytes"], int) or source["bytes"] <= 0:
        fail("plan sourceAssembly.bytes must be a positive integer")
    validate_sha256(source["sha256"], "plan sourceAssembly.sha256")

    contract = exact_keys(
        plan["exportContract"],
        {
            "format",
            "preserveCommonAssemblyOrigin",
            "preserveWorldPlacements",
            "recenter",
            "includePmi",
            "includeDrawings",
            "includeBom",
            "includeAuthorMetadata",
        },
        "plan exportContract",
    )
    required_contract = {
        "format": "STEP AP214 or AP242",
        "preserveCommonAssemblyOrigin": True,
        "preserveWorldPlacements": True,
        "recenter": False,
        "includePmi": False,
        "includeDrawings": False,
        "includeBom": False,
        "includeAuthorMetadata": False,
    }
    if contract != required_contract:
        fail("private export plan does not match the reviewed export contract")

    publication = exact_keys(
        plan["publication"],
        {"privateEvidenceOnly", "commitToGit", "includeInRelease"},
        "plan publication",
    )
    if publication != {
        "privateEvidenceOnly": True,
        "commitToGit": False,
        "includeInRelease": False,
    }:
        fail("private export plan publication boundary is not fail-closed")

    systems = plan["systems"]
    if not isinstance(systems, list) or len(systems) != len(public_system_ids):
        fail("private export plan must contain the exact reviewed system count")
    private_labels: set[str] = set()
    for index, (system, expected_id) in enumerate(zip(systems, public_system_ids, strict=True)):
        record = exact_keys(
            system,
            {"publicSystemId", "privateTopLevelLabel", "exportFilename"},
            f"plan system record {index}",
        )
        private_label = record["privateTopLevelLabel"]
        if not isinstance(private_label, str) or not private_label.strip():
            fail(f"plan system record {index} has no private label")
        if private_label in private_labels:
            fail("private export plan contains a duplicate private label")
        private_labels.add(private_label)
        if record["publicSystemId"] != expected_id:
            fail("private export plan system order or public identity differs from the profile")
        if record["exportFilename"] != f"{expected_id}.step":
            fail(f"private export filename for {expected_id} is not canonical")


def validate_source_audit(audit: dict[str, Any], plan: dict[str, Any]) -> None:
    try:
        validate_private_step_audit_schema(audit, expected_public_system_id=None)
    except PrivateStepAuditError as error:
        fail(f"monolithic source audit is not strict PASS evidence: {error}")
    if audit["schemaVersion"] != SOURCE_AUDIT_SCHEMA:
        fail("monolithic source audit schemaVersion is not supported")
    source = exact_keys(audit.get("source"), {"bytes", "sha256"}, "source audit source")
    planned = plan["sourceAssembly"]
    if source["bytes"] != planned["bytes"]:
        fail("source audit byte count differs from the private export plan")
    if validate_sha256(source["sha256"], "source audit source.sha256") != validate_sha256(
        planned["sha256"], "plan sourceAssembly.sha256"
    ):
        fail("source audit digest differs from the private export plan")
    facts = audit.get("format")
    if not isinstance(facts, dict):
        fail("source audit format facts are missing")
    supported, _family = supported_application_protocol(facts.get("applicationProtocol"))
    if facts.get("iso10303") is not True or facts.get("closed") is not True or not supported:
        fail("monolithic source audit is not a closed STEP AP214/AP242 file")


def safe_export_record(system_id: str, path: Path) -> tuple[dict[str, Any] | None, list[str]]:
    issues: list[str] = []
    if not path.exists():
        return None, [f"{system_id}:missing"]
    if path.is_symlink() or not path.is_file():
        return None, [f"{system_id}:notRegularFile"]
    try:
        resolved = path.resolve(strict=True)
    except OSError:
        return None, [f"{system_id}:unresolvable"]
    if resolved.parent != path.parent.resolve(strict=True):
        return None, [f"{system_id}:escapedExportRoot"]
    size = resolved.stat().st_size
    if size <= 0:
        return None, [f"{system_id}:empty"]
    if size > MAX_SYSTEM_STEP_BYTES:
        return None, [f"{system_id}:exceedsSystemInputCeiling"]

    with resolved.open("rb") as stream:
        digest, counts = scan_stream(stream)
    facts = safe_format_facts(resolved)
    supported, protocol_family = supported_application_protocol(facts.get("applicationProtocol"))
    if facts.get("iso10303") is not True:
        issues.append(f"{system_id}:notIso10303Part21")
    if facts.get("closed") is not True:
        issues.append(f"{system_id}:notClosed")
    if not supported:
        issues.append(f"{system_id}:unsupportedApplicationProtocol")
    if counts.get("productDeclarations", 0) <= 0:
        issues.append(f"{system_id}:noProductDeclaration")

    record = {
        "publicSystemId": system_id,
        "artifact": {"basename": path.name, "bytes": size, "sha256": digest},
        "format": {
            "iso10303": facts.get("iso10303") is True,
            "closed": facts.get("closed") is True,
            "applicationProtocolFamily": protocol_family,
        },
        "counts": counts,
    }
    return record, issues


def write_private_report(output: Path, serialized: str, protected: set[Path]) -> None:
    if output.is_symlink():
        fail("private export-set report cannot be a symlink")
    resolved = output.resolve()
    if resolved in protected:
        fail("private export-set report cannot overwrite an input")
    if enclosing_git_checkout(resolved) is not None:
        fail("private export-set report must stay outside every Git checkout")
    if resolved.suffix.lower() != ".json":
        fail("private export-set report must use the .json suffix")
    partial = resolved.with_name(resolved.name + ".partial")
    if resolved.exists() or partial.exists():
        fail("private export-set report or its partial file already exists")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    partial.write_text(serialized, encoding="utf-8")
    partial.replace(resolved)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan", type=Path)
    parser.add_argument("export_root", type=Path)
    parser.add_argument("--source-audit", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    plan_path, plan, plan_raw = read_private_json(args.plan, "private export plan")
    audit_path, source_audit, _audit_raw = read_private_json(
        args.source_audit, "monolithic source audit"
    )
    profile = json.loads(Path(__file__).with_name("profile.public.json").read_text(encoding="utf-8"))
    public_system_ids = [str(system["id"]) for system in profile["systems"]]
    if len(public_system_ids) != 8 or len(set(public_system_ids)) != 8:
        fail("public profile must define exactly eight unique systems")

    validate_plan(plan, public_system_ids)
    validate_source_audit(source_audit, plan)

    if args.export_root.is_symlink():
        fail("private export root cannot be a symlink")
    export_root = args.export_root.resolve(strict=True)
    if not export_root.is_dir():
        fail("private export root must be a directory")
    if enclosing_git_checkout(export_root) is not None:
        fail("private export root must stay outside every Git checkout")

    actual_step_names = {
        entry.name
        for entry in export_root.iterdir()
        if entry.is_file() and entry.suffix.lower() in {".step", ".stp"}
    }
    expected_step_names = {f"{system_id}.step" for system_id in public_system_ids}
    issues: list[str] = []
    unexpected_count = len(actual_step_names - expected_step_names)
    if unexpected_count:
        issues.append(f"exportSet:unexpectedStepFiles:{unexpected_count}")

    exports: list[dict[str, Any]] = []
    seen_hashes: dict[str, str] = {}
    for system_id in public_system_ids:
        record, record_issues = safe_export_record(system_id, export_root / f"{system_id}.step")
        issues.extend(record_issues)
        if record is None:
            continue
        digest = str(record["artifact"]["sha256"])
        if digest in seen_hashes:
            issues.append(f"{system_id}:duplicateContentWith:{seen_hashes[digest]}")
        else:
            seen_hashes[digest] = system_id
        exports.append(record)

    report = {
        "schemaVersion": REPORT_SCHEMA,
        "profile": {
            "schemaVersion": profile["schemaVersion"],
            "deviceId": profile["deviceId"],
            "systemCount": len(public_system_ids),
        },
        "privatePlan": {"sha256": hashlib.sha256(plan_raw).hexdigest().upper()},
        "sourceAssembly": {
            "bytes": plan["sourceAssembly"]["bytes"],
            "sha256": validate_sha256(plan["sourceAssembly"]["sha256"], "source digest"),
        },
        "contract": {
            "applicationProtocols": ["AP214", "AP242"],
            "preserveCommonAssemblyOrigin": True,
            "preserveWorldPlacements": True,
            "recenter": False,
            "maximumSystemStepBytes": MAX_SYSTEM_STEP_BYTES,
        },
        "exports": exports,
        "issues": issues,
        "status": "PASS" if not issues and len(exports) == len(public_system_ids) else "BLOCKED",
    }
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output is not None:
        write_private_report(args.output, serialized, {plan_path, audit_path, export_root})
    print(json.dumps(report, ensure_ascii=False))
    if report["status"] != "PASS":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
