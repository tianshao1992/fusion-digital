#!/usr/bin/env python3
"""Bind lightweight LCFS radial extrema to the already-published EFIT assets.

The extrema are derived only from the public, resampled LCFS coordinates. The
script never substitutes the EFIT source-grid bounds and never interpolates a
missing LCFS. It is deterministic and refuses any binary/chunk hash mismatch.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LEGACY_ROOT = ROOT / "public" / "data" / "exl50u-efit"
GRAPH_ROOT = ROOT / "public" / "data" / "exl50u-efit-v2"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, value: object) -> None:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(encoded, encoding="utf-8")


def _legacy_extrema() -> None:
    index_path = LEGACY_ROOT / "index.json"
    catalog = json.loads(index_path.read_text(encoding="utf-8"))
    layout = catalog["binaryLayout"]
    contour_points = int(layout["contourPoints"])
    surface_count = len(layout["surfacePsiN"])
    lcfs_payload_offset = int(layout["frameHeaderBytes"]) + surface_count * contour_points * 8

    for shot in catalog["shots"]:
        binary_path = LEGACY_ROOT / Path(shot["binary"]["url"]).name
        if binary_path.stat().st_size != int(shot["binary"]["byteLength"]):
            raise ValueError(f"legacy EFIT byte length changed: {binary_path}")
        if _sha256(binary_path) != str(shot["binary"]["sha256"]).lower():
            raise ValueError(f"legacy EFIT hash changed: {binary_path}")
        payload = binary_path.read_bytes()
        for summary in shot["frames"]:
            valid = int(summary["lcfsValidPoints"])
            if valid <= 1:
                summary["lcfsRMinM"] = None
                summary["lcfsRMaxM"] = None
                continue
            start = int(summary["offsetBytes"]) + lcfs_payload_offset
            radial = [struct.unpack_from("<f", payload, start + index * 8)[0] for index in range(valid)]
            if not all(value == value and abs(value) != float("inf") for value in radial):
                raise ValueError(f"legacy EFIT LCFS contains a non-finite radius: shot {shot['shot']}")
            summary["lcfsRMinM"] = min(radial)
            summary["lcfsRMaxM"] = max(radial)
            if not summary["lcfsRMinM"] <= float(summary["rAxisM"]) <= summary["lcfsRMaxM"]:
                raise ValueError(f"legacy EFIT magnetic axis is outside its LCFS: shot {shot['shot']}")
    _write_json(index_path, catalog)


def _source_lcfs_extrema(frame: dict[str, object]) -> tuple[float | None, float | None]:
    surfaces = frame.get("closedFluxSurfaces")
    if not isinstance(surfaces, list):
        raise ValueError("topology frame has no closedFluxSurfaces array")
    matches = [
        surface for surface in surfaces
        if isinstance(surface, dict) and surface.get("source") == "g-eqdsk-boundary-polyline"
    ]
    if not matches:
        return None, None
    if len(matches) != 1:
        raise ValueError("topology frame has multiple source LCFS records")
    points = matches[0].get("pointsRzM")
    if not isinstance(points, list) or len(points) < 6 or len(points) % 2:
        raise ValueError("topology frame source LCFS is malformed")
    radial = [float(value) for value in points[0::2]]
    return round(min(radial), 8), round(max(radial), 8)


def _graph_extrema() -> None:
    index_path = GRAPH_ROOT / "index.json"
    catalog = json.loads(index_path.read_text(encoding="utf-8"))
    for shot in catalog["shots"]:
        if shot["sourceKind"] != "topology-graph-v2":
            continue
        frames: list[dict[str, object]] = []
        for asset in shot["frameAssets"]:
            chunk_path = GRAPH_ROOT / Path(asset["url"]).name
            if chunk_path.stat().st_size != int(asset["byteLength"]):
                raise ValueError(f"EFIT v2 chunk byte length changed: {chunk_path}")
            if _sha256(chunk_path) != str(asset["sha256"]).lower():
                raise ValueError(f"EFIT v2 chunk hash changed: {chunk_path}")
            decoded = gzip.decompress(chunk_path.read_bytes()).decode("utf-8")
            records = [json.loads(line) for line in decoded.splitlines() if line]
            if len(records) != int(asset["frameCount"]):
                raise ValueError(f"EFIT v2 chunk frame count changed: {chunk_path}")
            frames.extend(records)
        if len(frames) != len(shot["frames"]):
            raise ValueError(f"EFIT v2 timeline count changed: shot {shot['shot']}")
        for summary, frame in zip(shot["frames"], frames, strict=True):
            if int(summary["timeMs"]) != int(frame["timeMs"]):
                raise ValueError(f"EFIT v2 timeline identity changed: shot {shot['shot']}")
            lcfs_min, lcfs_max = _source_lcfs_extrema(frame)
            summary["lcfsRMinM"] = lcfs_min
            summary["lcfsRMaxM"] = lcfs_max
            if lcfs_min is not None and not lcfs_min <= float(summary["rAxisM"]) <= lcfs_max:
                raise ValueError(f"EFIT v2 magnetic axis is outside its LCFS: shot {shot['shot']}")
    _write_json(index_path, catalog)


def main() -> None:
    _legacy_extrema()
    _graph_extrema()
    print("EFIT LCFS radial summaries enriched from reviewed public geometry.")


if __name__ == "__main__":
    main()
