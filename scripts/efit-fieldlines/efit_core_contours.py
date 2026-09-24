"""Independent, axis-connected closed contours of the source equilibrium psi.

ContourPy identifies loops on the supplied source grid. The selected core loop
is resampled and projected back onto the SAME cubic psi interpolant used by the
tracer. This remains derived visualization, not added measurement resolution.
"""
from __future__ import annotations

import contourpy
import numpy as np
from antenna_midplane_flux import _inside_or_on_polygon


def closed_core_contours(field, axis_rz, boundary_rz, levels=(.25, .5, .75, .9, .97), max_points=256):
    axis = np.asarray(axis_rz, dtype=float)
    boundary = np.asarray(boundary_rz, dtype=float)
    raw_psi_n = (field.psi(field.r, field.z).T - field.psi_axis) / field.psi_span
    generator = contourpy.contour_generator(x=field.r, y=field.z, z=raw_psi_n, name="serial", line_type="Separate")
    result = []
    for level in levels:
        loops = []
        for loop in generator.lines(level):
            if len(loop) < 4 or np.linalg.norm(loop[0] - loop[-1]) > 1e-9:
                continue
            if not _inside_or_on_polygon(float(axis[0]), float(axis[1]), loop):
                continue
            area = .5 * abs(np.sum(loop[:-1, 0] * loop[1:, 1] - loop[1:, 0] * loop[:-1, 1]))
            loops.append((area, loop))
        if not loops:
            continue
        loop = min(loops, key=lambda item: item[0])[1]
        distances = np.r_[0, np.cumsum(np.linalg.norm(np.diff(loop, axis=0), axis=1))]
        if distances[-1] <= 1e-9:
            continue
        count = min(max_points, max(64, len(loop)))
        samples = np.linspace(0, distances[-1], count)
        points = np.column_stack((np.interp(samples, distances, loop[:, 0]), np.interp(samples, distances, loop[:, 1])))
        # Orthogonal Newton correction removes polygonal resampling flux error.
        # There is no extrapolation: every iteration stays in the source grid.
        failed = False
        for _ in range(12):
            r, z = points[:, 0], points[:, 1]
            if np.any((r < field.r[0]) | (r > field.r[-1]) | (z < field.z[0]) | (z > field.z[-1])):
                failed = True
                break
            residual = (field.psi.ev(r, z) - field.psi_axis) / field.psi_span - level
            if np.max(np.abs(residual)) < 1e-9:
                break
            grad_r = field.psi.ev(r, z, dx=1) / field.psi_span
            grad_z = field.psi.ev(r, z, dy=1) / field.psi_span
            norm_sq = grad_r ** 2 + grad_z ** 2
            if np.any(norm_sq < 1e-12):
                failed = True
                break
            correction = residual[:, None] * np.column_stack((grad_r, grad_z)) / norm_sq[:, None]
            length = np.linalg.norm(correction, axis=1)
            correction *= np.minimum(1, .02 / np.maximum(length, 1e-30))[:, None]
            points -= correction
        if failed:
            continue
        points = points.round(6)
        points[-1] = points[0]
        drift = np.max(np.abs((field.psi.ev(points[:, 0], points[:, 1]) - field.psi_axis) / field.psi_span - level))
        if drift > 1e-4 or not all(_inside_or_on_polygon(float(r), float(z), boundary) for r, z in points):
            continue
        result.append({"psiN": level, "pointsRzM": points.reshape(-1).tolist(), "closed": True})
    return result
