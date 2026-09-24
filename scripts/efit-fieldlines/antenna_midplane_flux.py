"""Small derived midplane flux profile for a radial antenna position slider.

The source equilibrium is axisymmetric: phi is registration metadata, not an
extra dimension being inferred. Raw psi is evaluated inside the original R/Z
grid even outside the LCFS; no F or magnetic-field extension is performed.
"""
from __future__ import annotations

import math
import numpy as np


def _inside_or_on_polygon(r: float, z: float, polygon: np.ndarray) -> bool:
    inside = False
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        dr, dz = b - a
        cross = (r - a[0]) * dz - (z - a[1]) * dr
        if abs(cross) <= 1e-12 and min(a[0], b[0]) - 1e-12 <= r <= max(a[0], b[0]) + 1e-12 and min(a[1], b[1]) - 1e-12 <= z <= max(a[1], b[1]) + 1e-12:
            return True
        if (a[1] > z) != (b[1] > z):
            crossing = a[0] + (z - a[1]) * dr / dz
            if r < crossing:
                inside = not inside
    return inside


def midplane_lcfs_intervals(boundary_rz, z_m: float = 0.0) -> list[list[float]]:
    polygon = np.asarray(boundary_rz, dtype=float)
    if polygon.ndim != 2 or polygon.shape[1] != 2 or len(polygon) < 3 or not np.isfinite(polygon).all():
        raise ValueError("LCFS outline must contain finite R/Z polygon vertices")
    crossings = []
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        if a[1] == b[1]:
            if abs(a[1] - z_m) <= 1e-12:
                crossings.extend([float(a[0]), float(b[0])])
        elif min(a[1], b[1]) <= z_m <= max(a[1], b[1]):
            crossings.append(float(a[0] + (z_m - a[1]) * (b[0] - a[0]) / (b[1] - a[1])))
    crossings.sort()
    unique = []
    for value in crossings:
        if not unique or value - unique[-1] > 1e-10:
            unique.append(value)
    intervals = []
    for start, end in zip(unique, unique[1:]):
        if end - start > 1e-10 and _inside_or_on_polygon((start + end) / 2, z_m, polygon):
            if intervals and abs(intervals[-1][1] - start) <= 1e-10:
                intervals[-1][1] = end
            else:
                intervals.append([start, end])
    return [[round(start, 9), round(end, 9)] for start, end in intervals]


def build_antenna_midplane_flux(field, boundary_rz, *, r_start_m=1.1, r_step_m=0.001, samples=501, z_m=0.0, phi_degrees=300):
    if not all(math.isfinite(x) for x in (r_start_m, r_step_m, z_m, phi_degrees)) or r_step_m <= 0 or not 2 <= samples <= 1001:
        raise ValueError("invalid bounded antenna sampling request")
    radii = r_start_m + np.arange(samples, dtype=float) * r_step_m
    in_grid = (radii >= field.r[0]) & (radii <= field.r[-1]) & (z_m >= field.z[0]) & (z_m <= field.z[-1])
    psi = np.full(samples, np.nan)
    if in_grid.any():
        psi[in_grid] = field.psi.ev(radii[in_grid], np.full(np.count_nonzero(in_grid), z_m))
    values = [round(float(value), 10) if math.isfinite(value) else None for value in psi]
    return {"state": "valid", "rStartM": r_start_m, "rStepM": r_step_m, "zM": z_m, "phiDegrees": phi_degrees,
            "psiWb": values, "psiAxisWb": float(field.psi_axis), "psiBoundaryWb": float(field.psi_axis + field.psi_span),
            "lcfsIntervalsRM": midplane_lcfs_intervals(boundary_rz, z_m),
            "sourceGridBoundsRM": [float(field.r[0]), float(field.r[-1])],
            "sourceGridBoundsZM": [float(field.z[0]), float(field.z[-1])],
            "method": "cubic-source-grid-sampled-linear-display"}
