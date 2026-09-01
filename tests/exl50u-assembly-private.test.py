"""Private-boundary tests for the EXL-50U export-set streaming gate.

The fixture is synthetic text and contains no project CAD data. Temporary
inputs are created outside the repository because production private evidence
is required to remain outside every Git checkout.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PIPELINE_ROOT = ROOT / "scripts" / "exl50u-assembly"
VERIFY_SCRIPT = PIPELINE_ROOT / "verify_export_set.py"
RUN_SYSTEM_BUILD_SCRIPT = PIPELINE_ROOT / "run_system_build.py"
BUILD_SYSTEM_SHARD_SCRIPT = PIPELINE_ROOT / "build_system_shard.py"
PROFILE = json.loads((PIPELINE_ROOT / "profile.public.json").read_text(encoding="utf-8"))
SYSTEM_IDS = [str(system["id"]) for system in PROFILE["systems"]]
sys.path.insert(0, str(PIPELINE_ROOT))

from source_audit import (  # noqa: E402
    PrivateStepAuditError,
    load_private_step_audit,
    safe_format_facts,
    scan_stream,
    supported_application_protocol,
    validate_private_step_audit,
    validate_private_step_audit_schema,
)


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def synthetic_step(index: int) -> bytes:
    schema = "AUTOMOTIVE_DESIGN_CC2" if index % 2 == 0 else "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF"
    return (
        "ISO-10303-21;\n"
        "HEADER;\n"
        f"FILE_DESCRIPTION(('synthetic export {index}'),'2;1');\n"
        f"FILE_SCHEMA(('{schema}'));\n"
        "ENDSEC;\n"
        "DATA;\n"
        f"#{index + 1}=PRODUCT('SYNTHETIC-{index}','','',());\n"
        "ENDSEC;\n"
        "END-ISO-10303-21;\n"
    ).encode("ascii")


def strict_system_audit(
    source: Path,
    system_id: str | None,
) -> tuple[dict[str, object], dict[str, object]]:
    with source.open("rb") as stream:
        digest, counts = scan_stream(stream)
    facts = safe_format_facts(source)
    supported, protocol_family = supported_application_protocol(facts["applicationProtocol"])
    if not supported:
        raise AssertionError("synthetic strict-audit fixture must use AP214/AP242")
    audit: dict[str, object] = {
        "schemaVersion": "fusiondigital.private-step-audit.v1",
        "publicSystemId": system_id,
        "source": {"bytes": source.stat().st_size, "sha256": digest},
        "format": {**facts, "applicationProtocolFamily": protocol_family},
        "counts": counts,
        "checks": {
            "expectedBytes": True,
            "expectedSha256": True,
            "iso10303": True,
            "closed": True,
            "ap214OrAp242": True,
        },
        "status": "PASS",
    }
    actual = {
        "actual_source_bytes": source.stat().st_size,
        "actual_source_sha256": digest,
        "actual_format": facts,
        "actual_counts": counts,
    }
    return audit, actual


class ExportSetVerifierTests(unittest.TestCase):
    def test_ap214_iso_short_name_tuple_is_recognized_strictly(self) -> None:
        supported, family = supported_application_protocol(
            "AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }"
        )
        self.assertTrue(supported)
        self.assertEqual(family, "AP214")

        for rejected in (
            "AUTOMOTIVE_DESIGN { 1 0 10303 203 3 1 1 }",
            "AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 } FORGED",
            "AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 }",
        ):
            with self.subTest(schema=rejected):
                self.assertEqual(supported_application_protocol(rejected), (False, None))

    def create_contract(self, root: Path) -> tuple[Path, Path, Path]:
        exports = root / "exports"
        exports.mkdir()
        for index, system_id in enumerate(SYSTEM_IDS):
            (exports / f"{system_id}.step").write_bytes(synthetic_step(index))

        source_path = root / "authoritative-source.stp"
        source_bytes = synthetic_step(90)
        source_path.write_bytes(source_bytes)
        source_identity = {"bytes": len(source_bytes), "sha256": sha256(source_bytes)}
        plan = {
            "schemaVersion": "fusiondigital.private-exl50u-system-export-plan.v1",
            "sourceAssembly": source_identity,
            "exportContract": {
                "format": "STEP AP214 or AP242",
                "preserveCommonAssemblyOrigin": True,
                "preserveWorldPlacements": True,
                "recenter": False,
                "includePmi": False,
                "includeDrawings": False,
                "includeBom": False,
                "includeAuthorMetadata": False,
            },
            "systems": [
                {
                    "publicSystemId": system_id,
                    "privateTopLevelLabel": f"synthetic-redacted-label-{index}",
                    "exportFilename": f"{system_id}.step",
                }
                for index, system_id in enumerate(SYSTEM_IDS)
            ],
            "publication": {
                "privateEvidenceOnly": True,
                "commitToGit": False,
                "includeInRelease": False,
            },
        }
        plan_path = root / "system-export-plan.private.json"
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
        audit, _actual = strict_system_audit(source_path, None)
        audit_path = root / "source-audit.private.json"
        audit_path.write_text(json.dumps(audit), encoding="utf-8")
        return plan_path, audit_path, exports

    def run_verifier(self, plan: Path, audit: Path, exports: Path, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(VERIFY_SCRIPT),
                str(plan),
                str(exports),
                "--source-audit",
                str(audit),
                "--output",
                str(output),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def test_strict_system_audit_binds_exact_schema_format_and_stream_counts(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-") as temporary:
            root = Path(temporary)
            system_id = SYSTEM_IDS[0]
            source = root / f"{system_id}.step"
            source.write_bytes(synthetic_step(0))
            audit, actual = strict_system_audit(source, system_id)

            self.assertIs(
                validate_private_step_audit_schema(
                    audit,
                    expected_public_system_id=system_id,
                ),
                audit,
            )
            self.assertIs(
                validate_private_step_audit(
                    audit,
                    expected_public_system_id=system_id,
                    **actual,
                ),
                audit,
            )

            mutations = {
                "top-level extra field": lambda value: value.__setitem__("forged", True),
                "nested extra field": lambda value: value["source"].__setitem__("path", "private.step"),
                "missing check": lambda value: value["checks"].pop("expectedSha256"),
                "false check": lambda value: value["checks"].__setitem__("expectedSha256", False),
                "AP203 protocol": lambda value: value["format"].update(
                    {
                        "applicationProtocol": "CONFIG_CONTROL_DESIGN",
                        "applicationProtocolFamily": None,
                    }
                ),
                "forged count": lambda value: value["counts"].__setitem__(
                    "productDeclarations",
                    value["counts"]["productDeclarations"] + 1,
                ),
                "forged format fact": lambda value: value["format"].__setitem__(
                    "maximumEntityIdInTrailer",
                    value["format"]["maximumEntityIdInTrailer"] + 1,
                ),
            }
            for label, mutate in mutations.items():
                with self.subTest(label=label):
                    candidate = copy.deepcopy(audit)
                    mutate(candidate)
                    with self.assertRaises(PrivateStepAuditError):
                        validate_private_step_audit(
                            candidate,
                            expected_public_system_id=system_id,
                            **actual,
                        )

    def test_both_build_entrypoints_reject_extended_audit_before_worker_launch(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-") as temporary:
            root = Path(temporary)
            system_id = SYSTEM_IDS[0]
            source = root / f"{system_id}.step"
            source.write_bytes(synthetic_step(0))
            audit, _actual = strict_system_audit(source, system_id)
            audit["forged"] = True
            audit_path = root / f"{system_id}.audit.private.json"
            audit_path.write_text(json.dumps(audit), encoding="utf-8")

            runner = subprocess.run(
                [
                    sys.executable,
                    str(RUN_SYSTEM_BUILD_SCRIPT),
                    str(source),
                    str(audit_path),
                    str(root / f"{system_id}.preview.raw.glb"),
                    str(root / "runner-scratch"),
                    "--system-id",
                    system_id,
                    "--role",
                    "preview",
                ],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertNotEqual(runner.returncode, 0)
            self.assertIn("unexpected schema", runner.stdout + runner.stderr)

            worker_environment = os.environ.copy()
            worker_environment["FUSIONDIGITAL_EXL50U_BOUNDED_WORKER"] = "1"
            worker = subprocess.run(
                [
                    sys.executable,
                    str(BUILD_SYSTEM_SHARD_SCRIPT),
                    str(source),
                    str(root / f"{system_id}.preview.raw.glb"),
                    str(root / "worker-scratch"),
                    "--system-id",
                    system_id,
                    "--role",
                    "preview",
                    "--audit",
                    str(audit_path),
                ],
                cwd=ROOT,
                env=worker_environment,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            self.assertNotEqual(worker.returncode, 0)
            self.assertIn("unexpected schema", worker.stdout + worker.stderr)

    def test_private_audit_loader_rejects_duplicate_json_keys(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-") as temporary:
            audit_path = Path(temporary) / "duplicate.private.json"
            audit_path.write_text('{"schemaVersion":"first","schemaVersion":"second"}', encoding="utf-8")
            with self.assertRaises(PrivateStepAuditError):
                load_private_step_audit(audit_path)

    def test_complete_ap214_ap242_export_set_passes_without_label_leakage(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-") as temporary:
            root = Path(temporary)
            plan, audit, exports = self.create_contract(root)
            output = root / "export-set.audit.private.json"
            result = self.run_verifier(plan, audit, exports, output)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(len(report["exports"]), 8)
            serialized = json.dumps(report)
            self.assertNotIn("synthetic-redacted-label", serialized)
            self.assertNotIn(str(root), serialized)
            self.assertEqual(
                {entry["format"]["applicationProtocolFamily"] for entry in report["exports"]},
                {"AP214", "AP242"},
            )

    def test_unexpected_step_file_blocks_the_set(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-") as temporary:
            root = Path(temporary)
            plan, audit, exports = self.create_contract(root)
            (exports / "unexpected.stp").write_bytes(synthetic_step(99))
            output = root / "export-set.audit.private.json"
            result = self.run_verifier(plan, audit, exports, output)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "BLOCKED")
            self.assertIn("exportSet:unexpectedStepFiles:1", report["issues"])

    def test_forged_monolithic_audit_blocks_before_export_acceptance(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-") as temporary:
            root = Path(temporary)
            plan, audit_path, exports = self.create_contract(root)
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            audit["checks"]["expectedSha256"] = False
            audit_path.write_text(json.dumps(audit), encoding="utf-8")
            output = root / "export-set.audit.private.json"
            result = self.run_verifier(plan, audit_path, exports, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("strict PASS evidence", result.stdout + result.stderr)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
