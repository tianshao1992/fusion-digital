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
TOPOLOGY_SCHEMA_VERSION = "exl50u.efit.topology.v1"
CONVERTER_VERSION = "1.1.0"
EXPECTED_ARCHIVE_SHA256 = "5304a47e15613963d27238f7ff691e020b8befd9bdceb57155046517edbdb09f"
EXPECTED_SHOTS = {18301: 973, 18303: 691, 18304: 253, 18308: 441}
SURFACE_LEVELS = tuple(round(value, 1) for value in np.linspace(0.1, 0.9, 9))
POINTS_PER_CONTOUR = 128
FILE_HEADER_BYTES = 64
FRAME_HEADER_BYTES = 64
CONTOUR_FLOATS = (len(SURFACE_LEVELS) + 1) * POINTS_PER_CONTOUR * 2
FRAME_STRIDE_BYTES = FRAME_HEADER_BYTES + CONTOUR_FLOATS * 4
MAGIC = b"EXL50EF1"

# The topology extension is intentionally a sidecar.  Keeping it separate preserves the
# reviewed EXL50EF1 byte contract and lets older clients ignore the richer reconstruction.
TOPOLOGY_MAGIC = b"EXL50TP1"
TOPOLOGY_FILE_HEADER_BYTES = 64
TOPOLOGY_FRAME_HEADER_BYTES = 160
MAX_X_POINTS = 2
MAX_STRIKE_POINTS = 4
MAX_SEPARATRIX_LEGS = 4
POINTS_PER_LEG = 64
TOPOLOGY_FRAME_STRIDE_BYTES = (
    TOPOLOGY_FRAME_HEADER_BYTES + MAX_SEPARATRIX_LEGS * POINTS_PER_LEG * 2 * 4
)

TOPOLOGY_KINDS = {
    "unknown": 0,
    "limited": 1,
    "upper-single-null": 2,
    "lower-single-null": 3,
    "double-null": 4,
    "near-double-null": 5,
    "partial": 6,
}

X_POINT_ROLES = {"primary": 1, "secondary": 2}

TOPOLOGY_FLAGS = {
    "DERIVATION_ATTEMPTED": 1 << 0,
    "HAS_PRIMARY_X": 1 << 1,
    "HAS_SECONDARY_X": 1 << 2,
    "HAS_SEPARATRIX_LEGS": 1 << 3,
    "HAS_LIMITER_STRIKES": 1 << 4,
    "LIMITER_INTERSECTION_PROXY": 1 << 5,
    "INCOMPLETE_LEGS": 1 << 6,
    "AMBIGUOUS_CANDIDATES": 1 << 7,
    "GATED_LOW_CURRENT": 1 << 8,
    "GATED_PSI_SPAN": 1 << 9,
    "GATED_EFIT_NOT_CONVERGED": 1 << 10,
}

STRIKE_FLAGS = {
    "LIMITER_INTERSECTION_PROXY": 1 << 0,
    "EXACT_SEGMENT_INTERSECTION": 1 << 1,
}

# Conservative X-point acceptance thresholds.  Values between PRIMARY and SECONDARY are
# retained as near-null evidence rather than being mislabeled as a strict double-null.
X_SEARCH_PSI_N_BAND = 0.08
X_PRIMARY_PSI_N_TOLERANCE = 0.002
X_SECONDARY_PSI_N_TOLERANCE = 0.010
X_FIT_RMS_MAX = 0.01
X_HESSIAN_DETERMINANT_MAX = -1e-9
X_ROOT_MAX_GRID_OFFSET = 2.5
X_AXIS_VERTICAL_SEPARATION_M = 0.25
X_CANDIDATE_LIMIT = 96
MIN_CURRENT_A = 50_000.0
MIN_PSI_SPAN_WB_PER_RAD = 0.005
MIN_LEG_VERTICAL_PROGRESS_M = 0.04
MAX_LEG_ARC_LENGTH_M = 2.5

_quad_x, _quad_y = np.meshgrid(np.arange(-2, 3, dtype=np.float64), np.arange(-2, 3, dtype=np.float64))
_QUADRATIC_DESIGN = np.column_stack(
    (
        np.ones(_quad_x.size),
        _quad_x.ravel(),
        _quad_y.ravel(),
        _quad_x.ravel() ** 2,
        (_quad_x * _quad_y).ravel(),
        _quad_y.ravel() ** 2,
    )
)
_QUADRATIC_PINV = np.linalg.pinv(_QUADRATIC_DESIGN)

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


@dataclass
class XPoint:
    r_m: float
    z_m: float
    psi_n: float
    grad_residual: float
    fit_rms: float
    lcfs_distance_m: float
    role: str
    hessian_physical: np.ndarray


@dataclass
class StrikePoint:
    r_m: float
    z_m: float
    wall_segment: int
    x_point_index: int


@dataclass
class SeparatrixLeg:
    points: np.ndarray
    x_point_index: int
    strike_point_index: int


@dataclass
class TopologyFrame:
    kind: str
    flags: int
    x_points: list[XPoint]
    strike_points: list[StrikePoint]
    legs: list[SeparatrixLeg]


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


