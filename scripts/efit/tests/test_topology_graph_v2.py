from __future__ import annotations

import copy
import gzip
import hashlib
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

import numpy as np
import fastjsonschema
from jsonschema import Draft202012Validator


SCRIPT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
WORKSPACE_ROOT = Path(__file__).resolve().parents[5]
PRIVATE_ROOT = WORKSPACE_ROOT / "work" / "efit-new-data-private"
sys.path.insert(0, str(SCRIPT_ROOT))

import topology_graph_v2 as topology_graph  # noqa: E402
import derive_topology_graph_v2 as pipeline  # noqa: E402
from geqdsk import (  # noqa: E402
    EquilibriumFrame,
    content_reconstruction_digest,
    discover_archive,
    read_frame,
    sha256_member,
    timeline_summary,
)
from derive_topology_graph_v2 import (  # noqa: E402
    _algorithm_source_sha256,
    _assert_no_private_strings,
    _json_bytes,
    _public_asset_record,
    _project_frame_summary,
    _strict_json_loads,
    _write_frame_chunk,
    _write_report,
    assert_private_output,
)
from topology_graph_v2 import (  # noqa: E402
    CriticalPoint,
    GraphConfig,
    build_context,
    canonicalize_geometry,
    derive_closed_flux_surfaces,
    derive_frame,
    derive_topology_graph,
    validate_derived_frame,
)


def _number_lines(values: list[float], per_line: int = 5) -> list[str]:
    return [
        " ".join(f"{value:.12E}" for value in values[start : start + per_line])

        for start in range(0, len(values), per_line)
    ]


def make_gfile(shot: int, time_ms: int, *, header_shot: int | None = None) -> bytes:
    """Return a minimal, parser-valid 3x3 G-EQDSK record."""
    header_shot = shot if header_shot is None else header_shot
    lines = [f"TEST # {header_shot} {time_ms} ms 3 3"]
    lines.extend(
        _number_lines(
            [
                1.6,
                1.6,
                1.0,
                0.2,
                0.0,
                1.0,
                0.0,
                0.0,
                1.0,
                0.8,
                250_000.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
            ]
        )
    )
    for values in (
        [1.0, 1.0, 1.0],
        [10.0, 5.0, 0.0],
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
        [2.0, 1.0, 2.0, 1.0, 0.0, 1.0, 2.0, 1.0, 2.0],

        [1.0, 2.0, 3.0],
    ):
        lines.extend(_number_lines(values))
    lines.append("4 4")
    boundary = [0.5, -0.5, 1.5, -0.5, 1.5, 0.5, 0.5, 0.5]
    limiter = [0.2, -0.8, 1.8, -0.8, 1.8, 0.8, 0.2, 0.8]
    lines.extend(_number_lines(boundary))
    lines.extend(_number_lines(limiter))
    lines.extend([" &OUT1", " ERROR=3.2E-2, ICONVR=2", " /"])
    return ("\n".join(lines) + "\n").encode("ascii")


def make_synthetic_frame() -> EquilibriumFrame:
    nr = nz = 81
    rleft = 0.2
    rdim = 1.6
    zdim = 1.6
    r = np.linspace(rleft, rleft + rdim, nr)
    z = np.linspace(-zdim / 2, zdim / 2, nz)
    rr, zz = np.meshgrid(r, z)
    left_well = ((rr - 0.72) ** 2 + zz**2) / 0.16
    right_well = ((rr - 1.28) ** 2 + zz**2) / 0.16
    psi_n = np.minimum(left_well, right_well)
    theta = np.linspace(0.0, 2.0 * np.pi, 129, endpoint=False)
    lcfs = np.column_stack((1.0 + 0.68 * np.cos(theta), 0.68 * np.sin(theta)))
    limiter = np.asarray([[0.2, -0.8], [1.8, -0.8], [1.8, 0.8], [0.2, 0.8]])
    return EquilibriumFrame(
        shot=42,
        time_ms=100,
        nw=nr,
        nh=nz,
        rdim=rdim,
        zdim=zdim,
        rcentr=1.0,
        rleft=rleft,
        zmid=0.0,
        r_axis=0.72,
        z_axis=0.0,
        psi_axis=0.0,
        psi_boundary=1.0,

        bcentr=0.8,
        current=250_000.0,
        pressure=np.linspace(1.0, 0.0, nr),
        qpsi=np.linspace(1.0, 5.0, nr),
        psirz=psi_n,
        lcfs=lcfs,
        limiter=limiter,
        efit_error=0.032,
        iconvr=2,
    )


