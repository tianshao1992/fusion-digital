#!/usr/bin/env python3
r"""Unified private EFIT audit and topology-graph candidate builder.

Examples:
  python pipeline_v2.py audit --archive D:\private.zip --report audit.json
  python pipeline_v2.py build-candidate --archive D:\private.zip --expected-sha256 ... \
      --device-id EXL-50U --output ..\candidates\new-set

The builder refuses a public-directory destination and never serializes the source psi grid.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
import os
import re
import shutil
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from geqdsk import (
    ArchiveInventory,
    content_reconstruction_digest,
    discover_archive,
    read_frame,
    read_frame_with_sha256,
    sha256_file,
    sha256_member,
    shot_inventory,
    timeline_summary,
)
from topology_graph_v2 import (

    ALGORITHM_ID,
    ALGORITHM_VERSION,
    GraphConfig,
    GeometryRevision,
    canonicalize_geometry,
    derive_frame,
    signed_area,
    validate_derived_frame,
)


SCHEMA_VERSION = "fusion.efit.topology-graph.v2-candidate"
PUBLIC_SCHEMA_VERSION = "fusion.efit.topology-graph.v2"
FRAMES_PER_CHUNK = 16
FORBIDDEN_SERIALIZED_KEYS = ('"psirz"', '"psiGrid"', '"sourceGFile"', '"rawGfile"')
FORBIDDEN_FIELD_NAMES = {"psirz", "psigrid", "sourcegfile", "rawgfile", "gfilepayload"}
PUBLIC_FRAME_SUMMARY_KEYS = (
    "timeMs",
    "currentA",
    "rAxisM",
    "zAxisM",
    "bcentrT",
    "q95",
    "qualityValidity",
    "qualityFlags",
)
MATLAB_VALIDATION = {
    "schemaVersion": "exl50u-efit-private-matlab-validation-v1",
    "sha256": "517d701e6f469df48d5aa1594c3f78d054a79fd21432a0faea04b812eb055532",
}
REVIEWED_SOURCE_SETS = {
    "310a1a5e4007bfccf08eac047bdb4b91c3fc8991c0a54002f4065cdb392e8b99": {
        "datasetId": "exl50u-reconstruction-series-a-2026-08",
        "sourceGFileCount": 572,
        "shots": {20213: 514, 20289: 58},
        "auxiliaryAEqdskEvidence": None,
    },
    "1b0de851141388d2eabfdd63a2d5d7071ee440ded206601f66ac6a05a5035fdb": {
        "datasetId": "exl50u-reconstruction-series-b-upgrade-2026-08",
        "sourceGFileCount": 2874,
        "shots": {20666: 706, 20669: 909, 20707: 595, 20708: 664},
        "auxiliaryAEqdskEvidence": {
            "state": "candidate-only-not-used-for-active-topology",
            "reason": "All reviewed A-records have jflag=0 and error-status lflag values; active topology is independently derived from G-EQDSK psi only.",
            "crossCheckPolicy": "A-record candidates may be displayed only as separately flagged evidence after G-psi validation.",
        },
    },
}
LEGACY_BASE_SHA256 = {
    18301: "069e4bab854b3a880bccc68790ae84706e07e86fbabe083d87a3a9e79686bf81",
    18303: "99191a749d35ec6136300dcfa00e8cedc47e6c105109241ec9b2334abff43a5a",
    18304: "d61559312cea79a3e94ed4b714f542fa6959b77bf447c1ac79b5806bf2f27e31",
    18308: "90da2a61bbe8a962a9a4c94344234bd929586887d293393c12585772523e8174",
}


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError("device id does not contain a stable ASCII slug")
    return slug


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def assert_private_output(output: Path) -> Path:
    output = output.resolve()
    repository = Path(__file__).resolve().parents[2]
    private_root = (repository.parents[1] / "work" / "efit-new-data-private").resolve()
    if output == private_root or not _is_relative_to(output, private_root):
        raise ValueError(
            f"candidate builder output must be below the reviewed private root: {private_root}"
        )
    return output



def _algorithm_source_sha256() -> str:
    digest = hashlib.sha256()
    for name in ("geqdsk.py", "topology_graph_v2.py", "derive_topology_graph_v2.py"):
        path = Path(__file__).with_name(name)
        digest.update(name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _json_bytes(value: object) -> bytes:
    _assert_no_forbidden_fields(value)
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    text = encoded.decode("utf-8")
    if any(forbidden in text for forbidden in FORBIDDEN_SERIALIZED_KEYS):
        raise ValueError("derived artifact attempted to serialize a forbidden raw-data field")
    return encoded


def _strict_json_loads(payload: str | bytes) -> object:
    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON object key: {key}")
            result[key] = value
        return result

    def reject_nonfinite(token: str) -> object:
        raise ValueError(f"non-finite JSON number is forbidden: {token}")

    return json.loads(
        payload,
        object_pairs_hook=reject_duplicate_keys,
        parse_constant=reject_nonfinite,
    )


def _assert_no_private_strings(
    value: object,
    forbidden_tokens: tuple[str, ...] = (),
    path: str = "$",
) -> None:
    """Reject workstation paths/archive names even inside otherwise allowed text fields."""
    if isinstance(value, dict):
        for key, nested in value.items():
            _assert_no_private_strings(nested, forbidden_tokens, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _assert_no_private_strings(nested, forbidden_tokens, f"{path}[{index}]")
    elif isinstance(value, str):
        lowered = value.casefold()
        if any(token and token.casefold() in lowered for token in forbidden_tokens):
            raise ValueError(f"private source identifier leaked at {path}")
        if (
            re.search(r"(?:^|\s)[a-zA-Z]:[\\/]", value)
            or value.startswith("\\\\")
            or "/users/" in lowered
            or "\\users\\" in lowered
            or "/home/" in lowered
            or lowered.endswith(".zip")
        ):
            raise ValueError(f"private path/archive string leaked at {path}")


def _assert_no_forbidden_fields(value: object, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if normalized in FORBIDDEN_FIELD_NAMES:
                raise ValueError(f"forbidden raw-data field at {path}.{key}")
            _assert_no_forbidden_fields(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _assert_no_forbidden_fields(nested, f"{path}[{index}]")


def _geometry_record(
    catalog: dict[str, GeometryRevision],
    geometry: GeometryRevision,
) -> None:
    existing = catalog.get(geometry.geometry_id)
    if existing is not None and (
        existing.sha256 != geometry.sha256
        or existing.source_sha256 != geometry.source_sha256
        or existing.source_point_count != geometry.source_point_count
    ):
        raise ValueError(f"geometry/source representation collision: {geometry.geometry_id}")
    catalog[geometry.geometry_id] = geometry


def _selected_shots(inventory: ArchiveInventory, requested: list[int] | None) -> list[int]:
    available = set(inventory.shots)
    if not requested:
        return sorted(available)
    selected = sorted(set(requested))
    missing = [shot for shot in selected if shot not in available]
    if missing:
        raise ValueError(f"requested shots absent from archive: {missing}")
    return selected

def audit_archive(
    archive: Path,
    device_id: str,
    requested_shots: list[int] | None = None,
) -> dict[str, object]:
    inventory = discover_archive(archive)
    source_sha256 = sha256_file(inventory.archive)
    selected = _selected_shots(inventory, requested_shots)
    geometry_catalog: dict[str, GeometryRevision] = {}
    shot_reports: list[dict[str, object]] = []
    inventory_summary = shot_inventory(inventory)
    with zipfile.ZipFile(inventory.archive) as source:
        for shot in selected:
            entries = inventory.entries_for_shot(shot)
            geometry_counts: Counter[str] = Counter()
            grid_counts: Counter[str] = Counter()
            gate_counts: Counter[str] = Counter()
            lcfs_counts: list[int] = []
            member_hashes: list[str] = []
            for entry in entries:
                frame, member_hash = read_frame_with_sha256(source, entry)
                member_hashes.append(member_hash)
                geometry = canonicalize_geometry(frame.limiter)
                _geometry_record(geometry_catalog, geometry)
                geometry_counts[geometry.geometry_id] += 1
                grid_counts[
                    f"{frame.nw}x{frame.nh}:R={frame.rleft:.9g}+{frame.rdim:.9g}:Z={frame.zmid:.9g}+-{frame.zdim / 2:.9g}"
                ] += 1
                lcfs_counts.append(len(frame.lcfs))
                if abs(frame.current) < 50_000:
                    gate_counts["LOW_ABS_CURRENT"] += 1
                if abs(frame.psi_span) < 0.005:
                    gate_counts["SMALL_PSI_SPAN"] += 1
                if frame.iconvr != 2:
                    gate_counts["EFIT_NOT_CONVERGED"] += 1
            summary = inventory_summary[shot]
            shot_reports.append(
                {
                    "shotId": f"{device_id}:shot:{shot:06d}",
                    "shotNumber": shot,

                    "frameCount": len(entries),
                    "timeRangeMs": summary["timeRangeMs"],
                    "strictlyIncreasing": summary["strictlyIncreasing"],
                    "nominalCadenceMs": summary["nominalCadenceMs"],
                    "gaps": summary["gaps"],
                    "reconstructionDigest": content_reconstruction_digest(entries, member_hashes),
                    "reconstructionDigestBasis": "ordered shot/time/byteLength/G-EQDSK-SHA256",
                    "geometryFrameCounts": dict(sorted(geometry_counts.items())),
                    "sourceGridFrameCounts": dict(sorted(grid_counts.items())),
                    "gateFrameCounts": dict(sorted(gate_counts.items())),
                    "lcfsPointCountRange": [min(lcfs_counts), max(lcfs_counts)],
                }
            )
    return {
        "schemaVersion": "fusion.efit.archive-audit.v2",
        "status": "private-audit-not-authorized-for-publication",
        "deviceId": device_id,
        "source": {
            "archiveBasename": inventory.archive.name,
            "archiveBytes": inventory.archive.stat().st_size,
            "archiveSha256": source_sha256,
            "gFileCount": len(inventory.entries),
            "ignoredFileCounts": inventory.ignored_file_counts,
        },
        "geometryCatalog": [geometry.public_dict() for _, geometry in sorted(geometry_catalog.items())],
        "shots": shot_reports,
        "safety": {
            "archiveExtracted": False,
            "sourcePsiSerialized": False,
            "rawGFileSerialized": False,
        },
    }


def _write_gzip_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as compressed:
            for record in records:
                compressed.write(_json_bytes(record))
                compressed.write(b"\n")


def _write_frame_chunk(
    shot_dir: Path,
    shot: int,
    chunk_index: int,
    frame_start: int,
    records: list[dict[str, object]],
) -> dict[str, object]:
    if not records or len(records) > FRAMES_PER_CHUNK:
        raise ValueError("frame chunk must contain between 1 and 16 records")
    name = f"chunk-{chunk_index:04d}.jsonl.gz"
    path = shot_dir / name
    _write_gzip_jsonl(path, records)
    times = [int(record["timeMs"]) for record in records]
    if any(after <= before for before, after in zip(times, times[1:])):
        raise ValueError("frame chunk times must be strictly increasing")
    return {
        "chunkIndex": chunk_index,
        "frameStart": frame_start,
        "frameCount": len(records),
        "timeRangeMs": [times[0], times[-1]],
        "availableTimesMs": times,
        "path": f"shots/{shot:06d}/{name}",
        "contentType": "application/x-ndjson",
        "contentEncoding": "gzip",
        "compression": "gzip-mtime-zero",
        "byteLength": path.stat().st_size,
        "sha256": sha256_file(path),
    }



def build_candidate(
    archive: Path,
    expected_sha256: str,
    device_id: str,
    output: Path,
    requested_shots: list[int] | None = None,
    replace: bool = False,
    config: GraphConfig | None = None,
) -> dict[str, object]:
    config = config or GraphConfig()
    output = assert_private_output(output)
    inventory = discover_archive(archive)
    source_sha256 = sha256_file(inventory.archive)
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha256):
        raise ValueError("--expected-sha256 must be a 64-character hex digest")
    if source_sha256.lower() != expected_sha256.lower():
        raise ValueError(f"source SHA-256 mismatch: expected {expected_sha256}, got {source_sha256}")
    selected = _selected_shots(inventory, requested_shots)
    if output.exists() and not replace:
        raise ValueError(f"output already exists; pass --replace after review: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))
    geometry_catalog: dict[str, GeometryRevision] = {}
    shot_manifests: list[dict[str, object]] = []
    device_slug = _safe_slug(device_id)
    try:
        shots_root = temp / "shots"
        shots_root.mkdir()
        with zipfile.ZipFile(inventory.archive) as source:
            for shot in selected:
                entries = inventory.entries_for_shot(shot)
                shot_id = f"{device_id}:shot:{shot:06d}"
                member_hashes = [sha256_member(source, entry) for entry in entries]
                reconstruction_digest = content_reconstruction_digest(entries, member_hashes)
                reconstruction_id = (
                    f"{device_slug}:efit:{shot:06d}:{reconstruction_digest[:20]}"
                )
                frames: list[dict[str, object]] = []
                frame_summaries: list[dict[str, object]] = []
                frame_assets: list[dict[str, object]] = []
                shot_dir = shots_root / f"{shot:06d}"
                shot_dir.mkdir()

                quality_counts: Counter[str] = Counter()
                validity_counts: Counter[str] = Counter()
                feature_totals: Counter[str] = Counter()
                geometry_counts: Counter[str] = Counter()
                max_features: Counter[str] = Counter()
                for frame_index, entry in enumerate(entries):
                    frame = read_frame(source, entry)
                    geometry = canonicalize_geometry(frame.limiter)
                    _geometry_record(geometry_catalog, geometry)
                    geometry_counts[geometry.geometry_id] += 1
                    derived = derive_frame(
                        frame,
                        geometry,
                        shot_id,
                        reconstruction_id,
                        config,
                    )
                    validate_derived_frame(derived, geometry)
                    frames.append(derived)
                    quality = derived["quality"]
                    scalars = derived["scalars"]
                    frame_summaries.append(
                        {
                            "timeMs": int(derived["timeMs"]),
                            "currentA": scalars["currentA"],
                            "rAxisM": scalars["rAxisM"],
                            "zAxisM": scalars["zAxisM"],
                            "bcentrT": scalars["bcentrT"],
                            "q95": scalars["q95"],
                            "qualityValidity": quality["validity"],
                            "qualityFlags": quality["flags"],
                        }
                    )
                    validity_counts[str(quality["validity"])] += 1
                    quality_counts.update(str(flag) for flag in quality["flags"])
                    features = derived["topologyGraph"]["features"]
                    for key in (
                        "xPointCount",
                        "activeXPointCount",
                        "candidateXPointCount",
                        "boundaryXPointCount",
                        "nearBoundaryXPointCount",
                        "wallIntersectionCount",
                        "resolvedBranchCount",
                        "unresolvedArmCount",
                    ):
                        value = int(features[key])
                        feature_totals[key] += value
                        max_features[key] = max(max_features[key], value)
                    if features["nullClusters"]:
                        feature_totals["framesWithNullClusters"] += 1
                    if features["extendedLegCandidateEdgeIds"]:
                        feature_totals["framesWithExtendedLegCandidates"] += 1
                    feature_totals["wallArcCount"] += len(derived["topologyGraph"]["wallArcs"])
                    feature_totals["closedRegionCount"] += len(derived["topologyGraph"]["regions"])
                    feature_totals["unresolvedRegionCount"] += len(derived["topologyGraph"]["unresolvedRegions"])
                    if len(frames) == FRAMES_PER_CHUNK:
                        frame_assets.append(
                            _write_frame_chunk(
                                shot_dir,
                                shot,
                                len(frame_assets),
                                frame_index + 1 - len(frames),
                                frames,
                            )
                        )
                        frames = []

                if frames:
                    frame_assets.append(
                        _write_frame_chunk(
                            shot_dir,
                            shot,
                            len(frame_assets),
                            len(entries) - len(frames),
                            frames,
                        )
                    )
                times = [entry.time_ms for entry in entries]
                timeline = timeline_summary(times)
                shot_manifests.append(
                    {
                        "shotId": shot_id,
                        "shotNumber": shot,
                        "reconstructionId": reconstruction_id,
                        "reconstructionDigest": reconstruction_digest,
                        "reconstructionDigestBasis": "ordered shot/time/byteLength/G-EQDSK-SHA256",
                        "frameCount": len(entries),
                        "timeRangeMs": timeline["timeRangeMs"],
                        "strictlyIncreasing": timeline["strictlyIncreasing"],
                        "nominalCadenceMs": timeline["nominalCadenceMs"],
                        "availableTimesMs": times,
                        "frames": frame_summaries,
                        "gaps": timeline["gaps"],
                        "geometryFrameCounts": dict(sorted(geometry_counts.items())),
                        "qualitySummary": {
                            "validityFrameCounts": dict(sorted(validity_counts.items())),
                            "flagFrameCounts": dict(sorted(quality_counts.items())),
                        },
                        "topologySummary": {
                            "recordTotals": dict(sorted(feature_totals.items())),
                            "maxPerFrame": dict(sorted(max_features.items())),
                            "canonicalLabels": "graph-only; no fixed USN/LSN classification",
                        },
                        "frameAssets": frame_assets,
                    }
                )

        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "status": "private-candidate-not-authorized-for-publication",

            "deviceId": device_id,
            "generatedBy": {
                "algorithmId": ALGORITHM_ID,
                "algorithmVersion": ALGORITHM_VERSION,
                "algorithmSourceSha256": _algorithm_source_sha256(),
            },
            "source": {
                "archiveBasename": inventory.archive.name,
                "archiveBytes": inventory.archive.stat().st_size,
                "archiveSha256": source_sha256,
                "gFileCount": len(inventory.entries),
                "selectedShots": selected,
                "ignoredFileCounts": inventory.ignored_file_counts,
            },
            "coordinateSystem": {
                "source": "right-handed cylindrical (R,phi,Z)",
                "units": {"R": "m", "Z": "m", "time": "ms", "psi": "Wb/rad"},
                "cadRegistration": "not embedded; requires separately versioned transform",
            },
            "algorithm": config.public_dict(),
            "geometryCatalog": [
                geometry.public_dict() for _, geometry in sorted(geometry_catalog.items())
            ],
            "shots": shot_manifests,
            "distributionPolicy": {
                "candidateOnly": True,
                "publicReleaseAuthorized": False,
                "sourceArchiveIncluded": False,
                "sourcePsiGridIncluded": False,
                "rawGFileIncluded": False,
                "derivedOnly": True,
            },
            "migration": {
                "legacyV1Unaffected": True,
                "compatibilityMode": "optional parallel v2 graph extension",
                "publicationRequires": [
                    "source-rights review",
                    "shot allow-list",
                    "geometry revision approval",
                    "golden-frame scientific review",

                    "frontend bounded parser",
                ],
            },
        }
        (temp / "manifest.json").write_bytes(_json_bytes(manifest))
        if output.exists():
            backup = output.with_name(f".{output.name}.previous-{os.getpid()}")
            if backup.exists():
                raise ValueError(f"refusing unexpected backup collision: {backup}")
            output.replace(backup)
            try:
                temp.replace(output)
            except Exception:
                backup.replace(output)
                raise
            shutil.rmtree(backup)
        else:
            temp.replace(output)
        return manifest
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise


def _geometry_from_record(record: dict[str, object]) -> GeometryRevision:
    points = np.asarray(record["coordinatesRzM"], dtype=np.float64).reshape((-1, 2))
    canonical_sha = hashlib.sha256(points.astype("<f8", copy=False).tobytes(order="C")).hexdigest()
    if canonical_sha != record.get("canonicalSha256F64LE") or canonical_sha != record.get("sha256"):
        raise ValueError("candidate canonical geometry hash mismatch")
    if len(points) != int(record["canonicalPointCount"]) or len(points) - 1 != int(record["canonicalSegmentCount"]):
        raise ValueError("candidate canonical geometry counts mismatch")
    if np.linalg.norm(points[0] - points[-1]) > 1e-12 or signed_area(points) <= 0:
        raise ValueError("candidate canonical geometry closure/orientation mismatch")
    return GeometryRevision(
        geometry_id=str(record["geometryId"]),
        revision=str(record["revision"]),
        sha256=canonical_sha,
        source_sha256=str(record["sourceLimiterSha256F64LE"]),
        source_point_count=int(record["sourcePointCount"]),
        points=points,
        signed_area_m2=signed_area(points),
    )


def _candidate_asset_path(candidate_root: Path, relative_path: str) -> Path:
    path = (candidate_root / relative_path).resolve()
    if not _is_relative_to(path, candidate_root.resolve()):
        raise ValueError("candidate asset path escapes its package root")
    return path


def _read_and_validate_chunk(
    candidate_root: Path,
    asset: dict[str, object],
    geometry_by_id: dict[str, GeometryRevision],
    forbidden_tokens: tuple[str, ...] = (),
) -> list[dict[str, object]]:
    path = _candidate_asset_path(candidate_root, str(asset["path"]))
    if path.stat().st_size != int(asset["byteLength"]) or sha256_file(path) != asset["sha256"]:
        raise ValueError(f"candidate chunk byte/hash mismatch: {path.name}")
    records: list[dict[str, object]] = []
    expanded_bytes = 0
    with gzip.open(path, "rb") as source:
        for line in source:
            expanded_bytes += len(line)
            if len(line) > 4 * 1024 * 1024 or expanded_bytes > 32 * 1024 * 1024:
                raise ValueError("candidate chunk exceeds the reviewed decompression budget")
            record = _strict_json_loads(line)
            if not isinstance(record, dict):
                raise ValueError("candidate frame record must be a JSON object")
            _assert_no_forbidden_fields(record)
            _assert_no_private_strings(record, forbidden_tokens)
            geometry = geometry_by_id.get(str(record.get("geometryId")))
            if geometry is None:
                raise ValueError("candidate frame references an unknown geometry")
            validate_derived_frame(record, geometry)
            records.append(record)
    if len(records) != int(asset["frameCount"]):
        raise ValueError("candidate chunk frame count mismatch")
    times = [int(record["timeMs"]) for record in records]
    if times != [int(value) for value in asset["availableTimesMs"]]:
        raise ValueError("candidate chunk time mapping mismatch")
    if times and [times[0], times[-1]] != asset["timeRangeMs"]:
        raise ValueError("candidate chunk time range mismatch")
    return records


def _project_gap(record: object) -> dict[str, object]:
    if not isinstance(record, dict):
        raise ValueError("timeline gap must be an object")
    return {
        "afterMs": int(record["afterMs"]),
        "beforeMs": int(record["beforeMs"]),
        "deltaMs": int(record["deltaMs"]),
        "estimatedMissingFrames": int(record["estimatedMissingFrames"]),
        "alignedToNominalCadence": bool(record["alignedToNominalCadence"]),
    }


def _project_frame_summary(record: object) -> dict[str, object]:
    if not isinstance(record, dict):
        raise ValueError("lightweight frame summary must be an object")
    projected = {key: record[key] for key in PUBLIC_FRAME_SUMMARY_KEYS}
    projected["timeMs"] = int(projected["timeMs"])
    if projected["qualityValidity"] not in {"usable", "partial", "unavailable"}:
        raise ValueError("invalid lightweight frame quality")
    flags = projected["qualityFlags"]
    if not isinstance(flags, list) or any(
        not isinstance(flag, str) or not re.fullmatch(r"[A-Z0-9_]+", flag) for flag in flags
    ):
        raise ValueError("invalid lightweight frame quality flags")
    return projected


def _project_quality_summary(record: object) -> dict[str, object]:
    if not isinstance(record, dict):
        raise ValueError("quality summary must be an object")
    validity = record["validityFrameCounts"]
    flags = record["flagFrameCounts"]
    if not isinstance(validity, dict) or set(validity) - {"usable", "partial", "unavailable"}:
        raise ValueError("quality summary validity keys changed")
    if not isinstance(flags, dict) or any(not re.fullmatch(r"[A-Z0-9_]+", str(key)) for key in flags):
        raise ValueError("quality summary flag keys changed")
    return {
        "validityFrameCounts": {key: int(validity[key]) for key in sorted(validity)},
        "flagFrameCounts": {str(key): int(flags[key]) for key in sorted(flags)},
    }


def _project_topology_summary(record: object) -> dict[str, object]:
    if not isinstance(record, dict):
        raise ValueError("topology summary must be an object")
    allowed_totals = {
        "xPointCount",
        "activeXPointCount",
        "candidateXPointCount",
        "boundaryXPointCount",
        "nearBoundaryXPointCount",
        "wallIntersectionCount",
        "resolvedBranchCount",
        "unresolvedArmCount",
        "framesWithNullClusters",
        "framesWithExtendedLegCandidates",
        "wallArcCount",
        "closedRegionCount",
        "unresolvedRegionCount",
    }
    allowed_maxima = {
        "xPointCount",
        "activeXPointCount",
        "candidateXPointCount",
        "boundaryXPointCount",
        "nearBoundaryXPointCount",
        "wallIntersectionCount",
        "resolvedBranchCount",
        "unresolvedArmCount",
    }
    totals = record["recordTotals"]
    maxima = record["maxPerFrame"]
    if not isinstance(totals, dict) or set(totals) - allowed_totals:
        raise ValueError("topology record-total keys changed")
    if not isinstance(maxima, dict) or set(maxima) - allowed_maxima:
        raise ValueError("topology maximum keys changed")
    return {
        "recordTotals": {key: int(totals[key]) for key in sorted(totals)},
        "maxPerFrame": {key: int(maxima[key]) for key in sorted(maxima)},
        "canonicalLabels": "graph-only; no fixed USN/LSN classification",
    }


def _public_asset_record(
    candidate: dict[str, object],
    url: str,
    compressed_path: Path,
) -> dict[str, object]:
    """Project an asset to the raw-gzip HTTP contract; no Content-Encoding is implied."""
    return {
        "chunkIndex": int(candidate["chunkIndex"]),
        "frameStart": int(candidate["frameStart"]),
        "frameCount": int(candidate["frameCount"]),
        "timeRangeMs": [int(value) for value in candidate["timeRangeMs"]],
        "availableTimesMs": [int(value) for value in candidate["availableTimesMs"]],
        "url": url,
        "contentType": "application/gzip",
        "uncompressedContentType": "application/x-ndjson",
        "compression": "gzip-mtime-zero",
        "httpContentEncoding": "identity",
        "byteLength": compressed_path.stat().st_size,
        "sha256": sha256_file(compressed_path),
    }


def assert_reviewed_public_output(output: Path) -> Path:
    repository = Path(__file__).resolve().parents[2]
    expected = (repository / "public" / "data" / "exl50u-efit-v2").resolve()
    output = output.resolve()
    if output != expected:
        raise ValueError(f"reviewed publisher output is locked to: {expected}")
    return output


def publish_reviewed_candidates(
    candidate_roots: list[Path],
    output: Path,
    replace: bool,
    confirmed: bool,
    private_review_sample: bool = False,
) -> dict[str, object]:
    """Publish only fully validated, reviewed derived candidates into the locked v2 path."""
    if not confirmed:
        option = "--confirm-private-review-sample" if private_review_sample else "--confirm-derived-publication"
        raise ValueError(f"reviewed package construction requires {option}")
    output = assert_private_output(output) if private_review_sample else assert_reviewed_public_output(output)
    if output.exists() and not replace:
        raise ValueError("reviewed v2 output exists; pass --replace after review")
    if not candidate_roots:
        raise ValueError("at least one private candidate package is required")

    current_source_hash = _algorithm_source_sha256()
    geometry_records: dict[str, dict[str, object]] = {}
    geometry_objects: dict[str, GeometryRevision] = {}
    new_shots: dict[int, tuple[Path, dict[str, object], dict[str, object]]] = {}
    dataset_sources: dict[str, dict[str, object]] = {}
    algorithm_contract = GraphConfig().public_dict()
    private_source_tokens: list[str] = []

    for candidate_root_value in candidate_roots:
        candidate_root = assert_private_output(candidate_root_value.resolve(strict=True))
        manifest = _strict_json_loads((candidate_root / "manifest.json").read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("candidate manifest must be a JSON object")
        if manifest.get("schemaVersion") != SCHEMA_VERSION or manifest.get("status") != "private-candidate-not-authorized-for-publication":
            raise ValueError("publisher accepts only a private v2 candidate manifest")
        generated = manifest.get("generatedBy", {})
        if generated.get("algorithmVersion") != ALGORITHM_VERSION or generated.get("algorithmSourceSha256") != current_source_hash:
            raise ValueError("candidate was not generated by the current reviewed algorithm source")
        source = manifest.get("source", {})
        source_digest = str(source.get("archiveSha256", ""))
        reviewed = REVIEWED_SOURCE_SETS.get(source_digest)
        if reviewed is None or int(source.get("gFileCount", -1)) != int(reviewed["sourceGFileCount"]):
            raise ValueError("candidate source digest/inventory is not in the reviewed allow-list")
        source_basename = str(source.get("archiveBasename", ""))
        if source_basename:
            private_source_tokens.append(source_basename)
        dataset_id = str(reviewed["datasetId"])
        dataset_sources[dataset_id] = {
            "datasetId": dataset_id,
            "sourceKind": "approved-private-g-eqdsk-set",
            "approvedSourceDigestSha256": source_digest,
            "sourceGFileCount": reviewed["sourceGFileCount"],
            "shotNumbers": sorted(reviewed["shots"]),
            "matlabCrossValidation": {
                **MATLAB_VALIDATION,
                "result": "all G-files parsed; psi finite; per-shot times strictly increasing; one limiter geometry per shot",
            },
            "auxiliaryAEqdskEvidence": reviewed["auxiliaryAEqdskEvidence"],
        }
        if algorithm_contract != manifest.get("algorithm"):
            raise ValueError("candidate algorithm contract is not the reviewed default contract")

        for geometry_record in manifest["geometryCatalog"]:
            geometry = _geometry_from_record(geometry_record)
            existing = geometry_records.get(geometry.geometry_id)
            if existing is not None and existing != geometry_record:
                raise ValueError("candidate geometry catalogs disagree")
            geometry_records[geometry.geometry_id] = geometry_record
            geometry_objects[geometry.geometry_id] = geometry

        for shot in manifest["shots"]:
            shot_number = int(shot["shotNumber"])
            expected_count = reviewed["shots"].get(shot_number)
            if expected_count is None or int(shot["frameCount"]) != expected_count:
                raise ValueError(f"candidate shot inventory is not reviewed: {shot_number}")
            if shot_number in new_shots:
                raise ValueError(f"duplicate candidate shot: {shot_number}")
            reconstruction_digest = str(shot.get("reconstructionDigest", ""))
            expected_shot_id = f"EXL-50U:shot:{shot_number:06d}"
            expected_reconstruction_id = f"exl-50u:efit:{shot_number:06d}:{reconstruction_digest[:20]}"
            if (
                shot.get("shotId") != expected_shot_id
                or not re.fullmatch(r"[a-f0-9]{64}", reconstruction_digest)
                or shot.get("reconstructionId") != expected_reconstruction_id
            ):
                raise ValueError(f"candidate shot/reconstruction identity is invalid: {shot_number}")
            new_shots[shot_number] = (candidate_root, shot, reviewed)

    expected_new_shots = {
        shot: count
        for source in REVIEWED_SOURCE_SETS.values()
        for shot, count in source["shots"].items()
    }
    observed_new_shots = {shot: int(value[1]["frameCount"]) for shot, value in new_shots.items()}
    if private_review_sample:
        if observed_new_shots != {20289: expected_new_shots[20289]}:
            raise ValueError("private decoder review sample is locked to the complete shot 20289")
    elif observed_new_shots != expected_new_shots:
        raise ValueError("reviewed publication requires all six new shots exactly once")
    if len(geometry_objects) != 1:
        raise ValueError("reviewed six-shot release expects exactly one canonical upgraded geometry")

    repository = Path(__file__).resolve().parents[2]
    legacy_index_path = repository / "public" / "data" / "exl50u-efit" / "index.json"
    legacy_index = _strict_json_loads(legacy_index_path.read_text(encoding="utf-8"))
    if not isinstance(legacy_index, dict):
        raise ValueError("legacy v1 index must be a JSON object")
    legacy_points = np.asarray(legacy_index["geometry"]["limiterRzM"], dtype=np.float64).reshape((-1, 2))
    legacy_hash = hashlib.sha256(legacy_points.astype("<f8", copy=False).tobytes(order="C")).hexdigest()
    legacy_geometry_id = f"legacy-wall-{legacy_hash[:20]}"
    legacy_geometry = {
        "id": legacy_geometry_id,
        "kind": "axisymmetric-wall-limiter-rz-polyline",
        "contractKind": "legacy-source-order-v1",
        "closed": bool(np.linalg.norm(legacy_points[0] - legacy_points[-1]) <= 1e-8),
        "pointCount": len(legacy_points),
        "segmentCount": len(legacy_points) - 1,
        "limiterSha256F64LE": legacy_hash,
        "segmentIndexBasis": "legacy limiterRzM[i] -> limiterRzM[i+1]",
        "limiterRzM": legacy_points.astype(float).reshape(-1).tolist(),
    }
    legacy_shots: list[dict[str, object]] = []
    for shot in legacy_index["shots"]:
        shot_number = int(shot["shot"])
        expected_hash = LEGACY_BASE_SHA256.get(shot_number)
        if expected_hash is None or shot["binary"]["sha256"] != expected_hash:
            raise ValueError("legacy v1 base binary hash changed")
        legacy_shots.append(
            {
                "shot": shot_number,
                "shotId": f"EXL-50U:shot:{shot_number:06d}",
                "sourceKind": "legacy-contours-v1",
                "geometryId": legacy_geometry_id,
                "frameCount": int(shot["frameCount"]),
                "timeRangeMs": shot["timeRangeMs"],
                "manifestUrl": "/device-data/exl50u-efit/index.json",
                "manifestShot": shot_number,
                "baseBinaryUrl": shot["binary"]["url"],
                "baseBinarySha256": shot["binary"]["sha256"],
                "topologyBinaryUrl": shot.get("topologyBinary", {}).get("url"),
                "topologyAvailability": "reviewed-v1-sidecar" if shot.get("topologyBinary") else "contours-only",
            }
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".exl50u-efit-v2-", dir=output.parent))
    try:
        public_shots: list[dict[str, object]] = []
        for shot_number, (candidate_root, shot, reviewed) in sorted(new_shots.items()):
            copied_assets: list[dict[str, object]] = []
            observed_times: list[int] = []
            expected_frame_start = 0
            for asset in shot["frameAssets"]:
                if int(asset["frameStart"]) != expected_frame_start or int(asset["chunkIndex"]) != len(copied_assets):
                    raise ValueError("candidate chunk frame mapping is not contiguous")
                records = _read_and_validate_chunk(
                    candidate_root,
                    asset,
                    geometry_objects,
                    tuple(private_source_tokens),
                )
                observed_times.extend(int(record["timeMs"]) for record in records)
                name = f"shot-{shot_number}-part-{len(copied_assets):03d}.jsonl.gz"
                destination = temp / name
                _write_gzip_jsonl(destination, records)
                copied_assets.append(
                    _public_asset_record(
                        asset,
                        f"/device-data/exl50u-efit-v2/{name}",
                        destination,
                    )
                )
                expected_frame_start += len(records)
            available_times = [int(value) for value in shot["availableTimesMs"]]
            if (
                expected_frame_start != int(shot["frameCount"])
                or observed_times != available_times
                or any(after <= before for before, after in zip(available_times, available_times[1:]))
            ):
                raise ValueError("candidate chunk sequence does not cover the shot timeline exactly")
            frame_summaries = shot.get("frames")
            if not isinstance(frame_summaries, list) or [int(frame["timeMs"]) for frame in frame_summaries] != available_times:
                raise ValueError("candidate lightweight frame summaries are missing or misaligned")
            public_frame_summaries = [_project_frame_summary(frame) for frame in frame_summaries]
            geometry_counts = shot["geometryFrameCounts"]
            if not isinstance(geometry_counts, dict) or len(geometry_counts) != 1:
                raise ValueError("reviewed shot must bind exactly one geometry")
            geometry_id = next(iter(geometry_counts))
            if geometry_id not in geometry_objects or int(geometry_counts[geometry_id]) != int(shot["frameCount"]):
                raise ValueError("reviewed shot geometry count is inconsistent")
            time_range = [int(value) for value in shot["timeRangeMs"]]
            if time_range != [available_times[0], available_times[-1]] or shot.get("strictlyIncreasing") is not True:
                raise ValueError("candidate shot timeline summary is inconsistent")
            public_shots.append(
                {
                    "shot": shot_number,
                    "shotId": f"EXL-50U:shot:{shot_number:06d}",
                    "sourceKind": "topology-graph-v2",
                    "datasetId": reviewed["datasetId"],
                    "geometryId": geometry_id,
                    "reconstructionId": shot["reconstructionId"],
                    "reconstructionDigest": shot["reconstructionDigest"],
                    "frameCount": int(shot["frameCount"]),
                    "timeRangeMs": time_range,
                    "strictlyIncreasing": True,
                    "nominalCadenceMs": int(shot["nominalCadenceMs"]),
                    "availableTimesMs": available_times,
                    "gaps": [_project_gap(gap) for gap in shot["gaps"]],
                    "frames": public_frame_summaries,
                    "qualitySummary": _project_quality_summary(shot["qualitySummary"]),
                    "topologySummary": _project_topology_summary(shot["topologySummary"]),
                    "frameAssets": copied_assets,
                }
            )

        upgraded_geometries = []
        for geometry_id, record in sorted(geometry_records.items()):
            upgraded_geometries.append(
                {
                    "id": geometry_id,
                    "kind": record["kind"],
                    "contractKind": "canonical-graph-v2",
                    "closed": record["closed"],
                    "sourcePointCount": record["sourcePointCount"],
                    "canonicalPointCount": record["canonicalPointCount"],
                    "segmentCount": record["canonicalSegmentCount"],
                    "sourceLimiterSha256F64LE": record["sourceLimiterSha256F64LE"],
                    "canonicalSha256F64LE": record["canonicalSha256F64LE"],
                    "orientation": record["orientation"],
                    "startPointRule": record["startPointRule"],
                    "closureRule": record["closureRule"],
                    "segmentIndexBasis": record["segmentIndexBasis"],
                    "sourceOrderPreserved": record["sourceOrderPreserved"],
                    "limiterRzM": record["coordinatesRzM"],
                }
            )
        default_geometry_id = upgraded_geometries[0]["id"]
        all_shots = sorted([*legacy_shots, *public_shots], key=lambda item: int(item["shot"]))
        manifest = {
            "schemaVersion": "fusion.efit.catalog.v2",
            "graphSchemaVersion": PUBLIC_SCHEMA_VERSION,
            "status": "reviewed-derived-publication",
            "device": {
                "id": "EXL-50U",
                "displayName": "EXL-50U",
                "defaultGeometryId": default_geometry_id,
            },
            "generatedBy": {
                "publisher": "scripts/efit/derive_topology_graph_v2.py",
                "algorithmId": ALGORITHM_ID,
                "algorithmVersion": ALGORITHM_VERSION,
                "algorithmSourceSha256": current_source_hash,
            },
            "coordinateSystem": {
                "source": "right-handed cylindrical (R,phi,Z)",
                "units": {"R": "m", "Z": "m", "time": "ms", "psi": "Wb/rad"},
                "threeJsMapping": "x=R*cos(phi), y=Z, z=-R*sin(phi)",
                "cadRegistration": "not embedded; requires separately versioned T_CAD_FROM_EFIT",
            },
            "gridExtentM": {"r": [0.200000003, 2.200000003], "z": [-1.899999975, 1.899999975]},
            "geometries": [legacy_geometry, *upgraded_geometries],
            "datasets": [dataset_sources[key] for key in sorted(dataset_sources)],
            "algorithm": algorithm_contract,
            "shots": all_shots,
            "distributionPolicy": {
                "derivedOnly": True,
                "sourceArchivesIncluded": False,
                "sourcePsiGridsIncluded": False,
                "rawGFilesIncluded": False,
                "auxiliaryARecordsIncluded": False,
                "chunkFrames": FRAMES_PER_CHUNK,
                "chunkTransport": {
                    "httpContentType": "application/gzip",
                    "httpContentEncoding": "identity (header omitted)",
                    "compressedBytesSha256BeforeDecompression": True,
                    "uncompressedMediaType": "application/x-ndjson",
                },
            },
            "compatibility": {
                "legacyV1AssetsUnchanged": True,
                "legacyManifestUrl": "/device-data/exl50u-efit/index.json",
                "dispatchBy": "shots[].sourceKind",
                "unknownOrInvalidV2": "fail closed for that shot; do not reinterpret graph chunks as v1 binaries",
            },
        }
        _assert_no_private_strings(manifest, tuple(private_source_tokens))
        encoded = _json_bytes(manifest)
        (temp / "index.json").write_bytes(encoded)
        expected_files = {"index.json"} | {
            asset["url"].rsplit("/", 1)[-1]
            for shot in public_shots
            for asset in shot["frameAssets"]
        }
        if {path.name for path in temp.iterdir() if path.is_file()} != expected_files:
            raise ValueError("reviewed public package file set is not exact")
        if output.exists():
            backup = output.with_name(f".{output.name}.previous-{os.getpid()}")
            if backup.exists():
                raise ValueError("unexpected reviewed-publication backup collision")
            output.replace(backup)
            try:
                temp.replace(output)
            except Exception:
                backup.replace(output)
                raise
            shutil.rmtree(backup)
        else:
            temp.replace(output)
        return manifest
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise


def _write_report(report: dict[str, object], destination: Path | None) -> None:
    encoded = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)
    if destination is None:
        print(encoded)
        return
    destination = assert_private_output(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(encoded + "\n", encoding="utf-8")
    print(json.dumps({"report": str(destination)}, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit = subparsers.add_parser("audit", help="parse every selected frame and report inventory/geometry")

    audit.add_argument("--archive", type=Path, required=True)
    audit.add_argument("--device-id", default="EXL-50U")
    audit.add_argument("--shot", type=int, action="append")
    audit.add_argument("--report", type=Path)

    build = subparsers.add_parser("build-candidate", help="build private v2 graph candidates")
    build.add_argument("--archive", type=Path, required=True)
    build.add_argument("--expected-sha256", required=True)
    build.add_argument("--device-id", required=True)
    build.add_argument("--output", type=Path, required=True)
    build.add_argument("--shot", type=int, action="append")
    build.add_argument("--replace", action="store_true")

    publish = subparsers.add_parser(
        "publish-reviewed",
        help="validate all six reviewed private candidates and build the single public v2 catalog",
    )
    publish.add_argument("--candidate", type=Path, action="append", required=True)
    publish.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "public" / "data" / "exl50u-efit-v2",
    )
    publish.add_argument("--replace", action="store_true")
    publish.add_argument("--confirm-derived-publication", action="store_true")

    sample = subparsers.add_parser(
        "build-review-sample",
        help="build a private final-contract catalog/chunks for the complete reviewed shot 20289",
    )
    sample.add_argument("--candidate", type=Path, required=True)
    sample.add_argument("--output", type=Path, required=True)
    sample.add_argument("--replace", action="store_true")
    sample.add_argument("--confirm-private-review-sample", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "audit":
            report = audit_archive(args.archive, args.device_id, args.shot)
            _write_report(report, args.report)
        elif args.command == "build-candidate":
            manifest = build_candidate(
                args.archive,
                args.expected_sha256,
                args.device_id,
                args.output,
                args.shot,
                args.replace,
            )
            print(
                json.dumps(
                    {
                        "output": str(args.output.resolve()),
                        "schemaVersion": manifest["schemaVersion"],
                        "shots": {
                            str(shot["shotNumber"]): shot["frameCount"] for shot in manifest["shots"]
                        },
                    },
                    ensure_ascii=False,
                )
            )
        elif args.command == "publish-reviewed":
            manifest = publish_reviewed_candidates(
                args.candidate,
                args.output,
                args.replace,
                args.confirm_derived_publication,
            )
            print(
                json.dumps(
                    {
                        "output": str(args.output.resolve()),
                        "schemaVersion": manifest["schemaVersion"],
                        "shots": [int(shot["shot"]) for shot in manifest["shots"]],
                        "files": 1
                        + sum(
                            len(shot.get("frameAssets", []))
                            for shot in manifest["shots"]
                            if shot["sourceKind"] == "topology-graph-v2"
                        ),
                    },
                    ensure_ascii=False,
                )
            )
        else:
            manifest = publish_reviewed_candidates(
                [args.candidate],
                args.output,
                args.replace,
                args.confirm_private_review_sample,
                private_review_sample=True,
            )
            print(
                json.dumps(
                    {
                        "output": str(args.output.resolve()),
                        "schemaVersion": manifest["schemaVersion"],
                        "reviewShot": 20289,
                        "files": 1
                        + sum(
                            len(shot.get("frameAssets", []))
                            for shot in manifest["shots"]
                            if shot["sourceKind"] == "topology-graph-v2"
                        ),
                    },
                    ensure_ascii=False,
                )
            )
    except (OSError, ValueError, zipfile.BadZipFile) as error:

        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