def resample_open(points: np.ndarray, count: int = POINTS_PER_LEG) -> np.ndarray | None:
    """Resample an observed open path without closing or extrapolating it."""
    points = np.asarray(points, dtype=np.float64)
    points = points[np.all(np.isfinite(points), axis=1)]
    if len(points) < 2:
        return None
    keep = np.ones(len(points), dtype=bool)
    keep[1:] = np.linalg.norm(np.diff(points, axis=0), axis=1) > 1e-10
    points = points[keep]
    if len(points) < 2:
        return None
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    total = float(np.sum(lengths))
    if not math.isfinite(total) or total <= 1e-9 or total > MAX_LEG_ARC_LENGTH_M:
        return None
    cumulative = np.concatenate(([0.0], np.cumsum(lengths)))
    sample_at = np.linspace(0.0, total, count, endpoint=True)
    sampled = np.column_stack(
        (np.interp(sample_at, cumulative, points[:, 0]), np.interp(sample_at, cumulative, points[:, 1]))
    )
    return sampled.astype("<f4")


def _bilinear(grid: np.ndarray, r: np.ndarray, z: np.ndarray, point: np.ndarray) -> float | None:
    r_position = (float(point[0]) - float(r[0])) / float(r[1] - r[0])
    z_position = (float(point[1]) - float(z[0])) / float(z[1] - z[0])
    r_index = math.floor(r_position)
    z_index = math.floor(z_position)
    if r_index < 0 or z_index < 0 or r_index >= len(r) - 1 or z_index >= len(z) - 1:
        return None
    r_fraction = r_position - r_index
    z_fraction = z_position - z_index
    value = (
        grid[z_index, r_index] * (1 - r_fraction) * (1 - z_fraction)
        + grid[z_index, r_index + 1] * r_fraction * (1 - z_fraction)
        + grid[z_index + 1, r_index] * (1 - r_fraction) * z_fraction
        + grid[z_index + 1, r_index + 1] * r_fraction * z_fraction
    )
    return float(value) if math.isfinite(float(value)) else None


def _x_point_score(point: XPoint) -> tuple[float, float, float, float]:
    return (
        abs(point.psi_n - 1.0),
        point.lcfs_distance_m,
        point.grad_residual,
        point.fit_rms,
    )


