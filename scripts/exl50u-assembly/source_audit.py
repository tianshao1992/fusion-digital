"""Stream a private STEP source audit without loading the model into memory.

The report is private build evidence. It intentionally omits STEP header text,
author fields, source filesystem paths and product labels. It may be written
next to the private source, but never under public/ or a release directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, BinaryIO


CHUNK_BYTES = 16 * 1024 * 1024
AUDIT_SCHEMA = "fusiondigital.private-step-audit.v1"
TOKENS = {
    "productDeclarations": b"=PRODUCT(",
    "assemblyUsageOccurrences": b"=NEXT_ASSEMBLY_USAGE_OCCURRENCE(",
    "advancedFaces": b"=ADVANCED_FACE(",
    "manifoldSolidBreps": b"=MANIFOLD_SOLID_BREP(",
    "closedShells": b"=CLOSED_SHELL(",
    "openShells": b"=OPEN_SHELL(",
    "styledItems": b"=STYLED_ITEM(",
}
AUDIT_TOP_LEVEL_KEYS = {
    "schemaVersion",
    "publicSystemId",
    "source",
    "format",
    "counts",
    "checks",
    "status",
}
AUDIT_SOURCE_KEYS = {"bytes", "sha256"}
AUDIT_FORMAT_KEYS = {
    "iso10303",
    "closed",
    "applicationProtocol",
    "maximumEntityIdInTrailer",
    "applicationProtocolFamily",
}
RAW_FORMAT_KEYS = AUDIT_FORMAT_KEYS - {"applicationProtocolFamily"}
AUDIT_CHECK_KEYS = {
    "expectedBytes",
    "expectedSha256",
    "iso10303",
    "closed",
    "ap214OrAp242",
}
SHA256_PATTERN = re.compile(r"^[0-9A-F]{64}$")


class PrivateStepAuditError(ValueError):
    """Raised when private STEP audit evidence is not exact and self-consistent."""


def _exact_object(value: object, expected_keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected_keys:
        raise PrivateStepAuditError(f"{label} has an unexpected schema")
    return value


def _reject_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise PrivateStepAuditError(f"private source audit contains duplicate key: {key}")
        result[key] = value
    return result


def load_private_step_audit(path: Path) -> dict[str, Any]:
    """Load UTF-8 JSON while rejecting duplicate object keys at every depth."""

    try:
        parsed = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_json_keys,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateStepAuditError("private source audit is not valid UTF-8 JSON") from error
    if not isinstance(parsed, dict):
        raise PrivateStepAuditError("private source audit must contain a JSON object")
    return parsed


def supported_application_protocol(value: object) -> tuple[bool, str | None]:
    """Return whether a STEP schema is an approved AP214/AP242 schema.

    AP214 exports commonly use AUTOMOTIVE_DESIGN[_CC2] rather than including
    the number 214 in FILE_SCHEMA. Keep the public report generic while
    rejecting older AP203 and unrecognised schemas.
    """

    if not isinstance(value, str) or not value.strip():
        return False, None
    normalized = value.strip().upper()
    if normalized in {"AUTOMOTIVE_DESIGN", "AUTOMOTIVE_DESIGN_CC2"}:
        return True, "AP214"
    ap214 = re.search(r"(?:^|_)AP_?214(?:_|$)", normalized) is not None
    ap214 = ap214 or re.search(r"(?:^|_)ISO_?10303_?214(?:_|$)", normalized) is not None
    ap242 = re.search(r"(?:^|_)AP_?242(?:_|$)", normalized) is not None
    ap242 = ap242 or re.search(r"(?:^|_)ISO_?10303_?242(?:_|$)", normalized) is not None
    if ap214 and not ap242:
        return True, "AP214"
    if ap242 and not ap214:
        return True, "AP242"
    return False, None


def enclosing_git_checkout(path: Path) -> Path | None:
    candidate = path.resolve()
    if not candidate.exists():
        candidate = candidate.parent
        while not candidate.exists() and candidate != candidate.parent:
            candidate = candidate.parent
    for ancestor in (candidate, *candidate.parents):
        if (ancestor / ".git").exists():
            return ancestor
    return None


def scan_stream(stream: BinaryIO) -> tuple[str, dict[str, int]]:
    digest = hashlib.sha256()
    counts = {name: 0 for name in TOKENS}
    maximum_token = max(len(token) for token in TOKENS.values())
    carry = b""
    while chunk := stream.read(CHUNK_BYTES):
        digest.update(chunk)
        combined = carry + chunk
        for name, token in TOKENS.items():
            counts[name] += combined.count(token) - carry.count(token)
        carry = combined[-(maximum_token - 1) :]
    return digest.hexdigest().upper(), counts


def safe_format_facts(source: Path) -> dict[str, object]:
    size = source.stat().st_size
    with source.open("rb") as stream:
        header = stream.read(min(size, 512 * 1024))
        stream.seek(max(0, size - 2 * 1024 * 1024), os.SEEK_SET)
        trailer = stream.read()

    protocol_match = re.search(rb"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'", header, re.IGNORECASE)
    maximum_ids = [int(value) for value in re.findall(rb"(?m)^#(\d+)\s*=", trailer)]
    return {
        "iso10303": header.lstrip().startswith(b"ISO-10303-21;"),
        "closed": b"ENDSEC;" in trailer and trailer.rstrip().endswith(b"END-ISO-10303-21;"),
        "applicationProtocol": protocol_match.group(1).decode("ascii", "replace") if protocol_match else None,
        "maximumEntityIdInTrailer": max(maximum_ids, default=None),
    }


def validate_private_step_audit_schema(
    audit: object,
    *,
    expected_public_system_id: str | None,
) -> dict[str, Any]:
    """Validate the exact v1 evidence contract before touching a large STEP.

    This stage deliberately needs no source scan. It rejects structurally
    incomplete, extended, non-canonical or internally contradictory evidence
    before a bounded worker spends time hashing a multi-gigabyte export.
    """

    report = _exact_object(audit, AUDIT_TOP_LEVEL_KEYS, "private source audit")
    if report["schemaVersion"] != AUDIT_SCHEMA:
        raise PrivateStepAuditError("private source audit schemaVersion is not supported")
    if report["publicSystemId"] != expected_public_system_id:
        raise PrivateStepAuditError("private source audit has the wrong public system identity")
    if report["status"] != "PASS":
        raise PrivateStepAuditError("private source audit did not pass")

    source = _exact_object(report["source"], AUDIT_SOURCE_KEYS, "private source audit source")
    if type(source["bytes"]) is not int or source["bytes"] <= 0:
        raise PrivateStepAuditError("private source audit source.bytes must be a positive integer")
    if not isinstance(source["sha256"], str) or not SHA256_PATTERN.fullmatch(source["sha256"]):
        raise PrivateStepAuditError("private source audit source.sha256 is not canonical SHA-256")

    facts = _exact_object(report["format"], AUDIT_FORMAT_KEYS, "private source audit format")
    if type(facts["iso10303"]) is not bool or type(facts["closed"]) is not bool:
        raise PrivateStepAuditError("private source audit STEP flags must be booleans")
    maximum_entity_id = facts["maximumEntityIdInTrailer"]
    if maximum_entity_id is not None and (
        type(maximum_entity_id) is not int or maximum_entity_id <= 0
    ):
        raise PrivateStepAuditError(
            "private source audit maximumEntityIdInTrailer must be null or a positive integer"
        )
    supported_protocol, protocol_family = supported_application_protocol(
        facts["applicationProtocol"]
    )
    if not supported_protocol or facts["applicationProtocolFamily"] != protocol_family:
        raise PrivateStepAuditError("private source audit is not STEP AP214/AP242")
    if facts["iso10303"] is not True or facts["closed"] is not True:
        raise PrivateStepAuditError("private source audit is not a closed ISO-10303-21 file")

    counts = _exact_object(report["counts"], set(TOKENS), "private source audit counts")
    if any(type(value) is not int or value < 0 for value in counts.values()):
        raise PrivateStepAuditError("private source audit counts must be non-negative integers")
    if counts["productDeclarations"] <= 0:
        raise PrivateStepAuditError("private source audit contains no product declaration")

    checks = _exact_object(report["checks"], AUDIT_CHECK_KEYS, "private source audit checks")
    if any(value is not True for value in checks.values()):
        raise PrivateStepAuditError("all five private source audit checks must be true")
    if (
        checks["iso10303"] is not facts["iso10303"]
        or checks["closed"] is not facts["closed"]
        or checks["ap214OrAp242"] is not supported_protocol
    ):
        raise PrivateStepAuditError("private source audit checks contradict its format facts")
    return report


def validate_private_step_audit(
    audit: object,
    *,
    expected_public_system_id: str | None,
    actual_source_bytes: int,
    actual_source_sha256: str,
    actual_format: dict[str, object],
    actual_counts: dict[str, int],
) -> dict[str, Any]:
    """Bind an exact audit contract to facts from one streaming source scan."""

    report = validate_private_step_audit_schema(
        audit,
        expected_public_system_id=expected_public_system_id,
    )
    if type(actual_source_bytes) is not int or actual_source_bytes <= 0:
        raise PrivateStepAuditError("actual STEP byte count must be a positive integer")
    if not isinstance(actual_source_sha256, str) or not SHA256_PATTERN.fullmatch(
        actual_source_sha256
    ):
        raise PrivateStepAuditError("actual STEP digest is not canonical SHA-256")
    source = report["source"]
    if source["bytes"] != actual_source_bytes or source["sha256"] != actual_source_sha256:
        raise PrivateStepAuditError("private STEP source no longer matches its approved audit")

    if not isinstance(actual_format, dict) or set(actual_format) != RAW_FORMAT_KEYS:
        raise PrivateStepAuditError("actual STEP format scanner returned an unexpected schema")
    supported_protocol, protocol_family = supported_application_protocol(
        actual_format["applicationProtocol"]
    )
    if not supported_protocol:
        raise PrivateStepAuditError("actual STEP source is not AP214/AP242")
    expected_format = {
        **actual_format,
        "applicationProtocolFamily": protocol_family,
    }
    if report["format"] != expected_format:
        raise PrivateStepAuditError("private source audit format facts do not match the STEP source")

    if not isinstance(actual_counts, dict) or set(actual_counts) != set(TOKENS):
        raise PrivateStepAuditError("actual STEP token scanner returned an unexpected schema")
    if any(type(value) is not int or value < 0 for value in actual_counts.values()):
        raise PrivateStepAuditError("actual STEP token counts must be non-negative integers")
    if report["counts"] != actual_counts:
        raise PrivateStepAuditError("private source audit counts do not match the STEP source")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--expect-bytes", type=int)
    parser.add_argument("--expect-sha256")
    parser.add_argument("--system-id", help="approved public system identity for a private system export")
    args = parser.parse_args()

    source = args.source.resolve(strict=True)
    if not source.is_file():
        raise SystemExit("source must be a regular file")
    source_checkout = enclosing_git_checkout(source)
    if source_checkout is not None:
        raise SystemExit(f"private STEP source must stay outside every Git checkout: {source_checkout}")
    source_bytes = source.stat().st_size
    with source.open("rb") as stream:
        source_sha256, counts = scan_stream(stream)
    facts = safe_format_facts(source)
    supported_protocol, protocol_family = supported_application_protocol(
        facts["applicationProtocol"]
    )
    facts["applicationProtocolFamily"] = protocol_family
    approved_system_ids = {
        str(system["id"])
        for system in json.loads(
            Path(__file__).with_name("profile.public.json").read_text(encoding="utf-8")
        )["systems"]
    }
    if args.system_id is not None and args.system_id not in approved_system_ids:
        raise SystemExit("system-id is outside the reviewed public profile")

    checks = {
        "expectedBytes": args.expect_bytes is None or source_bytes == args.expect_bytes,
        "expectedSha256": args.expect_sha256 is None or source_sha256 == args.expect_sha256.upper(),
        "iso10303": facts["iso10303"] is True,
        "closed": facts["closed"] is True,
        "ap214OrAp242": supported_protocol,
    }
    report = {
        "schemaVersion": AUDIT_SCHEMA,
        "publicSystemId": args.system_id,
        "source": {
            "bytes": source_bytes,
            "sha256": source_sha256,
        },
        "format": facts,
        "counts": counts,
        "checks": checks,
        "status": "PASS" if all(checks.values()) else "FAIL",
    }
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output = args.output.resolve()
        if output == source:
            raise SystemExit("private audit output cannot overwrite the STEP source")
        output_checkout = enclosing_git_checkout(output)
        if output_checkout is not None:
            raise SystemExit(
                f"private STEP audit evidence must stay outside every Git checkout: {output_checkout}"
            )
        if output.suffix.lower() != ".json":
            raise SystemExit("private STEP audit output must use the .json suffix")
        if output.exists() or output.with_name(output.name + ".partial").exists():
            raise SystemExit("private audit output or its partial file already exists; refusing to overwrite it")
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_name(output.name + ".partial")
        temporary.write_text(serialized, encoding="utf-8")
        temporary.replace(output)
    print(json.dumps(report, ensure_ascii=False))
    if report["status"] != "PASS":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
