#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


blender_publish = load_module("fusiondigital_blender_publish", ROOT / "scripts/visualization/blender_publish.py")
compose_openusd = load_module("fusiondigital_compose_openusd", ROOT / "scripts/visualization/compose_openusd.py")


class VisualizationPipelineTests(unittest.TestCase):
    def load_example(self, name: str):
        return json.loads((ROOT / "examples/visualization" / name).read_text(encoding="utf-8"))

    def test_examples_validate_without_blender_or_openusd_runtime(self):
        blender = self.load_example("blender-publish-job.example.json")
        usd = self.load_example("openusd-compose-job.example.json")
        self.assertEqual(blender_publish.validate_job(blender)["jobId"], "example-device-publication")
        self.assertEqual(compose_openusd.validate_job(usd)["jobId"], "example-plant-stage")

    def test_blender_cli_uses_only_arguments_after_separator(self):
        argv = ["blender", "--background", "--python", "blender_publish.py", "--", "--job", "job.json"]
        self.assertEqual(blender_publish.tool_arguments(argv), ["--job", "job.json"])

    def test_blender_contract_rejects_traversal_and_invalid_hash(self):
        job = self.load_example("blender-publish-job.example.json")
        job["deliveries"][0]["path"] = "../escape.glb"
        with self.assertRaisesRegex(ValueError, "safe relative path"):
            blender_publish.validate_job(job)
        job = self.load_example("blender-publish-job.example.json")
        job["source"]["sha256"] = "not-a-hash"
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            blender_publish.validate_job(job)

    def test_blender_contract_does_not_claim_to_generate_tiled_delivery(self):
        job = self.load_example("blender-publish-job.example.json")
        job["deliveries"][0]["profile"] = "web-tiles"
        with self.assertRaisesRegex(ValueError, "profile is invalid"):
            blender_publish.validate_job(job)

    def test_openusd_contract_rejects_duplicate_prim_paths(self):
        job = self.load_example("openusd-compose-job.example.json")
        job["assets"].append(dict(job["assets"][0]))
        with self.assertRaisesRegex(ValueError, "duplicated"):
            compose_openusd.validate_job(job)

    def test_public_schemas_have_stable_ids(self):
        expected = {
            "visualization-artifact.v2.schema.json": "visualization-artifact.v2.schema.json",
            "blender-publish-job.v1.schema.json": "blender-publish-job.v1.schema.json",
            "openusd-compose-job.v1.schema.json": "openusd-compose-job.v1.schema.json",
        }
        for filename, suffix in expected.items():
            schema = json.loads((ROOT / "public/schemas" / filename).read_text(encoding="utf-8"))
            self.assertTrue(schema["$id"].endswith(suffix))


if __name__ == "__main__":
    unittest.main()