def derive_x_points(frame: GFile) -> tuple[list[XPoint], bool]:
    """Find active near-boundary saddle points using a local quadratic fit.

    A saddle alone is not called an active X point.  It must also match the EFIT boundary
    flux and the supplied LCFS polyline.  This deliberately rejects the common off-boundary
    saddle candidates visible in limited phases.
    """
    span = frame.psi_boundary - frame.psi_axis
    if not math.isfinite(span) or abs(span) < MIN_PSI_SPAN_WB_PER_RAD or len(frame.lcfs) < 3:
        return [], False
    psi_n = (frame.psirz - frame.psi_axis) / span
    if not np.all(np.isfinite(psi_n)):
        return [], False

    delta_r = frame.rdim / (frame.nw - 1)
    delta_z = frame.zdim / (frame.nh - 1)
    r = np.linspace(frame.rleft, frame.rleft + frame.rdim, frame.nw)
    z = np.linspace(frame.zmid - frame.zdim / 2, frame.zmid + frame.zdim / 2, frame.nh)
    gradient_z, gradient_r = np.gradient(psi_n, delta_z, delta_r, edge_order=2)
    dimensionless_gradient_sq = (gradient_r * delta_r) ** 2 + (gradient_z * delta_z) ** 2
    search = np.abs(psi_n - 1.0) <= X_SEARCH_PSI_N_BAND
    search[:2, :] = False
    search[-2:, :] = False
    search[:, :2] = False
    search[:, -2:] = False
    search &= np.isfinite(dimensionless_gradient_sq)
    indices = np.argwhere(search)
    if len(indices) == 0:
        return [], False
    ranked = indices[np.argsort(dimensionless_gradient_sq[search])[:X_CANDIDATE_LIMIT]]
    # The 129x129 reconstruction cannot support sub-cell topology claims.  Requiring the
    # saddle to lie within one source-grid diagonal of the supplied LCFS is both strict and
    # resolution-aware (about 0.0336 m for this archive).
    lcfs_tolerance_m = math.hypot(delta_r, delta_z)
    duplicate_tolerance_m = 2.0 * math.hypot(delta_r, delta_z)
    candidates: list[XPoint] = []

    for z_index, r_index in ranked:
        values = psi_n[z_index - 2 : z_index + 3, r_index - 2 : r_index + 3].reshape(-1)
        coefficients = _QUADRATIC_PINV @ values
        fitted = _QUADRATIC_DESIGN @ coefficients
        fit_rms = float(np.sqrt(np.mean((fitted - values) ** 2)))
        if not math.isfinite(fit_rms) or fit_rms > X_FIT_RMS_MAX:
            continue
        hessian_grid = np.array(
            [[2.0 * coefficients[3], coefficients[4]], [coefficients[4], 2.0 * coefficients[5]]],
            dtype=np.float64,
        )
        determinant = float(np.linalg.det(hessian_grid))
        if not math.isfinite(determinant) or determinant >= X_HESSIAN_DETERMINANT_MAX:
            continue
        try:
            root_offset = np.linalg.solve(hessian_grid, -coefficients[1:3])
        except np.linalg.LinAlgError:
            continue
        if not np.all(np.isfinite(root_offset)) or float(np.max(np.abs(root_offset))) > X_ROOT_MAX_GRID_OFFSET:
            continue

        x_offset, y_offset = (float(root_offset[0]), float(root_offset[1]))
        root_psi_n = float(
            coefficients[0]
            + coefficients[1] * x_offset
            + coefficients[2] * y_offset
            + coefficients[3] * x_offset**2
            + coefficients[4] * x_offset * y_offset
            + coefficients[5] * y_offset**2
        )
        psi_distance = abs(root_psi_n - 1.0)
        if not math.isfinite(root_psi_n) or psi_distance > X_SECONDARY_PSI_N_TOLERANCE:
            continue
        root_r = float(r[r_index] + x_offset * delta_r)
        root_z = float(z[z_index] + y_offset * delta_z)
        if abs(root_z - frame.z_axis) < X_AXIS_VERTICAL_SEPARATION_M:
            continue
        lcfs_distance = float(np.min(np.linalg.norm(frame.lcfs - np.array([root_r, root_z]), axis=1)))
        if not math.isfinite(lcfs_distance) or lcfs_distance > lcfs_tolerance_m:
            continue

        root = np.array([root_r, root_z], dtype=np.float64)
        interpolated_gradient_r = _bilinear(gradient_r, r, z, root)
        interpolated_gradient_z = _bilinear(gradient_z, r, z, root)
        if interpolated_gradient_r is None or interpolated_gradient_z is None:
            continue
        grad_residual = math.hypot(interpolated_gradient_r * delta_r, interpolated_gradient_z * delta_z)
        scale = np.diag([1.0 / delta_r, 1.0 / delta_z])
        hessian_physical = scale @ hessian_grid @ scale
        candidate = XPoint(
            r_m=root_r,
            z_m=root_z,
            psi_n=root_psi_n,
            grad_residual=grad_residual,
            fit_rms=fit_rms,
            lcfs_distance_m=lcfs_distance,
            role="secondary",
            hessian_physical=hessian_physical,
        )
        duplicate = next(
            (
                index
                for index, existing in enumerate(candidates)
                if math.hypot(root_r - existing.r_m, root_z - existing.z_m) < duplicate_tolerance_m
            ),
            None,
        )
        if duplicate is None:
            candidates.append(candidate)
        elif _x_point_score(candidate) < _x_point_score(candidates[duplicate]):
            candidates[duplicate] = candidate

    candidates.sort(key=_x_point_score)
    ambiguous = len(candidates) > MAX_X_POINTS
    if ambiguous:
        # Prefer one candidate on either side of the magnetic axis when both are supported.
        upper = next((point for point in candidates if point.z_m > frame.z_axis), None)
        lower = next((point for point in candidates if point.z_m < frame.z_axis), None)
        selected = [point for point in (upper, lower) if point is not None]
        for point in candidates:
            if len(selected) >= MAX_X_POINTS:
                break
            if point not in selected:
                selected.append(point)
        candidates = selected[:MAX_X_POINTS]
    # The scalar EFIT boundary flux supports one conservative primary X point per frame.
    # Any accepted point on the opposite side is retained as secondary near-null evidence.
    if candidates:
        primary = min(candidates, key=_x_point_score)
        if abs(primary.psi_n - 1.0) <= X_PRIMARY_PSI_N_TOLERANCE:
            primary.role = "primary"
    # Stable record order: X1 is upper when both upper and lower points are present.
    candidates.sort(key=lambda point: (-point.z_m, _x_point_score(point)))
    return candidates, ambiguous


def _cross_2d(first: np.ndarray, second: np.ndarray) -> float:
    return float(first[0] * second[1] - first[1] * second[0])


def _segment_intersection(
    first_start: np.ndarray,
    first_end: np.ndarray,
    second_start: np.ndarray,
    second_end: np.ndarray,
) -> tuple[np.ndarray, float] | None:
    first_direction = first_end - first_start
    second_direction = second_end - second_start
    denominator = _cross_2d(first_direction, second_direction)
    if abs(denominator) < 1e-12:
        return None
    displacement = second_start - first_start
    first_fraction = _cross_2d(displacement, second_direction) / denominator
    second_fraction = _cross_2d(displacement, first_direction) / denominator
    if -1e-9 <= first_fraction <= 1.0 + 1e-9 and -1e-9 <= second_fraction <= 1.0 + 1e-9:
        return first_start + first_fraction * first_direction, first_fraction
    return None


