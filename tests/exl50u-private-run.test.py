"""Synthetic provenance tests for the EXL-50U private build-run bridge."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PIPELINE_ROOT = ROOT / "scripts" / "exl50u-assembly"
SOURCE_AUDIT_SCRIPT = PIPELINE_ROOT / "source_audit.py"
VERIFY_EXPORT_SET_SCRIPT = PIPELINE_ROOT / "verify_export_set.py"
PREPARE_RUN_SCRIPT = PIPELINE_ROOT / "prepare_private_run.py"
PROFILE = json.loads((PIPELINE_ROOT / "profile.public.json").read_text(encoding="utf-8"))
SYSTEM_IDS = [str(system["id"]) for system in PROFILE["systems"]]


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def synthetic_step(index: int) -> bytes:
    schema = (
        "AUTOMOTIVE_DESIGN_CC2"
        if index % 2 == 0
        else "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF"
    )
    return (
        "ISO-10303-21;\n"
        "HEADER;\n"
        f"FILE_DESCRIPTION(('synthetic evidence {index}'),'2;1');\n"
        f"FILE_SCHEMA(('{schema}'));\n"
        "ENDSEC;\n"
        "DATA;\n"
        f"#{index + 1}=PRODUCT('SYNTHETIC-{index}','','',());\n"
        "ENDSEC;\n"
        "END-ISO-10303-21;\n"
    ).encode("ascii")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


class PrivateRunPreparationTests(unittest.TestCase):
    def prepare_verified_export_set(self, root: Path) -> tuple[Path, Path]:
        exports = root / "exports"
        exports.mkdir()
        for index, system_id in enumerate(SYSTEM_IDS):
            (exports / f"{system_id}.step").write_bytes(synthetic_step(index))

        monolithic = root / "authoritative-source.stp"
        monolithic_bytes = synthetic_step(90)
        monolithic.write_bytes(monolithic_bytes)
        source_audit = root / "source-audit.private.json"
        audit_result = run(
            [
                sys.executable,
                str(SOURCE_AUDIT_SCRIPT),
                str(monolithic),
                "--expect-bytes",
                str(len(monolithic_bytes)),
                "--expect-sha256",
                sha256(monolithic_bytes),
                "--output",
                str(source_audit),
            ]
        )
        self.assertEqual(audit_result.returncode, 0, audit_result.stdout + audit_result.stderr)

        plan = {
            "schemaVersion": "fusiondigital.private-exl50u-system-export-plan.v1",
            "sourceAssembly": {
                "bytes": len(monolithic_bytes),
                "sha256": sha256(monolithic_bytes),
            },
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
                    "privateTopLevelLabel": f"NEVER-PUBLISH-LABEL-{index}",
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
        export_set_audit = root / "export-set.audit.private.json"
        verify_result = run(
            [
                sys.executable,
                str(VERIFY_EXPORT_SET_SCRIPT),
                str(plan_path),
                str(exports),
                "--source-audit",
                str(source_audit),
                "--output",
                str(export_set_audit),
            ]
        )
        self.assertEqual(verify_result.returncode, 0, verify_result.stdout + verify_result.stderr)
        return exports, export_set_audit

    def test_prepares_eight_bound_audits_and_publishes_pending_manifest_last(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-run-") as temporary:
            root = Path(temporary)
            exports, export_set_audit = self.prepare_verified_export_set(root)
            run_root = root / "run-001"
            result = run(
                [
                    sys.executable,
                    str(PREPARE_RUN_SCRIPT),
                    str(export_set_audit),
                    str(exports),
                    str(run_root),
                ]
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["status"], "PREPARED_PRIVATE_RUN")
            self.assertEqual(summary["systemCount"], 8)

            manifest_path = run_root / "private-run.manifest.json"
            self.assertTrue(manifest_path.is_file())
            manifest_bytes = manifest_path.read_bytes()
            self.assertEqual(summary["runManifestSha256"], sha256(manifest_bytes))
            manifest = json.loads(manifest_bytes)
            self.assertEqual(manifest["status"], "PENDING")
            self.assertEqual(manifest["review"]["commonOrigin"], "PENDING")
            self.assertEqual(manifest["review"]["visual"], "PENDING")
            self.assertEqual(len(manifest["systems"]), 8)
            self.assertEqual(
                [system["publicSystemId"] for system in manifest["systems"]],
                SYSTEM_IDS,
            )
            for system in manifest["systems"]:
                audit_path = run_root / system["audit"]["relativePath"]
                self.assertTrue(audit_path.is_file())
                self.assertEqual(system["audit"]["bytes"], audit_path.stat().st_size)
                self.assertEqual(system["audit"]["sha256"], sha256(audit_path.read_bytes()))
                self.assertEqual(system["roles"]["preview"]["status"], "PENDING")
                self.assertEqual(system["roles"]["high"]["status"], "PENDING")

            serialized = manifest_bytes.decode("utf-8")
            self.assertNotIn("NEVER-PUBLISH-LABEL", serialized)
            self.assertNotIn(str(root), serialized)

    def test_changed_export_blocks_before_manifest_publication(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-run-") as temporary:
            root = Path(temporary)
            exports, export_set_audit = self.prepare_verified_export_set(root)
            with (exports / f"{SYSTEM_IDS[3]}.step").open("ab") as stream:
                stream.write(b"\nCHANGED-AFTER-AUDIT")
            run_root = root / "run-tampered"
            result = run(
                [
                    sys.executable,
                    str(PREPARE_RUN_SCRIPT),
                    str(export_set_audit),
                    str(exports),
                    str(run_root),
                ]
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("changed after export-set verification", result.stderr)
            self.assertFalse((run_root / "private-run.manifest.json").exists())

    def test_existing_run_directory_is_never_reused(self) -> None:
        with tempfile.TemporaryDirectory(prefix="fusiondigital-exl50u-private-run-") as temporary:
            root = Path(temporary)
            exports, export_set_audit = self.prepare_verified_export_set(root)
            run_root = root / "run-existing"
            run_root.mkdir()
            sentinel = run_root / "sentinel.txt"
            sentinel.write_text("user-owned", encoding="utf-8")
            result = run(
                [
                    sys.executable,
                    str(PREPARE_RUN_SCRIPT),
                    str(export_set_audit),
                    str(exports),
                    str(run_root),
                ]
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("already exists", result.stderr)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "user-owned")


if __name__ == "__main__":
    unittest.main()