class ArchiveContractTests(unittest.TestCase):
    def test_discovers_both_observed_directory_layouts_and_ignores_auxiliary_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "input.zip"
            with zipfile.ZipFile(archive, "w") as target:
                target.writestr("root/20213/g020213.00111", make_gfile(20213, 111))
                target.writestr("root/20666/EFIT/g020666.00100", make_gfile(20666, 100))
                target.writestr("root/20666/EFIT/fitout_00100.dat", b"private auxiliary")
                target.writestr("root/20666/EFIT/a020666.00100", b"private a-file")
                target.writestr("root/video.mp4", b"not a real video")
            inventory = discover_archive(archive)
            self.assertEqual([(entry.shot, entry.time_ms) for entry in inventory.entries], [(20213, 111), (20666, 100)])
            self.assertEqual(inventory.ignored_file_counts, {".dat": 1, ".mp4": 1, "<a-series>": 1})
            with zipfile.ZipFile(archive) as source:
                frames = [read_frame(source, entry) for entry in inventory.entries]
            self.assertTrue(all(frame.psirz.shape == (3, 3) for frame in frames))

    def test_duplicate_shot_time_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "duplicate.zip"
            with zipfile.ZipFile(archive, "w") as target:
                target.writestr("a/g020213.00111", make_gfile(20213, 111))
                target.writestr("b/EFIT/g020213.00111", make_gfile(20213, 111))
            with self.assertRaisesRegex(ValueError, "duplicate G-EQDSK identity"):
                discover_archive(archive)

    def test_high_ratio_gfile_member_fails_before_decompression(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "bomb.zip"
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as target:
                target.writestr("root/g020213.00111", b"0" * (1024 * 1024))
            with self.assertRaisesRegex(ValueError, "compression ratio"):
                discover_archive(archive)

    def test_oversized_stored_gfile_member_fails_before_read(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "oversized.zip"
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as target:
                target.writestr("root/g020213.00111", b"0" * (8 * 1024 * 1024 + 1))
            with self.assertRaisesRegex(ValueError, "member byte length"):
                discover_archive(archive)

    def test_filename_header_identity_mismatch_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:

            archive = Path(directory) / "mismatch.zip"
            with zipfile.ZipFile(archive, "w") as target:
                target.writestr("root/g020213.00111", make_gfile(20213, 111, header_shot=20214))
            inventory = discover_archive(archive)
            with zipfile.ZipFile(archive) as source:
                with self.assertRaisesRegex(ValueError, "filename/header mismatch"):
                    read_frame(source, inventory.entries[0])

    def test_reconstruction_digest_is_independent_of_zip_member_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.zip"
            second = Path(directory) / "second.zip"
            members = [
                ("root/g020213.00112", make_gfile(20213, 112)),
                ("root/g020213.00111", make_gfile(20213, 111)),
            ]
            for archive, ordered in ((first, members), (second, list(reversed(members)))):
                with zipfile.ZipFile(archive, "w") as target:
                    for name, payload in ordered:
                        target.writestr(name, payload)
            inventories = [discover_archive(first), discover_archive(second)]
            digests = []
            for archive, inventory in zip((first, second), inventories):
                entries = inventory.entries_for_shot(20213)
                with zipfile.ZipFile(archive) as source:
                    hashes = [sha256_member(source, entry) for entry in entries]
                digests.append(content_reconstruction_digest(entries, hashes))
            self.assertEqual(digests[0], digests[1])

    def test_timeline_gap_count_uses_observed_cadence_not_one_millisecond(self) -> None:
        summary = timeline_summary([110, 120, 130, 150, 160])
        self.assertEqual(summary["nominalCadenceMs"], 10)
        self.assertEqual(
            summary["gaps"],
            [
                {
                    "afterMs": 130,
                    "beforeMs": 150,
                    "deltaMs": 20,
                    "estimatedMissingFrames": 1,

                    "alignedToNominalCadence": True,
                }
            ],
        )


class GeometryAndGraphTests(unittest.TestCase):
    def test_frame_schema_and_implicit_surface_closure_are_locked(self) -> None:
        frame = make_synthetic_frame()
        geometry = canonicalize_geometry(frame.limiter)
        reconstruction = "exl-50u:efit:000042:0123456789abcdef0123"
        derived = derive_frame(frame, geometry, "EXL-50U:shot:000042", reconstruction, GraphConfig())
        validate_derived_frame(derived, geometry)
        schema = json.loads(
            (REPOSITORY_ROOT / "docs" / "schemas" / "efit-topology-graph-v2.schema.json").read_text("utf-8")
        )
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema).validate(derived)
        for surface in derived["closedFluxSurfaces"]:
            points = np.asarray(surface["pointsRzM"], dtype=float).reshape((-1, 2))
            self.assertEqual(len(points), 128)
            self.assertGreater(float(np.linalg.norm(points[0] - points[-1])), 1e-12)

    def test_validator_rejects_nested_unknown_fields_and_scientific_tampering(self) -> None:
        frame = make_synthetic_frame()
        geometry = canonicalize_geometry(frame.limiter)
        hessian = np.diag([-1.0, 1.0])
        point = CriticalPoint(
            r_m=0.72,
            z_m=0.60,
            psi_n=1.0,
            role="boundary",
            activity_role="primary",
            gradient_residual=0.0,
            fit_rms=0.0,
            lcfs_distance_m=0.01,
            hessian_physical=hessian,
            hessian_eigenvalues=(-1.0, 1.0),
        )

        def unresolved(_context, _points, _source_index, arm_index, _direction, _config):
            return {"resolved": False, "reason": "test-unresolved", "armIndex": arm_index}

        with mock.patch.object(topology_graph, "derive_critical_points", return_value=([point], False)), mock.patch.object(
            topology_graph, "_trace_arm", side_effect=unresolved
        ):
            derived = derive_frame(
                frame,
                geometry,
                "EXL-50U:shot:000042",
                "exl-50u:efit:000042:0123456789abcdef0123",
                GraphConfig(),
            )
        validate_derived_frame(derived, geometry)
        unknown = copy.deepcopy(derived)
        unknown["quality"]["privateArchivePath"] = r"D:\Downloads\private.zip"
        with self.assertRaisesRegex(ValueError, "keys changed"):
            validate_derived_frame(unknown, geometry)
        tampered = copy.deepcopy(derived)
        x_node = next(node for node in tampered["topologyGraph"]["nodes"] if node["kind"] == "x-point")
        x_node["absPsiNMinusOne"] = 0.5
        with self.assertRaisesRegex(ValueError, "normalized-flux residual"):
            validate_derived_frame(tampered, geometry)

    def test_vectorized_wall_intersection_selects_the_first_exact_hit(self) -> None:
        wall = np.asarray([[0.0, -1.0], [2.0, -1.0], [2.0, 1.0], [0.0, 1.0], [0.0, -1.0]])
        result = topology_graph._first_polyline_intersection(
            np.asarray([1.0, 0.0]),
            np.asarray([3.0, 0.0]),
            wall,
        )
        self.assertIsNotNone(result)
        hit, trace_fraction, wall_fraction, segment = result
        np.testing.assert_allclose(hit, [2.0, 0.0])
        self.assertAlmostEqual(trace_fraction, 0.5)
        self.assertAlmostEqual(wall_fraction, 0.5)
        self.assertEqual(segment, 1)

    def test_geometry_revision_is_phase_orientation_and_closure_stable(self) -> None:
        base = np.asarray([[0.2, -0.8], [1.8, -0.8], [1.8, 0.8], [0.2, 0.8]])
        rotated = np.vstack((base[2:], base[:2], base[2], base[2]))
        reversed_rotated = rotated[::-1]
        revisions = [canonicalize_geometry(points) for points in (base, rotated, reversed_rotated)]
        self.assertEqual(len({revision.sha256 for revision in revisions}), 1)
        self.assertEqual(revisions[0].source_point_count, 4)
        self.assertNotEqual(revisions[0].source_sha256, revisions[1].source_sha256)
        self.assertTrue(all(revision.signed_area_m2 > 0 for revision in revisions))

    def test_all_closed_flux_loops_are_retained_at_one_level(self) -> None:
        frame = make_synthetic_frame()
        geometry = canonicalize_geometry(frame.limiter)
        context = build_context(frame, geometry)
        surfaces, truncated = derive_closed_flux_surfaces(
            context,
            GraphConfig(surface_levels=(0.2,), max_loops_per_level=8),
        )
        derived = [surface for surface in surfaces if surface["source"] == "derived-contour"]
        self.assertFalse(truncated)
        self.assertEqual(len(derived), 2)

        self.assertTrue(all(surface["closed"] for surface in derived))
        self.assertEqual(sum(bool(surface["containsMagneticAxis"]) for surface in derived), 1)

    def test_graph_accepts_more_than_two_x_points_without_single_null_labels(self) -> None:
        frame = make_synthetic_frame()
        geometry = canonicalize_geometry(frame.limiter)
        context = build_context(frame, geometry)
        hessian = np.diag([-1.0, 1.0])
        points = [
            CriticalPoint(
                r_m=0.6 + 0.2 * index,
                z_m=-0.2 + 0.2 * index,
                psi_n=1.0 + 0.001 * index,
                role="boundary" if index == 0 else "near-boundary",
                gradient_residual=0.0,
                fit_rms=0.0,
                lcfs_distance_m=0.01,
                hessian_physical=hessian,
                hessian_eigenvalues=(-1.0, 1.0),
            )
            for index in range(3)
        ]

        def unresolved(_context, _points, _source_index, arm_index, _direction, _config):
            return {"resolved": False, "reason": "test-unresolved", "armIndex": arm_index}

        with mock.patch.object(topology_graph, "_trace_arm", side_effect=unresolved):
            graph = derive_topology_graph(context, points, "frame:test", GraphConfig())
        x_nodes = [node for node in graph["nodes"] if node["kind"] == "x-point"]
        self.assertEqual(len(x_nodes), 3)
        self.assertEqual(graph["features"]["xPointCount"], 3)
        self.assertEqual(len(graph["unresolvedArms"]), 4)
        self.assertEqual(graph["features"]["activeXPointCount"], 1)
        self.assertEqual(graph["features"]["candidateXPointCount"], 2)
        self.assertEqual(len([node for node in x_nodes if node["evidenceOnly"]]), 2)
        serialized = json.dumps(graph)
        self.assertNotIn("USN", serialized)
        self.assertNotIn("LSN", serialized)


    def test_real_20289_frame_220_stays_inside_source_grid_and_candidates_have_no_edges(self) -> None:
        archive_value = os.environ.get("EXL50U_EFIT_DOCTOR_ARCHIVE", r"D:\Downloads\马博士EFIT.zip")
        archive = Path(archive_value)
        if not archive.is_file():
            self.skipTest("private reviewed archive is not available")
        inventory = discover_archive(archive)
        entry = next(item for item in inventory.entries if item.shot == 20289 and item.time_ms == 220)
        with zipfile.ZipFile(archive) as source:
            frame = read_frame(source, entry)
        geometry = canonicalize_geometry(frame.limiter)
        derived = derive_frame(
            frame,
            geometry,
            "EXL-50U:shot:020289",
            "exl-50u:efit:020289:test",
            GraphConfig(),
        )
        validate_derived_frame(derived, geometry)
        graph = derived["topologyGraph"]
        candidate_ids = {
            node["nodeId"]
            for node in graph["nodes"]
            if node["kind"] == "x-point" and node["evidenceOnly"]
        }
        self.assertTrue(candidate_ids, "golden frame must retain near-boundary evidence")
        self.assertTrue(all(edge["fromNodeId"] not in candidate_ids for edge in graph["edges"]))
        for edge in graph["edges"]:
            points = np.asarray(edge["pointsRzM"], dtype=float).reshape((-1, 2))
            self.assertTrue(np.all(np.isfinite(points)))
            self.assertGreaterEqual(float(points[:, 0].min()), frame.rleft - 1e-8)
            self.assertLessEqual(float(points[:, 0].max()), frame.rleft + frame.rdim + 1e-8)
            self.assertGreaterEqual(float(points[:, 1].min()), frame.zmid - frame.zdim / 2 - 1e-8)
            self.assertLessEqual(float(points[:, 1].max()), frame.zmid + frame.zdim / 2 + 1e-8)


class PublicationSafetyTests(unittest.TestCase):
    def test_real_public_v2_release_validates_every_frame_and_exact_file(self) -> None:
        public_root = REPOSITORY_ROOT / "public" / "data" / "exl50u-efit-v2"
        index_path = public_root / "index.json"
        if not index_path.is_file():
            self.skipTest("reviewed public v2 package has not been generated")
        catalog_schema = json.loads(
            (REPOSITORY_ROOT / "docs" / "schemas" / "exl50u-efit-catalog-v2.schema.json").read_text("utf-8")
        )
        frame_schema = json.loads(
            (REPOSITORY_ROOT / "docs" / "schemas" / "efit-topology-graph-v2.schema.json").read_text("utf-8")
        )
        validate_catalog = fastjsonschema.compile(catalog_schema)
        validate_frame = fastjsonschema.compile(frame_schema)
        catalog = json.loads(index_path.read_text("utf-8"))
        validate_catalog(catalog)
        self.assertEqual(catalog["status"], "reviewed-derived-publication")
        self.assertEqual(catalog["generatedBy"]["algorithmVersion"], "2.0.0")
        expected_parts = {20213: 33, 20289: 4, 20666: 45, 20669: 57, 20707: 38, 20708: 42}
        expected_files = {"index.json"}
        frame_count = 0
        empty_graph_count = 0
        for shot in catalog["shots"]:
            if shot["sourceKind"] != "topology-graph-v2":
                continue
            self.assertEqual(len(shot["frameAssets"]), expected_parts[shot["shot"]])
            observed_times = []
            for asset in shot["frameAssets"]:
                name = asset["url"].rsplit("/", 1)[-1]
                expected_files.add(name)
                payload = (public_root / name).read_bytes()
                self.assertEqual(hashlib.sha256(payload).hexdigest(), asset["sha256"])
                self.assertEqual(len(payload), asset["byteLength"])
                self.assertEqual(payload[:2], b"\x1f\x8b")
                self.assertNotIn("contentEncoding", asset)
                for line in gzip.decompress(payload).splitlines():
                    record = _strict_json_loads(line)
                    validate_frame(record)
                    frame_count += 1
                    observed_times.append(record["timeMs"])
                    if not record["topologyGraph"]["nodes"]:
                        empty_graph_count += 1
                        self.assertEqual(record["quality"]["validity"], "unavailable")
            self.assertEqual(observed_times, shot["availableTimesMs"])
        actual_files = {
            path.relative_to(public_root).as_posix()
            for path in public_root.rglob("*")
            if path.is_file()
        }
        self.assertEqual(actual_files, expected_files)
        self.assertEqual(frame_count, 3446)
        self.assertEqual(empty_graph_count, 108)

    def test_reviewed_publisher_projects_allowlists_and_emits_schema_valid_raw_gzip(self) -> None:
        fake_source = "a" * 64
        fake_shots = (20213, 20289, 20666, 20669, 20707, 20708)
        frame = make_synthetic_frame()
        geometry = canonicalize_geometry(frame.limiter)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate = root / "candidate"
            candidate.mkdir()
            shot_records = []
            for shot in fake_shots:
                digest = hashlib.sha256(str(shot).encode("ascii")).hexdigest()
                shot_id = f"EXL-50U:shot:{shot:06d}"
                reconstruction_id = f"exl-50u:efit:{shot:06d}:{digest[:20]}"
                derived = derive_frame(frame, geometry, shot_id, reconstruction_id, GraphConfig())
                validate_derived_frame(derived, geometry)
                shot_dir = candidate / "shots" / f"{shot:06d}"
                shot_dir.mkdir(parents=True)
                asset = _write_frame_chunk(shot_dir, shot, 0, 0, [derived])
                asset["privateArchivePath"] = r"D:\Downloads\private-reviewed.zip"
                summary = {
                    "timeMs": int(derived["timeMs"]),
                    "currentA": derived["scalars"]["currentA"],
                    "rAxisM": derived["scalars"]["rAxisM"],
                    "zAxisM": derived["scalars"]["zAxisM"],
                    "bcentrT": derived["scalars"]["bcentrT"],
                    "q95": derived["scalars"]["q95"],
                    "qualityValidity": derived["quality"]["validity"],
                    "qualityFlags": derived["quality"]["flags"],
                    "privateArchivePath": r"D:\Downloads\private-reviewed.zip",
                }
                shot_records.append(
                    {
                        "shotId": shot_id,
                        "shotNumber": shot,
                        "reconstructionId": reconstruction_id,
                        "reconstructionDigest": digest,
                        "frameCount": 1,
                        "timeRangeMs": [100, 100],
                        "strictlyIncreasing": True,
                        "nominalCadenceMs": 1,
                        "availableTimesMs": [100],
                        "frames": [summary],
                        "gaps": [],
                        "geometryFrameCounts": {geometry.geometry_id: 1},
                        "qualitySummary": {
                            "validityFrameCounts": {derived["quality"]["validity"]: 1},
                            "flagFrameCounts": {flag: 1 for flag in derived["quality"]["flags"]},
                        },
                        "topologySummary": {"recordTotals": {}, "maxPerFrame": {}, "canonicalLabels": "ignored"},
                        "frameAssets": [asset],
                    }
                )
            candidate_manifest = {
                "schemaVersion": pipeline.SCHEMA_VERSION,
                "status": "private-candidate-not-authorized-for-publication",
                "generatedBy": {
                    "algorithmVersion": topology_graph.ALGORITHM_VERSION,
                    "algorithmSourceSha256": _algorithm_source_sha256(),
                },
                "source": {
                    "archiveBasename": "private-reviewed.zip",
                    "archiveSha256": fake_source,
                    "gFileCount": len(fake_shots),
                },
                "algorithm": GraphConfig().public_dict(),
                "geometryCatalog": [geometry.public_dict()],
                "shots": shot_records,
            }
            (candidate / "manifest.json").write_bytes(_json_bytes(candidate_manifest))
            output = root / "public-package"
            reviewed = {
                fake_source: {
                    "datasetId": "test-reviewed-source",
                    "sourceGFileCount": len(fake_shots),
                    "shots": {shot: 1 for shot in fake_shots},
                    "auxiliaryAEqdskEvidence": None,
                }
            }
            with mock.patch.object(pipeline, "REVIEWED_SOURCE_SETS", reviewed), mock.patch.object(
                pipeline, "assert_private_output", side_effect=lambda value: Path(value).resolve()
            ), mock.patch.object(
                pipeline, "assert_reviewed_public_output", side_effect=lambda value: Path(value).resolve()
            ):
                public_manifest = pipeline.publish_reviewed_candidates([candidate], output, False, True)
            encoded = (output / "index.json").read_text("utf-8")
            self.assertNotIn("private-reviewed.zip", encoded)
            self.assertNotIn("privateArchivePath", encoded)
            schema = json.loads(
                (REPOSITORY_ROOT / "docs" / "schemas" / "exl50u-efit-catalog-v2.schema.json").read_text("utf-8")
            )
            Draft202012Validator.check_schema(schema)
            Draft202012Validator(schema).validate(public_manifest)
            graph_shots = [shot for shot in public_manifest["shots"] if shot["sourceKind"] == "topology-graph-v2"]
            self.assertEqual(len(graph_shots), 6)
            for shot in graph_shots:
                self.assertNotIn("privateArchivePath", shot["frames"][0])
                asset = shot["frameAssets"][0]
                self.assertEqual(asset["contentType"], "application/gzip")
                self.assertEqual(asset["httpContentEncoding"], "identity")
                self.assertNotIn("contentEncoding", asset)
                payload = (output / asset["url"].rsplit("/", 1)[-1]).read_bytes()
                self.assertEqual(payload[:2], b"\x1f\x8b")
                self.assertTrue(gzip.decompress(payload).endswith(b"\n"))

    def test_output_guard_rejects_every_repository_subtree(self) -> None:
        for target in (REPOSITORY_ROOT / "public" / "data" / "efit-v2", REPOSITORY_ROOT / "app" / "candidate"):
            with self.assertRaisesRegex(ValueError, "reviewed private root"):
                assert_private_output(target)
        allowed = assert_private_output(PRIVATE_ROOT / "candidates" / "safe")
        self.assertTrue(str(allowed).startswith(str(PRIVATE_ROOT)))
        with self.assertRaisesRegex(ValueError, "reviewed private root"):
            _write_report({"archiveBasename": "private.zip"}, REPOSITORY_ROOT / "public" / "audit.json")

    def test_algorithm_source_hash_uses_the_installed_v2_modules(self) -> None:
        digest = _algorithm_source_sha256()
        self.assertRegex(digest, r"^[a-f0-9]{64}$")

    def test_frame_chunks_are_bounded_and_deterministic(self) -> None:
        records = [{"timeMs": time, "value": time} for time in range(100, 116)]
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = _write_frame_chunk(Path(first_dir), 42, 0, 0, records)
            second = _write_frame_chunk(Path(second_dir), 42, 0, 0, records)
            self.assertEqual(first["sha256"], second["sha256"])
            self.assertEqual(first["frameCount"], 16)
            self.assertEqual(first["timeRangeMs"], [100, 115])
            with self.assertRaisesRegex(ValueError, "between 1 and 16"):
                _write_frame_chunk(Path(first_dir), 42, 1, 16, records + [{"timeMs": 116}])

    def test_serializer_rejects_raw_grid_fields_and_nonfinite_numbers(self) -> None:
        with self.assertRaisesRegex(ValueError, "forbidden raw-data field"):
            _json_bytes({"psirz": [[0.0]]})
        with self.assertRaises(ValueError):
            _json_bytes({"derived": float("nan")})
        with self.assertRaisesRegex(ValueError, "duplicate JSON object key"):
            _strict_json_loads('{"timeMs":100,"timeMs":200}')
        with self.assertRaisesRegex(ValueError, "non-finite JSON number"):
            _strict_json_loads('{"value":NaN}')
        projected = _project_frame_summary(
            {
                "timeMs": 100,
                "currentA": 1.0,
                "rAxisM": 0.6,
                "zAxisM": 0.0,
                "bcentrT": 0.8,
                "q95": None,
                "qualityValidity": "usable",
                "qualityFlags": ["SOURCE_PARSED"],
                "privateArchivePath": r"D:\Downloads\private.zip",
            }
        )
        self.assertNotIn("privateArchivePath", projected)
        with self.assertRaisesRegex(ValueError, "private path/archive"):
            _assert_no_private_strings({"reason": r"D:\Downloads\private.zip"})


if __name__ == "__main__":
    unittest.main()