def _project_to_flux_level(
    point: np.ndarray,
    level: float,
    psi_n: np.ndarray,
    gradient_r: np.ndarray,
    gradient_z: np.ndarray,
    r: np.ndarray,
    z: np.ndarray,
    correction_limit: float,
    iterations: int,
) -> np.ndarray | None:
    projected = point.astype(np.float64, copy=True)
    for _ in range(iterations):
        value = _bilinear(psi_n, r, z, projected)
        derivative_r = _bilinear(gradient_r, r, z, projected)
        derivative_z = _bilinear(gradient_z, r, z, projected)
        if value is None or derivative_r is None or derivative_z is None:
            return None
        gradient = np.array([derivative_r, derivative_z], dtype=np.float64)
        gradient_squared = float(np.dot(gradient, gradient))
        if not math.isfinite(gradient_squared) or gradient_squared < 1e-12:
            return None
        correction = (value - level) * gradient / gradient_squared
        correction_norm = float(np.linalg.norm(correction))
        if correction_norm > correction_limit:
            correction *= correction_limit / correction_norm
        projected -= correction
        if abs(value - level) < 1e-7:
            break
    return projected


def _separatrix_directions(hessian: np.ndarray) -> list[np.ndarray]:
    eigenvalues, eigenvectors = np.linalg.eigh(hessian)
    if eigenvalues[0] >= 0 or eigenvalues[1] <= 0:
        return []
    negative = eigenvectors[:, 0]
    positive = eigenvectors[:, 1]
    directions: list[np.ndarray] = []
    for sign in (-1.0, 1.0):
        direction = positive * math.sqrt(-float(eigenvalues[0])) + sign * negative * math.sqrt(
            float(eigenvalues[1])
        )
        direction /= np.linalg.norm(direction)
        directions.extend((direction, -direction))
    unique: list[np.ndarray] = []
    for direction in directions:
        if not any(np.linalg.norm(direction - existing) < 1e-6 for existing in unique):
            unique.append(direction)
    return unique


def _trace_separatrix_arm(
    frame: GFile,
    x_point: XPoint,
    initial_direction: np.ndarray,
    level: float,
) -> tuple[np.ndarray, int] | None:
    """Follow one observed constant-flux branch to an exact limiter intersection."""
    span = frame.psi_boundary - frame.psi_axis
    psi_n = (frame.psirz - frame.psi_axis) / span
    r = np.linspace(frame.rleft, frame.rleft + frame.rdim, frame.nw)
    z = np.linspace(frame.zmid - frame.zdim / 2, frame.zmid + frame.zdim / 2, frame.nh)
    delta_r = float(r[1] - r[0])
    delta_z = float(z[1] - z[0])
    gradient_z, gradient_r = np.gradient(psi_n, delta_z, delta_r, edge_order=2)
    step = 0.4 * min(delta_r, delta_z)
    origin = np.array([x_point.r_m, x_point.z_m], dtype=np.float64)
    current = _project_to_flux_level(
        origin + step * initial_direction,
        level,
        psi_n,
        gradient_r,
        gradient_z,
        r,
        z,
        correction_limit=0.5 * step,
        iterations=8,
    )
    if current is None or np.dot(current - origin, initial_direction) <= 0:
        return None
    path = [origin, current.copy()]
    previous_direction = initial_direction.astype(np.float64, copy=True)
    arc_length = float(np.linalg.norm(current - origin))
    max_steps = math.ceil(MAX_LEG_ARC_LENGTH_M / step) + 2

    for step_index in range(max_steps):
        derivative_r = _bilinear(gradient_r, r, z, current)
        derivative_z = _bilinear(gradient_z, r, z, current)
        if derivative_r is None or derivative_z is None:
            return None
        tangent = np.array([derivative_z, -derivative_r], dtype=np.float64)
        tangent_norm = float(np.linalg.norm(tangent))
        if not math.isfinite(tangent_norm) or tangent_norm < 1e-9:
            return None
        tangent /= tangent_norm
        if np.dot(tangent, previous_direction) < 0:
            tangent = -tangent
        proposed = _project_to_flux_level(
            current + step * tangent,
            level,
            psi_n,
            gradient_r,
            gradient_z,
            r,
            z,
            correction_limit=0.4 * step,
            iterations=6,
        )
        if proposed is None:
            return None
        movement = proposed - current
        movement_length = float(np.linalg.norm(movement))
        if not math.isfinite(movement_length) or movement_length < 1e-8:
            return None

        first_hit: tuple[np.ndarray, float, int] | None = None
        for wall_segment, (wall_start, wall_end) in enumerate(zip(frame.limiter, frame.limiter[1:])):
            intersection = _segment_intersection(current, proposed, wall_start, wall_end)
            if intersection is None:
                continue
            hit, fraction = intersection
            if first_hit is None or fraction < first_hit[1]:
                first_hit = (hit, fraction, wall_segment)
        if first_hit is not None:
            hit, _, wall_segment = first_hit
            path.append(hit)
            sampled = resample_open(np.asarray(path))
            if sampled is None:
                return None
            return sampled, wall_segment

        arc_length += movement_length
        if arc_length > MAX_LEG_ARC_LENGTH_M:
            return None
        previous_direction = movement / movement_length
        current = proposed
        path.append(current.copy())
        if step_index > 20 and np.linalg.norm(current - origin) < step:
            return None
    return None


