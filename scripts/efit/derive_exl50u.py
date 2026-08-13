#!/usr/bin/env python3
"""Build browser-safe EXL-50U equilibrium contours directly from a private ZIP.

The source archive is never extracted into this repository. The public artifact contains
only derived scalar values and resampled contours; the original 129x129 psi grid and
G-EQDSK files are deliberately not published.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import struct
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import contourpy
import numpy as np

SCHEMA_VERSION = "exl50u.efit.contours.v1"
CONVERTER_VERSION = "1.0.0"
EXPECTED_ARCHIVE_SHA256 = "5304a47e15613963d27238f7ff691e020b8befd9bdceb57155046517edbdb09f"
EXPECTED_SHOTS = {18301: 973, 18303: 691, 18304: 253, 18308: 441}
SURFACE_LEVELS = tuple(round(value, 1) for value in np.linspace(0.1, 0.9, 9))
POINTS_PER_CONTOUR = 128
FILE_HEADER_BYTES = 64
FRAME_HEADER_BYTES = 64
CONTOUR_FLOATS = (len(SURFACE_LEVELS) + 1) * POINTS_PER_CONTOUR * 2
FRAME_STRIDE_BYTES = FRAME_HEADER_BYTES + CONTOUR_FLOATS * 4
MAGIC = b"EXL50EF1"

QUALITY_FLAGS = {
    "SOURCE_VALID": 1 << 0,
    "TIME_GAP_BEFORE": 1 << 1,
    "LOW_ABS_CURRENT_LT_50KA": 1 << 2,
    "NEGATIVE_CURRENT": 1 << 3,
    "NEGATIVE_PRESSURE": 1 << 4,
    "EXTREME_Q": 1 << 5,
    "LCFS_MISSING": 1 << 6,
    "SURFACE_INCOMPLETE": 1 << 7,
    "Q95_MISSING": 1 << 8,
    "EFIT_NOT_CONVERGED": 1 << 9,
    "EFIT_METADATA_MISSING": 1 << 10,
}

FLOAT_RE = re.compile(rb"[-+]?\d*\.\d+(?:[EeDd][-+]?\d+)")
GFILE_RE = re.compile(r"(?:^|/)(\d{5})/EFIT/g0?(\d+)\.(\d+)$")
OUT1_RE = re.compile(r"\s*&OUT1\b(?P<body>.*?)\s*/", re.DOTALL | re.IGNORECASE)


@dataclass
class GFile:
    shot: int
    time_ms: int
    nw: int
    nh: int
    rdim: float
    zdim: float
    rcentr: float
    rleft: float
    zmid: float
    r_axis: float
    z_axis: float
    psi_axis: float
    psi_boundary: float
    bcentr: float
    current: float
    pressure: np.ndarray
    qpsi: np.ndarray
    psirz: np.ndarray
    lcfs: np.ndarray
    limiter: np.ndarray
    efit_error: float
    iconvr: int


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _floats(lines: list[bytes]) -> list[float]:
    return [float(token.replace(b"D", b"E")) for line in lines for token in FLOAT_RE.findall(line)]


def _read_fixed(lines: list[bytes], cursor: int, count: int, label: str) -> tuple[np.ndarray, int]:
    line_count = math.ceil(count / 5)
    values = _floats(lines[cursor : cursor + line_count])
    if len(values) != count:
        raise ValueError(f"{label}: expected {count} values, found {len(values)}")
    return np.asarray(values, dtype=np.float64), cursor + line_count


def _namelist_scalar(text: str, key: str, default: float) -> float:
    match = re.search(rf"\b{re.escape(key)}\s*=\s*([-+]?\d+(?:\.\d*)?(?:[EeDd][-+]?\d+)?)", text, re.I)
    return float(match.group(1).replace("D", "E").replace("d", "e")) if match else default


def parse_gfile(data: bytes, archive_name: str) -> GFile:
    name_match = GFILE_RE.search(archive_name)
    if not name_match:
        raise ValueError(f"not a recognized EXL-50U g-file: {archive_name}")
    shot = int(name_match.group(1))
    time_ms = int(name_match.group(3))
    lines = data.splitlines()
    first = lines[0].decode("ascii", "replace")
    header = first.split()
    nw, nh = int(header[-2]), int(header[-1])
    header_match = re.search(r"#\s*(\d+)\s+(\d+)ms", first)
    if not header_match or (int(header_match.group(1)), int(header_match.group(2))) != (shot, time_ms):
        raise ValueError(f"filename/header mismatch in {archive_name}")

    header_values = _floats(lines[1:5])
    if len(header_values) < 11:
        raise ValueError(f"incomplete G-EQDSK header in {archive_name}")
    (
        rdim,
        zdim,
        rcentr,
        rleft,
        zmid,
        r_axis,
        z_axis,
        psi_axis,
        psi_boundary,
        bcentr,
        current,
    ) = header_values[:11]

    cursor = 5
    _, cursor = _read_fixed(lines, cursor, nw, "fpol")
    pressure, cursor = _read_fixed(lines, cursor, nw, "pressure")
    _, cursor = _read_fixed(lines, cursor, nw, "ffprim")
    _, cursor = _read_fixed(lines, cursor, nw, "pprime")
    psi_flat, cursor = _read_fixed(lines, cursor, nw * nh, "psirz")
    qpsi, cursor = _read_fixed(lines, cursor, nw, "qpsi")

    counts = lines[cursor].split()
    n_boundary, n_limiter = int(counts[0]), int(counts[1])
    cursor += 1
    lcfs_flat, cursor = _read_fixed(lines, cursor, 2 * n_boundary, "lcfs")
    limiter_flat, cursor = _read_fixed(lines, cursor, 2 * n_limiter, "limiter")

    # The file follows Fortran ((psirz(i,j),i=1,nw),j=1,nh): R varies fastest.
    psirz = psi_flat.reshape((nh, nw), order="C")
    tail = b"\n".join(lines[cursor:]).decode("ascii", "replace")
    out1_match = OUT1_RE.search(tail)
    out1 = out1_match.group("body") if out1_match else ""
    return GFile(
        shot=shot,
        time_ms=time_ms,
        nw=nw,
        nh=nh,
        rdim=rdim,
        zdim=zdim,
        rcentr=rcentr,
        rleft=rleft,
        zmid=zmid,
        r_axis=r_axis,
        z_axis=z_axis,
        psi_axis=psi_axis,
        psi_boundary=psi_boundary,
        bcentr=bcentr,
        current=current,
        pressure=pressure,
        qpsi=qpsi,
        psirz=psirz,
        lcfs=lcfs_flat.reshape((-1, 2)),
        limiter=limiter_flat.reshape((-1, 2)),
        efit_error=_namelist_scalar(out1, "ERROR", math.nan),
        iconvr=int(_namelist_scalar(out1, "ICONVR", -1)),
    )


def signed_area(points: np.ndarray) -> float:
    x, y = points[:, 0], points[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def resample_closed(points: np.ndarray, count: int = POINTS_PER_CONTOUR) -> np.ndarray | None:
    points = np.asarray(points, dtype=np.float64)
    points = points[np.all(np.isfinite(points), axis=1)]
    if len(points) < 3:
        return None
    keep = np.ones(len(points), dtype=bool)
    keep[1:] = np.linalg.norm(np.diff(points, axis=0), axis=1) > 1e-10
    points = points[keep]
    if len(points) < 3:
        return None
    if np.linalg.norm(points[0] - points[-1]) > 1e-8:
        points = np.vstack((points, points[0]))
    else:
        points[-1] = points[0]
    if signed_area(points[:-1]) < 0:
        points = np.vstack((points[-2::-1], points[-2]))
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    total = float(np.sum(lengths))
    if not math.isfinite(total) or total <= 1e-9:
        return None
    cumulative = np.concatenate(([0.0], np.cumsum(lengths)))
    sample_at = np.linspace(0.0, total, count, endpoint=False)
    sampled = np.column_stack(
        (np.interp(sample_at, cumulative, points[:, 0]), np.interp(sample_at, cumulative, points[:, 1]))
    )
    # Stable phase: start at the outboard-most point, breaking ties by the lowest Z.
    max_r = float(np.max(sampled[:, 0]))
    candidates = np.flatnonzero(np.isclose(sampled[:, 0], max_r, atol=1e-7))
    start = int(candidates[np.argmin(sampled[candidates, 1])])
    return np.roll(sampled, -start, axis=0).astype("<f4")


def point_in_polygon(point: tuple[float, float], polygon: np.ndarray) -> bool:
    x, y = point
    px, py = polygon[:, 0], polygon[:, 1]
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        if ((py[i] > y) != (py[j] > y)) and x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i]) + px[i]:
            inside = not inside
        j = i
    return inside


def _choose_axis_contour(lines: list[np.ndarray], frame: GFile) -> np.ndarray | None:
    valid: list[tuple[float, np.ndarray]] = []
    for line in lines:
        if len(line) < 4:
            continue
        close_tolerance = 2.5 * max(frame.rdim / (frame.nw - 1), frame.zdim / (frame.nh - 1))
        if np.linalg.norm(line[0] - line[-1]) > close_tolerance:
            continue
        polygon = np.vstack((line, line[0])) if np.linalg.norm(line[0] - line[-1]) > 1e-10 else line
        if not point_in_polygon((frame.r_axis, frame.z_axis), polygon):
            continue
        area = abs(signed_area(polygon[:-1]))
        if area > 1e-8:
            valid.append((area, polygon))
    return max(valid, key=lambda item: item[0])[1] if valid else None


def derive_contours(frame: GFile) -> tuple[np.ndarray, int]:
    # Missing contours remain finite zeroes and are identified exclusively by validity bits.
    # This avoids propagating NaN through WebGL vertex buffers or bounds calculations.
    contours = np.zeros((len(SURFACE_LEVELS) + 1, POINTS_PER_CONTOUR, 2), dtype="<f4")
    surface_mask = 0
    span = frame.psi_boundary - frame.psi_axis
    if math.isfinite(span) and abs(span) > 1e-12:
        r = np.linspace(frame.rleft, frame.rleft + frame.rdim, frame.nw)
        z = np.linspace(frame.zmid - frame.zdim / 2, frame.zmid + frame.zdim / 2, frame.nh)
        generator = contourpy.contour_generator(x=r, y=z, z=frame.psirz, line_type="Separate")
        for index, psi_n in enumerate(SURFACE_LEVELS):
            level = frame.psi_axis + psi_n * span
            chosen = _choose_axis_contour(generator.lines(level), frame)
            sampled = resample_closed(chosen) if chosen is not None else None
            if sampled is not None:
                contours[index] = sampled
                surface_mask |= 1 << index
    lcfs = resample_closed(frame.lcfs)
    if lcfs is not None:
        contours[-1] = lcfs
    return contours, surface_mask


def q_at_psi_n(qpsi: np.ndarray, psi_n: float) -> float:
    finite = np.isfinite(qpsi)
    if int(np.sum(finite)) < 2:
        return math.nan
    x = np.linspace(0.0, 1.0, len(qpsi))[finite]
    return float(np.interp(psi_n, x, qpsi[finite]))


def gaps(times: list[int]) -> list[dict[str, int]]:
    return [
        {"afterMs": before, "beforeMs": after, "missingCount": after - before - 1}
        for before, after in zip(times, times[1:])
        if after > before + 1
    ]


def frame_quality(frame: GFile, surface_mask: int, gap_before: bool) -> int:
    flags = QUALITY_FLAGS["SOURCE_VALID"]
    if gap_before:
        flags |= QUALITY_FLAGS["TIME_GAP_BEFORE"]
    if abs(frame.current) < 50_000:
        flags |= QUALITY_FLAGS["LOW_ABS_CURRENT_LT_50KA"]
    if frame.current < 0:
        flags |= QUALITY_FLAGS["NEGATIVE_CURRENT"]
    if np.nanmin(frame.pressure) < -1e-6:
        flags |= QUALITY_FLAGS["NEGATIVE_PRESSURE"]
    if np.nanmax(np.abs(frame.qpsi)) > 50:
        flags |= QUALITY_FLAGS["EXTREME_Q"]
    if resample_closed(frame.lcfs) is None:
        flags |= QUALITY_FLAGS["LCFS_MISSING"]
    if surface_mask != (1 << len(SURFACE_LEVELS)) - 1:
        flags |= QUALITY_FLAGS["SURFACE_INCOMPLETE"]
    if not math.isfinite(q_at_psi_n(frame.qpsi, 0.95)):
        flags |= QUALITY_FLAGS["Q95_MISSING"]
    if frame.iconvr >= 0 and frame.iconvr != 2:
        flags |= QUALITY_FLAGS["EFIT_NOT_CONVERGED"]
    if not math.isfinite(frame.efit_error) or frame.iconvr < 0:
        flags |= QUALITY_FLAGS["EFIT_METADATA_MISSING"]
    return flags


def encode_frame(frame: GFile, previous_time: int | None) -> tuple[bytes, int, int, int]:
    contours, surface_mask = derive_contours(frame)
    gap_before = previous_time is not None and frame.time_ms > previous_time + 1
    flags = frame_quality(frame, surface_mask, gap_before)
    q95 = q_at_psi_n(frame.qpsi, 0.95)
    lcfs_valid = 0 if flags & QUALITY_FLAGS["LCFS_MISSING"] else POINTS_PER_CONTOUR
    efit_error = frame.efit_error if math.isfinite(frame.efit_error) else 0.0
    iconvr = float(frame.iconvr if frame.iconvr >= 0 else -1)
    q95_binary = q95 if math.isfinite(q95) else 0.0
    header = bytearray(FRAME_HEADER_BYTES)
    struct.pack_into("<iI", header, 0, frame.time_ms, flags)
    struct.pack_into(
        "<9f",
        header,
        8,
        frame.current,
        frame.r_axis,
        frame.z_axis,
        frame.bcentr,
        frame.psi_axis,
        frame.psi_boundary,
        q95_binary,
        efit_error,
        iconvr,
    )
    struct.pack_into("<HH", header, 44, lcfs_valid, surface_mask)
    struct.pack_into("<II", header, 48, frame.nw, frame.nh)
    payload = contours.reshape(-1).astype("<f4", copy=False).tobytes(order="C")
    result = bytes(header) + payload
    if len(result) != FRAME_STRIDE_BYTES:
        raise AssertionError(f"unexpected frame size {len(result)}")
    return result, flags, surface_mask, lcfs_valid


def file_header(shot: int, frame_count: int) -> bytes:
    header = bytearray(FILE_HEADER_BYTES)
    header[:8] = MAGIC
    struct.pack_into("<IIIIIIII", header, 8, 1, shot, frame_count, FRAME_STRIDE_BYTES, FRAME_HEADER_BYTES,
                     len(SURFACE_LEVELS), POINTS_PER_CONTOUR, FILE_HEADER_BYTES)
    for index, level in enumerate(SURFACE_LEVELS):
        header[40 + index] = int(round(level * 100))
    return bytes(header)


def _safe_archive_display_name(name: str) -> str:
    try:
        return name.encode("cp437").decode("gbk")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def build(archive: Path, output: Path, allow_unknown_source: bool = False) -> dict:
    archive = archive.resolve()
    source_sha = sha256_file(archive)
    if source_sha != EXPECTED_ARCHIVE_SHA256 and not allow_unknown_source:
        raise SystemExit(
            f"Refusing unexpected source archive: {source_sha}. Use --allow-unknown-source only after review."
        )
    with zipfile.ZipFile(archive) as source:
        entries: dict[int, list[tuple[int, zipfile.ZipInfo]]] = defaultdict(list)
        for info in source.infolist():
            match = GFILE_RE.search(info.filename)
            if match:
                entries[int(match.group(1))].append((int(match.group(3)), info))
        actual_counts = {shot: len(values) for shot, values in entries.items()}
        if actual_counts != EXPECTED_SHOTS:
            raise SystemExit(f"Unexpected shot/frame inventory: {actual_counts}")

        temp_root = Path(tempfile.mkdtemp(prefix="exl50u-efit-", dir=output.parent))
        try:
            shots_manifest: list[dict] = []
            common_limiter: np.ndarray | None = None
            for shot in sorted(entries):
                ordered = sorted(entries[shot], key=lambda pair: pair[0])
                times = [time for time, _ in ordered]
                binary_path = temp_root / f"shot-{shot}.bin"
                quality_counts: Counter[str] = Counter()
                frame_summaries: list[dict] = []
                with binary_path.open("wb") as binary:
                    binary.write(file_header(shot, len(ordered)))
                    previous_time: int | None = None
                    for frame_index, (time_ms, info) in enumerate(ordered):
                        frame = parse_gfile(source.read(info), info.filename)
                        if frame.time_ms != time_ms or frame.shot != shot:
                            raise AssertionError("sorted frame identity changed")
                        if common_limiter is None:
                            common_limiter = frame.limiter.copy()
                        elif not np.allclose(common_limiter, frame.limiter, rtol=0, atol=1e-7):
                            raise ValueError(f"limiter changed in {info.filename}")
                        encoded, flags, surface_mask, lcfs_valid = encode_frame(frame, previous_time)
                        binary.write(encoded)
                        names = [name for name, bit in QUALITY_FLAGS.items() if flags & bit]
                        quality_counts.update(names)
                        q95 = q_at_psi_n(frame.qpsi, 0.95)
                        frame_summaries.append(
                            {
                                "timeMs": time_ms,
                                "offsetBytes": FILE_HEADER_BYTES + frame_index * FRAME_STRIDE_BYTES,
                                "qualityFlags": flags,
                                "currentA": frame.current,
                                "rAxisM": frame.r_axis,
                                "zAxisM": frame.z_axis,
                                "bcentrT": frame.bcentr,
                                "psiAxisWbPerRad": frame.psi_axis,
                                "psiBoundaryWbPerRad": frame.psi_boundary,
                                "q95": q95,
                                "efitError": frame.efit_error if math.isfinite(frame.efit_error) else None,
                                "iconvr": frame.iconvr if frame.iconvr >= 0 else None,
                                "lcfsValidPoints": lcfs_valid,
                                "surfaceMask": surface_mask,
                            }
                        )
                        previous_time = time_ms
                expected_bytes = FILE_HEADER_BYTES + len(ordered) * FRAME_STRIDE_BYTES
                if binary_path.stat().st_size != expected_bytes:
                    raise AssertionError("binary length mismatch")
                shots_manifest.append(
                    {
                        "shot": shot,
                        "frameCount": len(ordered),
                        "timeRangeMs": [times[0], times[-1]],
                        "availableTimesMs": times,
                        "gaps": gaps(times),
                        "binary": {
                            "url": f"/device-data/exl50u-efit/shot-{shot}.bin",
                            "byteLength": expected_bytes,
                            "sha256": sha256_file(binary_path),
                            "fileHeaderBytes": FILE_HEADER_BYTES,
                            "frameHeaderBytes": FRAME_HEADER_BYTES,
                            "frameStrideBytes": FRAME_STRIDE_BYTES,
                        },
                        "qualitySummary": dict(sorted(quality_counts.items())),
                        "frames": frame_summaries,
                    }
                )

            if common_limiter is None:
                raise AssertionError("no limiter found")
            manifest = {
                "schemaVersion": SCHEMA_VERSION,
                "device": {"id": "EXL-50U", "displayName": "EXL-50U"},
                "generatedBy": {"converter": "scripts/efit/derive_exl50u.py", "version": CONVERTER_VERSION},
                "provenance": {
                    "sourceType": "private EFIT G-EQDSK archive",
                    "sourceArchiveBasename": archive.name,
                    "sourceArchiveSha256": source_sha,
                    "sourceArchiveBytes": archive.stat().st_size,
                    "sourceGFileCount": sum(EXPECTED_SHOTS.values()),
                    "derivation": "Scalars and resampled contours only; original g-files and psi grids are excluded.",
                    "distributionPolicy": "Public artifact is visualization-derived data. Raw experimental files are not distributed.",
                },
                "coordinateSystem": {
                    "source": "right-handed cylindrical (R, phi, Z)",
                    "units": {"R": "m", "Z": "m", "time": "ms", "psi": "Wb/rad", "current": "A", "b": "T"},
                    "threeJsMapping": "x=R*cos(phi), y=Z, z=-R*sin(phi)",
                    "cadRegistration": "Apply a separately versioned T_CAD_FROM_EFIT; no unverified transform is baked in.",
                },
                "gridExtentM": {"r": [0.200000003, 2.200000003], "z": [-1.899999975, 1.899999975]},
                "geometry": {"limiterRzM": common_limiter.astype(float).reshape(-1).tolist()},
                "binaryLayout": {
                    "endianness": "little",
                    "magicAscii": MAGIC.decode("ascii"),
                    "fileHeaderBytes": FILE_HEADER_BYTES,
                    "frameHeaderBytes": FRAME_HEADER_BYTES,
                    "frameStrideBytes": FRAME_STRIDE_BYTES,
                    "contourPoints": POINTS_PER_CONTOUR,
                    "surfacePsiN": list(SURFACE_LEVELS),
                    "contourOrder": [*[f"psiN={value:.1f}" for value in SURFACE_LEVELS], "LCFS"],
                    "contourCoordinates": "interleaved Float32 [R0,Z0,...], counter-clockwise, equal-arc-length, phase starts near max R",
                    "missingContour": "all coordinates are finite zeroes and the corresponding valid bit is zero; never render them or interpolate fabricated source frames",
                    "frameHeaderFields": [
                        {"name": "timeMs", "offset": 0, "type": "int32"},
                        {"name": "qualityFlags", "offset": 4, "type": "uint32"},
                        {"name": "currentA", "offset": 8, "type": "float32"},
                        {"name": "rAxisM", "offset": 12, "type": "float32"},
                        {"name": "zAxisM", "offset": 16, "type": "float32"},
                        {"name": "bcentrT", "offset": 20, "type": "float32"},
                        {"name": "psiAxisWbPerRad", "offset": 24, "type": "float32"},
                        {"name": "psiBoundaryWbPerRad", "offset": 28, "type": "float32"},
                        {"name": "q95", "offset": 32, "type": "float32"},
                        {"name": "efitError", "offset": 36, "type": "float32"},
                        {"name": "iconvr", "offset": 40, "type": "float32"},
                        {"name": "lcfsValidPoints", "offset": 44, "type": "uint16"},
                        {"name": "surfaceMask", "offset": 46, "type": "uint16"},
                        {"name": "sourceNr", "offset": 48, "type": "uint32"},
                        {"name": "sourceNz", "offset": 52, "type": "uint32"},
                    ],
                    "qualityFlagBits": {name: int(math.log2(bit)) for name, bit in QUALITY_FLAGS.items()},
                },
                "shots": shots_manifest,
            }
            manifest_path = temp_root / "index.json"
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            if output.exists():
                shutil.rmtree(output)
            temp_root.replace(output)
            return manifest
        except Exception:
            shutil.rmtree(temp_root, ignore_errors=True)
            raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    archive_from_env = os.environ.get("EXL50U_EFIT_ARCHIVE")
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path(archive_from_env) if archive_from_env else None,
        help="Private source ZIP (or set EXL50U_EFIT_ARCHIVE)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "public" / "data" / "exl50u-efit",
    )
    parser.add_argument("--allow-unknown-source", action="store_true")
    args = parser.parse_args()
    if args.archive is None:
        parser.error("--archive is required unless EXL50U_EFIT_ARCHIVE is set")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    manifest = build(args.archive, args.output, args.allow_unknown_source)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "shots": {str(item["shot"]): item["frameCount"] for item in manifest["shots"]},
                "bytes": sum(item["binary"]["byteLength"] for item in manifest["shots"]),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