def _boundary_strike_candidates(frame: GFile, x_point: XPoint) -> list[tuple[np.ndarray, int]]:
    """Return exact psi_boundary/limiter intersections on the primary-X component.

    The result is accepted only when the source contour supplies exactly two distinct
    same-divertor-side intersections.  Zero, one or more than two is not repaired.
    """
    r = np.linspace(frame.rleft, frame.rleft + frame.rdim, frame.nw)
    z = np.linspace(frame.zmid - frame.zdim / 2, frame.zmid + frame.zdim / 2, frame.nh)
    generator = contourpy.contour_generator(x=r, y=z, z=frame.psirz, line_type="Separate")
    origin = np.array([x_point.r_m, x_point.z_m], dtype=np.float64)
    proximity_m = math.hypot(float(r[1] - r[0]), float(z[1] - z[0]))
    side = 1.0 if x_point.z_m > frame.z_axis else -1.0
    intersections: list[tuple[np.ndarray, int]] = []
    for line in generator.lines(frame.psi_boundary):
        if len(line) < 2 or float(np.min(np.linalg.norm(line - origin, axis=1))) > proximity_m:
            continue
        for start, end in zip(line, line[1:]):
            for wall_segment, (wall_start, wall_end) in enumerate(zip(frame.limiter, frame.limiter[1:])):
                intersection = _segment_intersection(start, end, wall_start, wall_end)
                if intersection is None:
                    continue
                point, _ = intersection
                if side * (float(point[1]) - x_point.z_m) < MIN_LEG_VERTICAL_PROGRESS_M:
                    continue
                if any(np.linalg.norm(point - existing) < 0.01 for existing, _ in intersections):
                    continue
                intersections.append((point, wall_segment))
    if len(intersections) != 2:
        return []
    intersections.sort(key=lambda item: float(item[0][0]))
    return intersections


def _topology_kind(frame: GFile, x_points: list[XPoint], ambiguous: bool) -> str:
    if not x_points:
        return "limited"
    if ambiguous:
        return "partial"
    primary = [point for point in x_points if point.role == "primary"]
    secondary = [point for point in x_points if point.role == "secondary"]
    if len(primary) == 1 and not secondary:
        return "upper-single-null" if primary[0].z_m > frame.z_axis else "lower-single-null"
    if (
        len(primary) == 2
        and (primary[0].z_m - frame.z_axis) * (primary[1].z_m - frame.z_axis) < 0
    ):
        return "double-null"
    if (
        len(primary) == 1
        and len(secondary) == 1
        and (primary[0].z_m - frame.z_axis) * (secondary[0].z_m - frame.z_axis) < 0
    ):
        return "near-double-null"
    return "partial"


def derive_topology(frame: GFile) -> TopologyFrame:
    gate_flags = 0
    if abs(frame.current) < MIN_CURRENT_A:
        gate_flags |= TOPOLOGY_FLAGS["GATED_LOW_CURRENT"]
    span = frame.psi_boundary - frame.psi_axis
    if not math.isfinite(span) or abs(span) < MIN_PSI_SPAN_WB_PER_RAD:
        gate_flags |= TOPOLOGY_FLAGS["GATED_PSI_SPAN"]
    if frame.iconvr != 2:
        gate_flags |= TOPOLOGY_FLAGS["GATED_EFIT_NOT_CONVERGED"]
    if gate_flags:
        return TopologyFrame(kind="unknown", flags=gate_flags, x_points=[], strike_points=[], legs=[])

    x_points, ambiguous = derive_x_points(frame)
    flags = TOPOLOGY_FLAGS["DERIVATION_ATTEMPTED"]
    if any(point.role == "primary" for point in x_points):
        flags |= TOPOLOGY_FLAGS["HAS_PRIMARY_X"]
    if any(point.role == "secondary" for point in x_points):
        flags |= TOPOLOGY_FLAGS["HAS_SECONDARY_X"]
    if ambiguous:
        flags |= TOPOLOGY_FLAGS["AMBIGUOUS_CANDIDATES"]

    strikes: list[StrikePoint] = []
    legs: list[SeparatrixLeg] = []
    for x_index, x_point in enumerate(x_points):
        # A secondary near-null is useful context but is not the active separatrix.  Publish
        # its marker and role, never fabricate divertor legs or strike points from it.
        if x_point.role != "primary":
            continue
        boundary_strikes = _boundary_strike_candidates(frame, x_point)
        if len(boundary_strikes) != 2:
            continue
        unmatched_strikes = boundary_strikes.copy()
        side = 1.0 if x_point.z_m > frame.z_axis else -1.0
        directions = [
            direction
            for direction in _separatrix_directions(x_point.hessian_physical)
            if side * float(direction[1]) > 0.1
        ]
        directions.sort(key=lambda direction: float(direction[0]))
        for direction in directions[:2]:
            # The active separatrix is psi=psi_boundary.  The first point remains the fitted
            # saddle; projection to the boundary happens within the first sub-cell step.
            traced = _trace_separatrix_arm(frame, x_point, direction, level=1.0)
            if traced is None:
                continue
            points, _ = traced
            strike_r, strike_z = (float(points[-1, 0]), float(points[-1, 1]))
            if side * (strike_z - x_point.z_m) < MIN_LEG_VERTICAL_PROGRESS_M:
                continue
            if not unmatched_strikes:
                continue
            match_index = int(
                np.argmin(
                    [
                        math.hypot(strike_r - float(item[0][0]), strike_z - float(item[0][1]))
                        for item in unmatched_strikes
                    ]
                )
            )
            exact_strike, wall_segment = unmatched_strikes[match_index]
            if math.hypot(strike_r - float(exact_strike[0]), strike_z - float(exact_strike[1])) > math.hypot(
                frame.rdim / (frame.nw - 1), frame.zdim / (frame.nh - 1)
            ):
                continue
            snapped = points.astype(np.float64)
            snapped[-1] = exact_strike
            points = resample_open(snapped)
            if points is None:
                continue
            unmatched_strikes.pop(match_index)
            strike_r, strike_z = (float(points[-1, 0]), float(points[-1, 1]))
            if any(math.hypot(strike_r - item.r_m, strike_z - item.z_m) < 0.01 for item in strikes):
                continue
            strike_index = len(strikes)
            if strike_index >= MAX_STRIKE_POINTS or len(legs) >= MAX_SEPARATRIX_LEGS:
                ambiguous = True
                flags |= TOPOLOGY_FLAGS["AMBIGUOUS_CANDIDATES"]
                break
            strikes.append(
                StrikePoint(
                    r_m=strike_r,
                    z_m=strike_z,
                    wall_segment=wall_segment,
                    x_point_index=x_index,
                )
            )
            legs.append(
                SeparatrixLeg(
                    points=points,
                    x_point_index=x_index,
                    strike_point_index=strike_index,
                )
            )

    if legs:
        flags |= TOPOLOGY_FLAGS["HAS_SEPARATRIX_LEGS"]
    if strikes:
        flags |= TOPOLOGY_FLAGS["HAS_LIMITER_STRIKES"] | TOPOLOGY_FLAGS["LIMITER_INTERSECTION_PROXY"]
    expected_leg_count = 2 * sum(point.role == "primary" for point in x_points)
    if expected_leg_count and len(legs) != expected_leg_count:
        flags |= TOPOLOGY_FLAGS["INCOMPLETE_LEGS"]
    kind = _topology_kind(frame, x_points, ambiguous)
    return TopologyFrame(kind=kind, flags=flags, x_points=x_points, strike_points=strikes, legs=legs)


def encode_topology_frame(frame: GFile, topology: TopologyFrame) -> bytes:
    header = bytearray(TOPOLOGY_FRAME_HEADER_BYTES)
    struct.pack_into("<iI", header, 0, frame.time_ms, topology.flags)
    struct.pack_into(
        "<BBBB",
        header,
        8,
        TOPOLOGY_KINDS[topology.kind],
        len(topology.x_points),
        len(topology.strike_points),
        len(topology.legs),
    )
    payload = np.zeros((MAX_SEPARATRIX_LEGS, POINTS_PER_LEG, 2), dtype="<f4")
    for leg_index, leg in enumerate(topology.legs):
        header[12 + leg_index] = POINTS_PER_LEG
        header[16 + leg_index] = leg.x_point_index
        header[20 + leg_index] = leg.strike_point_index
        payload[leg_index] = leg.points
    for x_index, point in enumerate(topology.x_points):
        header[24 + x_index] = X_POINT_ROLES[point.role]
        struct.pack_into(
            "<4f",
            header,
            32 + x_index * 16,
            point.r_m,
            point.z_m,
            point.psi_n,
            point.grad_residual,
        )
    strike_flags = STRIKE_FLAGS["LIMITER_INTERSECTION_PROXY"] | STRIKE_FLAGS["EXACT_SEGMENT_INTERSECTION"]
    for strike_index, strike in enumerate(topology.strike_points):
        struct.pack_into(
            "<ffHH",
            header,
            64 + strike_index * 12,
            strike.r_m,
            strike.z_m,
            strike.wall_segment,
            strike_flags,
        )
    result = bytes(header) + payload.reshape(-1).tobytes(order="C")
    if len(result) != TOPOLOGY_FRAME_STRIDE_BYTES:
        raise AssertionError(f"unexpected topology frame size {len(result)}")
    return result


def topology_file_header(shot: int, frame_count: int, base_sha256: str) -> bytes:
    header = bytearray(TOPOLOGY_FILE_HEADER_BYTES)
    header[:8] = TOPOLOGY_MAGIC
    struct.pack_into(
        "<IIIIIIIII",
        header,
        8,
        1,
        shot,
        frame_count,
        TOPOLOGY_FRAME_STRIDE_BYTES,
        TOPOLOGY_FRAME_HEADER_BYTES,
        MAX_SEPARATRIX_LEGS,
        POINTS_PER_LEG,
        MAX_X_POINTS,
        MAX_STRIKE_POINTS,
    )
    header[48:64] = bytes.fromhex(base_sha256)[:16]
    return bytes(header)


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


def contiguous_ranges(times: list[int]) -> list[list[int]]:
    if not times:
        return []
    ranges: list[list[int]] = []
    start = previous = times[0]
    for current in times[1:]:
        if current != previous + 1:
            ranges.append([start, previous])
            start = current
        previous = current
    ranges.append([start, previous])
    return ranges


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
                topology_frames: list[bytes] | None = [] if shot == 18303 else None
                topology_kind_counts: Counter[str] = Counter()
                topology_flag_counts: Counter[str] = Counter()
                topology_record_counts: Counter[str] = Counter()
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
                        frame_summary = {
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
                        if topology_frames is not None:
                            topology = derive_topology(frame)
                            topology_frames.append(encode_topology_frame(frame, topology))
                            topology_kind_counts[topology.kind] += 1
                            topology_flag_counts.update(
                                name for name, bit in TOPOLOGY_FLAGS.items() if topology.flags & bit
                            )
                            topology_record_counts["xPoints"] += len(topology.x_points)
                            topology_record_counts["primaryXPoints"] += sum(
                                point.role == "primary" for point in topology.x_points
                            )
                            topology_record_counts["secondaryXPoints"] += sum(
                                point.role == "secondary" for point in topology.x_points
                            )
                            topology_record_counts["strikePoints"] += len(topology.strike_points)
                            topology_record_counts["separatrixLegs"] += len(topology.legs)
                            frame_summary.update(
                                {
                                    "topologyKind": topology.kind,
                                    "topologyFlags": topology.flags,
                                    "xPointCount": len(topology.x_points),
                                    "primaryXPointCount": sum(
                                        point.role == "primary" for point in topology.x_points
                                    ),
                                    "secondaryXPointCount": sum(
                                        point.role == "secondary" for point in topology.x_points
                                    ),
                                    "strikePointCount": len(topology.strike_points),
                                    "separatrixLegCount": len(topology.legs),
                                }
                            )
                        frame_summaries.append(frame_summary)
                        previous_time = time_ms
                expected_bytes = FILE_HEADER_BYTES + len(ordered) * FRAME_STRIDE_BYTES
                if binary_path.stat().st_size != expected_bytes:
                    raise AssertionError("binary length mismatch")
                base_sha256 = sha256_file(binary_path)
                shot_manifest = {
                    "shot": shot,
                    "frameCount": len(ordered),
                    "timeRangeMs": [times[0], times[-1]],
                    "availableTimesMs": times,
                    "gaps": gaps(times),
                    "binary": {
                        "url": f"/device-data/exl50u-efit/shot-{shot}.bin",
                        "byteLength": expected_bytes,
                        "sha256": base_sha256,
                        "fileHeaderBytes": FILE_HEADER_BYTES,
                        "frameHeaderBytes": FRAME_HEADER_BYTES,
                        "frameStrideBytes": FRAME_STRIDE_BYTES,
                    },
                    "qualitySummary": dict(sorted(quality_counts.items())),
                    "frames": frame_summaries,
                }
                if topology_frames is not None:
                    topology_path = temp_root / f"shot-{shot}-topology.bin"
                    with topology_path.open("wb") as topology_binary:
                        topology_binary.write(topology_file_header(shot, len(ordered), base_sha256))
                        for encoded_topology in topology_frames:
                            topology_binary.write(encoded_topology)
                    topology_bytes = TOPOLOGY_FILE_HEADER_BYTES + len(ordered) * TOPOLOGY_FRAME_STRIDE_BYTES
                    if topology_path.stat().st_size != topology_bytes:
                        raise AssertionError("topology binary length mismatch")
                    high_confidence_times = [
                        summary["timeMs"]
                        for summary in frame_summaries
                        if summary.get("topologyKind")
                        in {
                            "upper-single-null",
                            "lower-single-null",
                            "double-null",
                            "near-double-null",
                        }
                        and summary.get("separatrixLegCount") == 2 * summary.get("primaryXPointCount", 0)
                    ]
                    shot_manifest["topologyBinary"] = {
                        "url": f"/device-data/exl50u-efit/shot-{shot}-topology.bin",
                        "byteLength": topology_bytes,
                        "sha256": sha256_file(topology_path),
                        "fileHeaderBytes": TOPOLOGY_FILE_HEADER_BYTES,
                        "frameHeaderBytes": TOPOLOGY_FRAME_HEADER_BYTES,
                        "frameStrideBytes": TOPOLOGY_FRAME_STRIDE_BYTES,
                        "baseBinarySha256": base_sha256,
                        "baseSha256PrefixHex": base_sha256[:32],
                    }
                    shot_manifest["topologySummary"] = {
                        "source": "derived-from-psirz",
                        "kindCounts": dict(sorted(topology_kind_counts.items())),
                        "flagCounts": dict(sorted(topology_flag_counts.items())),
                        "recordCounts": dict(sorted(topology_record_counts.items())),
                        "highConfidenceWindowsMs": contiguous_ranges(high_confidence_times),
                        "uncertaintyFloorM": 0.5
                        * math.hypot(
                            2.0 / (frame.nw - 1),
                            3.8 / (frame.nh - 1),
                        ),
                    }
                shots_manifest.append(shot_manifest)

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
                "extensions": {
                    "topology": {
                        "schemaVersion": TOPOLOGY_SCHEMA_VERSION,
                        "optional": True,
                        "availableShots": [18303],
                        "source": "derived-from-psirz",
                        "derivation": {
                            "description": "Axisymmetric EFIT saddle points and observed psi=psi_X branches; no raw psi grid is distributed.",
                            "gates": {
                                "minimumAbsCurrentA": MIN_CURRENT_A,
                                "minimumAbsPsiSpanWbPerRad": MIN_PSI_SPAN_WB_PER_RAD,
                                "requiredIconvr": 2,
                            },
                            "xPointAcceptance": {
                                "searchPsiNBand": X_SEARCH_PSI_N_BAND,
                                "primaryAbsPsiNMinusOneMax": X_PRIMARY_PSI_N_TOLERANCE,
                                "secondaryAbsPsiNMinusOneMax": X_SECONDARY_PSI_N_TOLERANCE,
                                "localFit": "5x5 source cells, quadratic least squares",
                                "fitRmsMax": X_FIT_RMS_MAX,
                                "hessianDeterminantMaxInGridCoordinates": X_HESSIAN_DETERMINANT_MAX,
                                "rootMaxGridOffset": X_ROOT_MAX_GRID_OFFSET,
                                "lcfsDistanceMax": "one source-grid diagonal",
                                "minimumAbsZFromMagneticAxisM": X_AXIS_VERTICAL_SEPARATION_M,
                            },
                            "separatrixLegs": "Primary X points only; numerical trace follows the active boundary psiN=1 (psi=psi_boundary) and is equal-arc-length resampled to 64 points. Secondary X points are marker-only.",
                            "strikePoints": "Exact separatrix-segment intersection with the supplied limiter polyline only; no extrapolation. This is a limiter-intersection proxy, not a verified divertor-target registration.",
                            "uncertainty": "Spatial claims below half a source-grid diagonal are unsupported; secondary X points are near-null evidence, not an active separatrix.",
                            "strictDoubleNullPolicy": "Not granted for this release: each frame has one conservative primary X point. The double-null code is reserved for a future reviewed dRsep or equivalent engineering criterion.",
                        },
                        "binaryLayout": {
                            "endianness": "little",
                            "magicAscii": TOPOLOGY_MAGIC.decode("ascii"),
                            "version": 1,
                            "fileHeaderBytes": TOPOLOGY_FILE_HEADER_BYTES,
                            "frameHeaderBytes": TOPOLOGY_FRAME_HEADER_BYTES,
                            "frameStrideBytes": TOPOLOGY_FRAME_STRIDE_BYTES,
                            "maxXPoints": MAX_X_POINTS,
                            "maxStrikePoints": MAX_STRIKE_POINTS,
                            "maxSeparatrixLegs": MAX_SEPARATRIX_LEGS,
                            "pointsPerLeg": POINTS_PER_LEG,
                            "baseBinding": "File header bytes 48..63 contain the first 16 raw bytes of the base EXL50EF1 SHA-256; the full digest is in shot.topologyBinary.baseBinarySha256.",
                            "fileHeaderFields": [
                                {"name": "magic", "offset": 0, "type": "ascii[8]"},
                                {"name": "version", "offset": 8, "type": "uint32"},
                                {"name": "shot", "offset": 12, "type": "uint32"},
                                {"name": "frameCount", "offset": 16, "type": "uint32"},
                                {"name": "frameStrideBytes", "offset": 20, "type": "uint32"},
                                {"name": "frameHeaderBytes", "offset": 24, "type": "uint32"},
                                {"name": "maxSeparatrixLegs", "offset": 28, "type": "uint32"},
                                {"name": "pointsPerLeg", "offset": 32, "type": "uint32"},
                                {"name": "maxXPoints", "offset": 36, "type": "uint32"},
                                {"name": "maxStrikePoints", "offset": 40, "type": "uint32"},
                                {"name": "baseSha256Prefix", "offset": 48, "type": "uint8[16]"},
                            ],
                            "frameHeaderFields": [
                                {"name": "timeMs", "offset": 0, "type": "int32"},
                                {"name": "topologyFlags", "offset": 4, "type": "uint32"},
                                {"name": "topologyKind", "offset": 8, "type": "uint8"},
                                {"name": "xPointCount", "offset": 9, "type": "uint8"},
                                {"name": "strikePointCount", "offset": 10, "type": "uint8"},
                                {"name": "separatrixLegCount", "offset": 11, "type": "uint8"},
                                {"name": "legValidPoints", "offset": 12, "type": "uint8[4]"},
                                {"name": "legXPointIndex", "offset": 16, "type": "uint8[4]"},
                                {"name": "legStrikePointIndex", "offset": 20, "type": "uint8[4]"},
                                {"name": "xPointRole", "offset": 24, "type": "uint8[2]"},
                                {"name": "xPointRecords", "offset": 32, "type": "2 * Float32[R,Z,psiN,gradResidual]"},
                                {"name": "strikePointRecords", "offset": 64, "type": "4 * [Float32 R,Z; Uint16 wallSegment,flags]"},
                            ],
                            "payload": "From byte 160: four zero-filled slots of 64 interleaved Float32 [R,Z] points; render only legValidPoints > 0.",
                            "topologyKindCodes": TOPOLOGY_KINDS,
                            "topologyFlagBits": {
                                name: int(math.log2(bit)) for name, bit in TOPOLOGY_FLAGS.items()
                            },
                            "xPointRoleCodes": X_POINT_ROLES,
                            "strikeFlagBits": {
                                name: int(math.log2(bit)) for name, bit in STRIKE_FLAGS.items()
                            },
                        },
                    }
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
