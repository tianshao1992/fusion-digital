"""Device-agnostic derived EFIT topology graph and closed-surface extraction.

The graph has no USN/LSN-specific cardinality assumptions. Any accepted saddle is a node;
constant-flux arms become edges only when they terminate at another accepted saddle, the
versioned wall/limiter geometry, or a validated self-loop. Unresolved arms stay unresolved.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import contourpy
import numpy as np

from geqdsk import EquilibriumFrame


ALGORITHM_ID = "fusion.efit.topology-graph"
ALGORITHM_VERSION = "2.0.0"


@dataclass(frozen=True)
class GraphConfig:
    surface_levels: tuple[float, ...] = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)
    points_per_closed_loop: int = 128
    points_per_branch: int = 64
    max_loops_per_level: int = 8
    max_critical_points: int = 8
    critical_candidate_limit: int = 256
    x_search_psi_n_band: float = 0.05
    boundary_x_tolerance: float = 0.002
    near_boundary_x_tolerance: float = 0.02
    x_fit_rms_max: float = 0.01
    x_hessian_determinant_max: float = -1e-9
    x_root_max_grid_offset: float = 2.5
    boundary_lcfs_grid_diagonals: float = 2.0
    near_boundary_lcfs_grid_diagonals: float = 4.0
    minimum_abs_current_a: float = 50_000.0

    minimum_abs_psi_span_wb_per_rad: float = 0.005
    required_iconvr: int = 2
    trace_step_grid_fraction: float = 0.4
    trace_max_arc_m: float = 8.0
    trace_projection_tolerance: float = 2e-5
    output_path_psi_n_tolerance: float = 0.002
    x_capture_grid_diagonals: float = 1.5
    x_connection_psi_n_tolerance: float = 0.002

    def public_dict(self) -> dict[str, object]:
        return {
            "algorithmId": ALGORITHM_ID,
            "algorithmVersion": ALGORITHM_VERSION,
            "surfacePsiN": list(self.surface_levels),
            "pointsPerClosedLoop": self.points_per_closed_loop,
            "pointsPerBranch": self.points_per_branch,
            "limits": {
                "maxLoopsPerLevel": self.max_loops_per_level,
                "maxCriticalPoints": self.max_critical_points,
            },
            "gates": {
                "minimumAbsCurrentA": self.minimum_abs_current_a,
                "minimumAbsPsiSpanWbPerRad": self.minimum_abs_psi_span_wb_per_rad,
                "requiredIconvr": self.required_iconvr,
            },
            "criticalPointAcceptance": {
                "searchAbsPsiNMinusOneMax": self.x_search_psi_n_band,
                "boundaryAbsPsiNMinusOneMax": self.boundary_x_tolerance,
                "nearBoundaryAbsPsiNMinusOneMax": self.near_boundary_x_tolerance,
                "fit": "5x5 source-cell quadratic least squares",
                "fitRmsMax": self.x_fit_rms_max,
                "hessianDeterminantMaxInGridCoordinates": self.x_hessian_determinant_max,
                "rootMaxGridOffset": self.x_root_max_grid_offset,
                "boundaryLcfsDistanceMaxGridDiagonals": self.boundary_lcfs_grid_diagonals,
                "nearBoundaryLcfsDistanceMaxGridDiagonals": self.near_boundary_lcfs_grid_diagonals,
            },
            "topologySemantics": {
                "canonicalForm": "nodes and resolved constant-flux branch edges",
                "fixedSingleNullAssumption": False,
                "multiXPointReady": True,
                "secondaryNullReady": True,

                "unresolvedArmsAreNotExtrapolated": True,
                "activeBranchesRequireBoundaryRole": True,
                "nearBoundaryPointsAreMarkerEvidenceOnly": True,
                "outputPathPsiNResidualMax": self.output_path_psi_n_tolerance,
                "futureFamilies": ["X-point target", "Super-X", "snowflake", "multi-null"],
            },
        }


@dataclass(frozen=True)
class GeometryRevision:
    geometry_id: str
    revision: str
    sha256: str
    source_sha256: str
    source_point_count: int
    points: np.ndarray
    signed_area_m2: float

    def public_dict(self) -> dict[str, object]:
        return {
            "geometryId": self.geometry_id,
            "revision": self.revision,
            "sha256": self.sha256,
            "canonicalSha256F64LE": self.sha256,
            "sourceLimiterSha256F64LE": self.source_sha256,
            "kind": "axisymmetric-wall-limiter-rz-polyline",
            "closed": True,
            "sourcePointCount": self.source_point_count,
            "canonicalPointCount": len(self.points),
            "canonicalSegmentCount": len(self.points) - 1,
            "orientation": "counter-clockwise",
            "startPointRule": "lexicographic minimum (R,Z)",
            "closureRule": "last coordinate repeats the first coordinate",
            "segmentIndexBasis": "canonical coordinatesRzM[i] -> coordinatesRzM[i+1]",
            "sourceOrderPreserved": False,
            "canonicalization": "finite filter; consecutive duplicate removal; CCW orientation; lexicographic rotation; explicit closure",
            "coordinatesRzM": self.points.astype(float).reshape(-1).tolist(),
        }


@dataclass
class CriticalPoint:
    r_m: float
    z_m: float
    psi_n: float
    role: str
    gradient_residual: float
    fit_rms: float
    lcfs_distance_m: float
    hessian_physical: np.ndarray
    hessian_eigenvalues: tuple[float, float]
    activity_role: str = "secondary"


@dataclass

class FrameContext:
    frame: EquilibriumFrame
    geometry: GeometryRevision
    psi_n: np.ndarray
    r: np.ndarray
    z: np.ndarray
    gradient_r: np.ndarray
    gradient_z: np.ndarray
    grid_diagonal_m: float


def signed_area(points: np.ndarray) -> float:
    if len(points) < 3:
        return 0.0
    polygon = points[:-1] if np.linalg.norm(points[0] - points[-1]) < 1e-10 else points
    x, y = polygon[:, 0], polygon[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def canonicalize_geometry(points: np.ndarray) -> GeometryRevision:
    points = np.asarray(points, dtype=np.float64)
    source_point_count = len(points)
    source_canonical_bytes = points.astype("<f8", copy=False).tobytes(order="C")
    source_sha256 = hashlib.sha256(source_canonical_bytes).hexdigest()
    points = points[np.all(np.isfinite(points), axis=1)]
    if len(points) < 3:
        raise ValueError("wall/limiter geometry has fewer than three finite points")
    keep = np.ones(len(points), dtype=bool)
    keep[1:] = np.linalg.norm(np.diff(points, axis=0), axis=1) > 1e-10
    points = points[keep]
    while len(points) > 1 and np.linalg.norm(points[-1] - points[0]) <= 1e-10:
        points = points[:-1]
    if len(points) < 3:
        raise ValueError("wall/limiter geometry degenerates after duplicate removal")
    if signed_area(points) < 0:
        points = points[::-1]
    start = int(np.lexsort((points[:, 1], points[:, 0]))[0])
    points = np.roll(points, -start, axis=0)
    points = np.vstack((points, points[0]))
    if abs(signed_area(points)) <= 1e-10:
        raise ValueError("wall/limiter geometry has zero signed area")
    canonical = points.astype("<f8", copy=False)
    digest = hashlib.sha256(canonical.tobytes(order="C")).hexdigest()

    return GeometryRevision(
        geometry_id=f"wall-{digest[:20]}",
        revision=f"rz-polyline-sha256:{digest}",
        sha256=digest,
        source_sha256=source_sha256,
        source_point_count=source_point_count,
        points=canonical,
        signed_area_m2=signed_area(canonical),
    )


def point_in_polygon(point: np.ndarray | tuple[float, float], polygon: np.ndarray) -> bool:
    x, y = float(point[0]), float(point[1])
    px, py = polygon[:, 0], polygon[:, 1]
    inside = False
    j = len(polygon) - 1
    for index in range(len(polygon)):
        if ((py[index] > y) != (py[j] > y)) and x < (
            (px[j] - px[index]) * (y - py[index]) / (py[j] - py[index]) + px[index]
        ):
            inside = not inside
        j = index
    return inside


def point_to_polyline_distance(point: np.ndarray, polyline: np.ndarray) -> float:
    """Return exact Euclidean distance to the closest finite line segment."""
    starts = polyline[:-1]
    vectors = np.diff(polyline, axis=0)
    squared = np.einsum("ij,ij->i", vectors, vectors)
    valid = squared > 1e-20
    if not np.any(valid):
        return math.inf
    fractions = np.zeros(len(vectors), dtype=np.float64)
    fractions[valid] = np.einsum("ij,ij->i", point - starts[valid], vectors[valid]) / squared[valid]
    fractions = np.clip(fractions, 0.0, 1.0)
    projections = starts + fractions[:, None] * vectors
    return float(np.min(np.linalg.norm(projections[valid] - point, axis=1)))


def _resample(points: np.ndarray, count: int, closed: bool) -> np.ndarray | None:
    points = np.asarray(points, dtype=np.float64)

    points = points[np.all(np.isfinite(points), axis=1)]
    if len(points) < (3 if closed else 2):
        return None
    keep = np.ones(len(points), dtype=bool)
    keep[1:] = np.linalg.norm(np.diff(points, axis=0), axis=1) > 1e-10
    points = points[keep]
    if closed:
        if len(points) < 3:
            return None
        if np.linalg.norm(points[0] - points[-1]) > 1e-10:
            points = np.vstack((points, points[0]))
        else:
            points[-1] = points[0]
        if signed_area(points) < 0:
            core = points[:-1][::-1]
            points = np.vstack((core, core[0]))
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    total = float(np.sum(lengths))
    if not math.isfinite(total) or total <= 1e-9:
        return None
    cumulative = np.concatenate(([0.0], np.cumsum(lengths)))
    sample_at = np.linspace(0.0, total, count, endpoint=not closed)
    sampled = np.column_stack(
        (np.interp(sample_at, cumulative, points[:, 0]), np.interp(sample_at, cumulative, points[:, 1]))
    )
    if closed:
        max_r = float(np.max(sampled[:, 0]))
        candidates = np.flatnonzero(np.isclose(sampled[:, 0], max_r, atol=1e-7))
        start = int(candidates[np.argmin(sampled[candidates, 1])])
        sampled = np.roll(sampled, -start, axis=0)
    return sampled.astype("<f4")


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


def _bilinear(grid: np.ndarray, context: FrameContext, point: np.ndarray) -> float | None:
    r_position = (float(point[0]) - float(context.r[0])) / context.frame.delta_r
    z_position = (float(point[1]) - float(context.z[0])) / context.frame.delta_z
    r_index = math.floor(r_position)
    z_index = math.floor(z_position)
    if r_index < 0 or z_index < 0 or r_index >= len(context.r) - 1 or z_index >= len(context.z) - 1:
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


def build_context(frame: EquilibriumFrame, geometry: GeometryRevision) -> FrameContext:
    span = frame.psi_span
    if not math.isfinite(span) or abs(span) < 1e-12:
        raise ValueError("cannot normalize a zero/non-finite psi span")
    psi_n = (frame.psirz - frame.psi_axis) / span
    if not np.all(np.isfinite(psi_n)):
        raise ValueError("normalized psi contains non-finite values")
    r = frame.r_coordinates()
    z = frame.z_coordinates()
    gradient_z, gradient_r = np.gradient(psi_n, frame.delta_z, frame.delta_r, edge_order=2)
    return FrameContext(
        frame=frame,
        geometry=geometry,
        psi_n=psi_n,
        r=r,

        z=z,
        gradient_r=gradient_r,
        gradient_z=gradient_z,
        grid_diagonal_m=math.hypot(frame.delta_r, frame.delta_z),
    )


def derive_closed_flux_surfaces(
    context: FrameContext,
    config: GraphConfig,
) -> tuple[list[dict[str, object]], bool]:
    generator = contourpy.contour_generator(
        x=context.r,
        y=context.z,
        z=context.psi_n,
        line_type="Separate",
    )
    surfaces: list[dict[str, object]] = []
    truncated = False
    closure_tolerance = 2.5 * context.grid_diagonal_m
    for level in config.surface_levels:
        loops: list[tuple[bool, float, np.ndarray]] = []
        for line in generator.lines(level):
            if len(line) < 4 or np.linalg.norm(line[0] - line[-1]) > closure_tolerance:
                continue
            closed = np.vstack((line, line[0])) if np.linalg.norm(line[0] - line[-1]) > 1e-10 else line
            area = abs(signed_area(closed))
            if area <= 1e-8:
                continue
            sampled = _resample(closed, config.points_per_closed_loop, closed=True)
            if sampled is None:
                continue
            inside_fraction = sum(point_in_polygon(point, context.geometry.points) for point in sampled) / len(sampled)
            if inside_fraction < 0.98:
                continue
            contains_axis = point_in_polygon((context.frame.r_axis, context.frame.z_axis), closed)
            loops.append((contains_axis, area, sampled))
        loops.sort(key=lambda item: (not item[0], -item[1]))
        if len(loops) > config.max_loops_per_level:
            truncated = True

            loops = loops[: config.max_loops_per_level]
        for loop_index, (contains_axis, area, sampled) in enumerate(loops):
            surfaces.append(
                {
                    "surfaceId": f"psi-{level:.4f}-loop-{loop_index}",
                    "source": "derived-contour",
                    "psiN": level,
                    "closed": True,
                    "containsMagneticAxis": contains_axis,
                    "areaM2": area,
                    "pointsRzM": sampled.astype(float).reshape(-1).tolist(),
                    "evidence": {
                        "source": "derived-from-g-eqdsk-psirz",
                        "state": "derived",
                        "confidence": "bounded-derived",
                        "flags": ["CLOSED_CONTOUR", "INSIDE_CANONICAL_WALL"],
                    },
                }
            )
    lcfs = _resample(context.frame.lcfs, config.points_per_closed_loop, closed=True)
    if lcfs is not None:
        surfaces.append(
            {
                "surfaceId": "source-lcfs",
                "source": "g-eqdsk-boundary-polyline",
                "psiN": 1.0,
                "closed": True,
                "containsMagneticAxis": True,
                "areaM2": abs(signed_area(lcfs)),
                "pointsRzM": lcfs.astype(float).reshape(-1).tolist(),
                "evidence": {
                    "source": "g-eqdsk-boundary-polyline",
                    "state": "source-derived",
                    "confidence": "source-record",
                    "flags": ["RESAMPLED", "EXPLICITLY_CLOSED"],
                },
            }
        )
    return surfaces, truncated


def _critical_score(point: CriticalPoint) -> tuple[float, float, float, float, float]:
    return (
        abs(point.psi_n - 1.0),
        point.lcfs_distance_m,
        point.gradient_residual,
        point.fit_rms,
        point.r_m,
    )


def derive_critical_points(

    context: FrameContext,
    config: GraphConfig,
) -> tuple[list[CriticalPoint], bool]:
    if len(context.frame.lcfs) < 3:
        return [], False
    score = (context.gradient_r * context.frame.delta_r) ** 2 + (
        context.gradient_z * context.frame.delta_z
    ) ** 2
    search = np.abs(context.psi_n - 1.0) <= config.x_search_psi_n_band
    search[:2, :] = False
    search[-2:, :] = False
    search[:, :2] = False
    search[:, -2:] = False
    search &= np.isfinite(score)
    indices = np.argwhere(search)
    if len(indices) == 0:
        return [], False
    ranked = indices[np.argsort(score[search])[: config.critical_candidate_limit]]
    duplicate_tolerance = 1.5 * context.grid_diagonal_m
    points: list[CriticalPoint] = []

    for z_index, r_index in ranked:
        values = context.psi_n[z_index - 2 : z_index + 3, r_index - 2 : r_index + 3].reshape(-1)
        coefficients = _QUADRATIC_PINV @ values
        fit_rms = float(np.sqrt(np.mean((_QUADRATIC_DESIGN @ coefficients - values) ** 2)))
        if not math.isfinite(fit_rms) or fit_rms > config.x_fit_rms_max:
            continue
        hessian_grid = np.array(
            [[2.0 * coefficients[3], coefficients[4]], [coefficients[4], 2.0 * coefficients[5]]],
            dtype=np.float64,
        )
        determinant = float(np.linalg.det(hessian_grid))
        if not math.isfinite(determinant) or determinant >= config.x_hessian_determinant_max:
            continue
        try:
            root_offset = np.linalg.solve(hessian_grid, -coefficients[1:3])
        except np.linalg.LinAlgError:
            continue
        if not np.all(np.isfinite(root_offset)) or np.max(np.abs(root_offset)) > config.x_root_max_grid_offset:
            continue

        x_offset, y_offset = float(root_offset[0]), float(root_offset[1])
        psi_n = float(
            coefficients[0]
            + coefficients[1] * x_offset
            + coefficients[2] * y_offset
            + coefficients[3] * x_offset**2
            + coefficients[4] * x_offset * y_offset
            + coefficients[5] * y_offset**2
        )
        psi_distance = abs(psi_n - 1.0)
        if not math.isfinite(psi_n) or psi_distance > config.near_boundary_x_tolerance:
            continue
        r_m = float(context.r[r_index] + x_offset * context.frame.delta_r)
        z_m = float(context.z[z_index] + y_offset * context.frame.delta_z)
        root = np.array([r_m, z_m])
        if not point_in_polygon(root, context.geometry.points):
            continue
        lcfs = context.frame.lcfs
        if np.linalg.norm(lcfs[0] - lcfs[-1]) > 1e-10:
            lcfs = np.vstack((lcfs, lcfs[0]))
        lcfs_distance = point_to_polyline_distance(root, lcfs)
        role = "boundary" if psi_distance <= config.boundary_x_tolerance else "near-boundary"
        distance_limit = context.grid_diagonal_m * (
            config.boundary_lcfs_grid_diagonals
            if role == "boundary"
            else config.near_boundary_lcfs_grid_diagonals
        )
        if lcfs_distance > distance_limit:
            continue
        gradient_r = _bilinear(context.gradient_r, context, root)
        gradient_z = _bilinear(context.gradient_z, context, root)
        if gradient_r is None or gradient_z is None:
            continue
        gradient_residual = math.hypot(
            gradient_r * context.frame.delta_r,
            gradient_z * context.frame.delta_z,
        )
        scale = np.diag([1.0 / context.frame.delta_r, 1.0 / context.frame.delta_z])
        hessian_physical = scale @ hessian_grid @ scale
        eigenvalues = np.linalg.eigvalsh(hessian_physical)

        point = CriticalPoint(
            r_m=r_m,
            z_m=z_m,
            psi_n=psi_n,
            role=role,
            activity_role="secondary",
            gradient_residual=gradient_residual,
            fit_rms=fit_rms,
            lcfs_distance_m=lcfs_distance,
            hessian_physical=hessian_physical,
            hessian_eigenvalues=(float(eigenvalues[0]), float(eigenvalues[1])),
        )
        duplicate = next(
            (
                index
                for index, existing in enumerate(points)
                if math.hypot(r_m - existing.r_m, z_m - existing.z_m) < duplicate_tolerance
            ),
            None,
        )
        if duplicate is None:
            points.append(point)
        elif _critical_score(point) < _critical_score(points[duplicate]):
            points[duplicate] = point

    points.sort(key=_critical_score)
    truncated = len(points) > config.max_critical_points
    points = points[: config.max_critical_points]
    if points:
        min(points, key=_critical_score).activity_role = "primary"
    points.sort(key=lambda point: (point.r_m, point.z_m, point.psi_n))
    return points, truncated


def _cross(first: np.ndarray, second: np.ndarray) -> float:
    return float(first[0] * second[1] - first[1] * second[0])


def _segment_intersection(
    first_start: np.ndarray,
    first_end: np.ndarray,
    second_start: np.ndarray,
    second_end: np.ndarray,

) -> tuple[np.ndarray, float, float] | None:
    first_direction = first_end - first_start
    second_direction = second_end - second_start
    denominator = _cross(first_direction, second_direction)
    if abs(denominator) < 1e-12:
        return None
    displacement = second_start - first_start
    first_fraction = _cross(displacement, second_direction) / denominator
    second_fraction = _cross(displacement, first_direction) / denominator
    if -1e-9 <= first_fraction <= 1.0 + 1e-9 and -1e-9 <= second_fraction <= 1.0 + 1e-9:
        return first_start + first_fraction * first_direction, first_fraction, second_fraction
    return None


def _first_polyline_intersection(
    first_start: np.ndarray,
    first_end: np.ndarray,
    polyline: np.ndarray,
) -> tuple[np.ndarray, float, float, int] | None:
    """Vectorized exact intersection with the earliest polyline segment hit."""
    direction = first_end - first_start
    starts = polyline[:-1]
    segment_directions = np.diff(polyline, axis=0)
    denominators = direction[0] * segment_directions[:, 1] - direction[1] * segment_directions[:, 0]
    displacement = starts - first_start
    valid = np.abs(denominators) >= 1e-12
    trace_fraction = np.full(len(starts), np.inf, dtype=np.float64)
    wall_fraction = np.full(len(starts), np.inf, dtype=np.float64)
    trace_fraction[valid] = (
        displacement[valid, 0] * segment_directions[valid, 1]
        - displacement[valid, 1] * segment_directions[valid, 0]
    ) / denominators[valid]
    wall_fraction[valid] = (
        displacement[valid, 0] * direction[1] - displacement[valid, 1] * direction[0]
    ) / denominators[valid]
    valid &= (trace_fraction >= -1e-9) & (trace_fraction <= 1.0 + 1e-9)
    valid &= (wall_fraction >= -1e-9) & (wall_fraction <= 1.0 + 1e-9)
    indices = np.flatnonzero(valid)
    if len(indices) == 0:
        return None

    segment_index = int(indices[np.argmin(trace_fraction[indices])])
    fraction = float(trace_fraction[segment_index])
    return (
        first_start + fraction * direction,
        fraction,
        float(wall_fraction[segment_index]),
        segment_index,
    )


def _project(
    context: FrameContext,
    point: np.ndarray,
    level: float,
    correction_limit: float,
    iterations: int,
    tolerance: float,
) -> tuple[np.ndarray, float] | None:
    projected = point.astype(np.float64, copy=True)
    final_residual = math.inf
    for _ in range(iterations):
        value = _bilinear(context.psi_n, context, projected)
        derivative_r = _bilinear(context.gradient_r, context, projected)
        derivative_z = _bilinear(context.gradient_z, context, projected)
        if value is None or derivative_r is None or derivative_z is None:
            return None
        final_residual = abs(value - level)
        gradient = np.array([derivative_r, derivative_z], dtype=np.float64)
        gradient_squared = float(np.dot(gradient, gradient))
        if gradient_squared < 1e-12:
            return None
        correction = (value - level) * gradient / gradient_squared
        correction_norm = float(np.linalg.norm(correction))
        if correction_norm > correction_limit:
            correction *= correction_limit / correction_norm
        if final_residual <= tolerance:
            return projected, final_residual
        projected -= correction
    final_value = _bilinear(context.psi_n, context, projected)
    if final_value is None:
        return None
    final_residual = abs(final_value - level)
    return (projected, final_residual) if final_residual <= tolerance else None


def _validate_branch_points(
    context: FrameContext,
    points: np.ndarray,
    level: float,
    config: GraphConfig,
) -> float | None:
    """Fail closed when an emitted path leaves the source grid or its flux surface."""
    if not np.all(np.isfinite(points)):
        return None
    epsilon = 1e-6 * max(context.frame.delta_r, context.frame.delta_z)
    if (
        np.any(points[:, 0] < context.r[0] - epsilon)
        or np.any(points[:, 0] > context.r[-1] + epsilon)
        or np.any(points[:, 1] < context.z[0] - epsilon)
        or np.any(points[:, 1] > context.z[-1] + epsilon)
    ):
        return None
    residuals: list[float] = []
    for point in points:
        value = _bilinear(context.psi_n, context, point)
        if value is None:
            return None
        residuals.append(abs(value - level))
    maximum = max(residuals, default=math.inf)
    return maximum if maximum <= config.output_path_psi_n_tolerance else None

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


def _wall_lengths(wall: np.ndarray) -> tuple[np.ndarray, float]:
    segment_lengths = np.linalg.norm(np.diff(wall, axis=0), axis=1)
    cumulative = np.concatenate(([0.0], np.cumsum(segment_lengths)))
    return cumulative, float(cumulative[-1])


def _canonical_wall_arc_points(
    wall: np.ndarray,
    start_segment: int,
    start_fraction: float,
    end_segment: int,
    end_fraction: float,
) -> np.ndarray:
    """Walk forward in the published canonical wall sequence between two hits."""
    segment_count = len(wall) - 1
    start = wall[start_segment] + start_fraction * (wall[start_segment + 1] - wall[start_segment])
    end = wall[end_segment] + end_fraction * (wall[end_segment + 1] - wall[end_segment])
    points = [start]
    if start_segment == end_segment and end_fraction > start_fraction:
        points.append(end)
    else:
        points.append(wall[start_segment + 1])
        segment = (start_segment + 1) % segment_count
        while segment != end_segment:
            points.append(wall[segment + 1])
            segment = (segment + 1) % segment_count
        points.append(end)
    result = np.asarray(points, dtype=np.float64)
    keep = np.ones(len(result), dtype=bool)
    keep[1:] = np.linalg.norm(np.diff(result, axis=0), axis=1) > 1e-12
    return result[keep]


def _trace_arm(
    context: FrameContext,
    points: list[CriticalPoint],
    source_index: int,
    arm_index: int,
    direction: np.ndarray,
    config: GraphConfig,
) -> dict[str, object]:
    source = points[source_index]
    origin = np.array([source.r_m, source.z_m], dtype=np.float64)
    level = source.psi_n
    step = config.trace_step_grid_fraction * min(context.frame.delta_r, context.frame.delta_z)
    projected = _project(
        context,
        origin + step * direction,
        level,
        0.5 * step,
        10,
        config.trace_projection_tolerance,
    )
    if projected is None or np.dot(projected[0] - origin, direction) <= 0:

        return {"resolved": False, "reason": "initial-projection-failed", "armIndex": arm_index}
    current, residual = projected
    path = [origin, current.copy()]
    previous_direction = direction.copy()
    arc_length = float(np.linalg.norm(current - origin))
    max_residual = residual
    capture_radius = config.x_capture_grid_diagonals * context.grid_diagonal_m
    wall_cumulative, wall_total = _wall_lengths(context.geometry.points)
    max_steps = math.ceil(config.trace_max_arc_m / step) + 2

    for step_index in range(max_steps):
        derivative_r = _bilinear(context.gradient_r, context, current)
        derivative_z = _bilinear(context.gradient_z, context, current)
        if derivative_r is None or derivative_z is None:
            return {"resolved": False, "reason": "left-source-grid", "armIndex": arm_index}
        tangent = np.array([derivative_z, -derivative_r], dtype=np.float64)
        tangent_norm = float(np.linalg.norm(tangent))
        if tangent_norm < 1e-10:
            return {"resolved": False, "reason": "zero-contour-tangent", "armIndex": arm_index}
        tangent /= tangent_norm
        if np.dot(tangent, previous_direction) < 0:
            tangent = -tangent
        midpoint_projection = _project(
            context,
            current + 0.5 * step * tangent,
            level,
            0.3 * step,
            5,
            config.trace_projection_tolerance,
        )
        if midpoint_projection is None:
            return {"resolved": False, "reason": "midpoint-projection-failed", "armIndex": arm_index}
        midpoint = midpoint_projection[0]
        midpoint_r = _bilinear(context.gradient_r, context, midpoint)
        midpoint_z = _bilinear(context.gradient_z, context, midpoint)
        if midpoint_r is None or midpoint_z is None:
            return {"resolved": False, "reason": "midpoint-left-grid", "armIndex": arm_index}
        midpoint_tangent = np.array([midpoint_z, -midpoint_r], dtype=np.float64)
        midpoint_norm = float(np.linalg.norm(midpoint_tangent))
        if midpoint_norm < 1e-10:
            return {"resolved": False, "reason": "zero-midpoint-tangent", "armIndex": arm_index}
        midpoint_tangent /= midpoint_norm
        if np.dot(midpoint_tangent, previous_direction) < 0:
            midpoint_tangent = -midpoint_tangent
        next_projection = _project(
            context,
            current + step * midpoint_tangent,
            level,
            0.4 * step,
            7,
            config.trace_projection_tolerance,
        )
        if next_projection is None:
            return {"resolved": False, "reason": "step-projection-failed", "armIndex": arm_index}

        proposed, step_residual = next_projection
        max_residual = max(max_residual, step_residual)
        movement = proposed - current
        movement_length = float(np.linalg.norm(movement))
        if movement_length < 1e-9:
            return {"resolved": False, "reason": "trace-stalled", "armIndex": arm_index}

        first_hit = _first_polyline_intersection(current, proposed, context.geometry.points)
        if first_hit is not None:
            hit, _, wall_fraction, segment_index = first_hit
            path.append(hit)
            sampled = _resample(np.asarray(path), config.points_per_branch, closed=False)
            sampled_residual = (
                _validate_branch_points(context, sampled, level, config) if sampled is not None else None
            )
            if sampled is None or sampled_residual is None:
                return {"resolved": False, "reason": "wall-path-resample-failed", "armIndex": arm_index}
            max_residual = max(max_residual, sampled_residual)
            wall_s = (
                wall_cumulative[segment_index]
                + wall_fraction
                * np.linalg.norm(context.geometry.points[segment_index + 1] - context.geometry.points[segment_index])
            ) / wall_total
            return {
                "resolved": True,
                "armIndex": arm_index,
                "terminalKind": "wall-intersection",
                "wallSegment": segment_index,
                "wallSegmentFraction": wall_fraction,
                "wallSNormalized": float(wall_s),
                "terminalRzM": hit.astype(float).tolist(),
                "points": sampled,
                "arcLengthM": float(np.sum(np.linalg.norm(np.diff(sampled, axis=0), axis=1))),
                "maxPsiNResidual": max_residual,
            }

        if arc_length > 2.0 * context.grid_diagonal_m:
            nearest_target: tuple[float, int] | None = None
            for target_index, target in enumerate(points):
                if (
                    target_index == source_index
                    or target.role != "boundary"
                    or abs(target.psi_n - level) > config.x_connection_psi_n_tolerance
                ):
                    continue
                distance = math.hypot(proposed[0] - target.r_m, proposed[1] - target.z_m)
                if distance <= capture_radius and (nearest_target is None or distance < nearest_target[0]):
                    nearest_target = (distance, target_index)

            if nearest_target is not None:
                target_index = nearest_target[1]
                target = points[target_index]
                path.append(np.array([target.r_m, target.z_m]))
                sampled = _resample(np.asarray(path), config.points_per_branch, closed=False)
                sampled_residual = (
                    _validate_branch_points(context, sampled, level, config) if sampled is not None else None
                )
                if sampled is not None and sampled_residual is not None:
                    max_residual = max(max_residual, sampled_residual)
                    return {
                        "resolved": True,
                        "armIndex": arm_index,
                        "terminalKind": "critical-point",
                        "targetCriticalIndex": target_index,
                        "terminalRzM": [target.r_m, target.z_m],
                        "points": sampled,
                        "arcLengthM": float(np.sum(np.linalg.norm(np.diff(sampled, axis=0), axis=1))),
                        "maxPsiNResidual": max_residual,
                    }

        arc_length += movement_length
        if arc_length > config.trace_max_arc_m:
            return {"resolved": False, "reason": "maximum-arc-exceeded", "armIndex": arm_index}
        previous_direction = movement / movement_length
        current = proposed
        path.append(current.copy())
        if step_index > 20 and np.linalg.norm(current - origin) <= capture_radius:
            path.append(origin)
            sampled = _resample(np.asarray(path), config.points_per_branch, closed=False)
            sampled_residual = (
                _validate_branch_points(context, sampled, level, config) if sampled is not None else None
            )
            if sampled is not None and sampled_residual is not None:
                max_residual = max(max_residual, sampled_residual)
                return {
                    "resolved": True,
                    "armIndex": arm_index,
                    "terminalKind": "critical-point",
                    "targetCriticalIndex": source_index,
                    "terminalRzM": origin.astype(float).tolist(),
                    "points": sampled,
                    "arcLengthM": float(np.sum(np.linalg.norm(np.diff(sampled, axis=0), axis=1))),
                    "maxPsiNResidual": max_residual,
                }
    return {"resolved": False, "reason": "step-limit-exceeded", "armIndex": arm_index}

def derive_topology_graph(
    context: FrameContext,
    critical_points: list[CriticalPoint],
    frame_id: str,
    config: GraphConfig,
    closed_surfaces: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    axis_id = f"{frame_id}/node/magnetic-axis"
    nodes: list[dict[str, object]] = [
        {
            "nodeId": axis_id,
            "kind": "magnetic-axis",
            "rM": context.frame.r_axis,
            "zM": context.frame.z_axis,
        }
    ]
    x_ids: list[str] = []
    for index, point in enumerate(critical_points):
        node_id = f"{frame_id}/node/x/{index}"
        x_ids.append(node_id)
        nodes.append(
            {
                "nodeId": node_id,
                "kind": "x-point",
                "role": point.role,
                "activityRole": point.activity_role,
                "activeBranchEligible": point.role == "boundary",
                "evidenceOnly": point.role != "boundary",
                "evidence": {
                    "source": "derived-from-g-eqdsk-psirz",
                    "state": "active-derived" if point.role == "boundary" else "candidate-only",
                    "reason": (
                        "accepted saddle within active-boundary psiN and LCFS-distance gates"
                        if point.role == "boundary"
                        else "saddle is near the active boundary but outside the active psiN gate"
                    ),
                    "confidence": "bounded-derived" if point.role == "boundary" else "candidate",
                    "flags": [
                        "SADDLE_HESSIAN_ACCEPTED",
                        "LOCAL_QUADRATIC_FIT_ACCEPTED",
                        "LCFS_PROXIMITY_ACCEPTED",
                        *([] if point.role == "boundary" else ["NO_ACTIVE_BRANCHES"]),
                    ],
                },
                "rM": point.r_m,
                "zM": point.z_m,
                "psiN": point.psi_n,
                "absPsiNMinusOne": abs(point.psi_n - 1.0),
                "gradientResidual": point.gradient_residual,
                "fitRms": point.fit_rms,
                "lcfsDistanceM": point.lcfs_distance_m,
                "hessianEigenvaluesPerM2": list(point.hessian_eigenvalues),
                "positionUncertaintyM": context.frame.spatial_uncertainty_floor_m,
            }
        )

    traces: list[tuple[int, dict[str, object]]] = []
    unresolved: list[dict[str, object]] = []
    for source_index, point in enumerate(critical_points):
        if point.role != "boundary":
            continue
        directions = _separatrix_directions(point.hessian_physical)

        for arm_index, direction in enumerate(directions):
            result = _trace_arm(context, critical_points, source_index, arm_index, direction, config)
            if result.get("resolved"):
                traces.append((source_index, result))
            else:
                unresolved.append(
                    {
                        "unresolvedArmId": f"{frame_id}/unresolved-arm/{source_index}/{arm_index}",
                        "xPointNodeId": x_ids[source_index],
                        "armIndex": arm_index,
                        "state": "unresolved",
                        "reason": result.get("reason", "unknown"),
                        "extrapolated": False,
                    }
                )

    deduplicated: dict[tuple[object, ...], tuple[int, dict[str, object]]] = {}
    for source_index, result in traces:
        terminal_kind = result["terminalKind"]
        if terminal_kind == "wall-intersection":
            key = (
                "wall",
                source_index,
                int(result["wallSegment"]),
                round(float(result["wallSegmentFraction"]), 4),
            )
        else:
            target_index = int(result["targetCriticalIndex"])
            if target_index == source_index:
                points = result["points"]
                key = (
                    "self",
                    source_index,
                    round(float(np.min(points[:, 0])), 2),
                    round(float(np.max(points[:, 0])), 2),
                    round(float(np.min(points[:, 1])), 2),
                    round(float(np.max(points[:, 1])), 2),
                )
            else:
                key = ("x-x", *sorted((source_index, target_index)))
        existing = deduplicated.get(key)
        rank = (float(result["maxPsiNResidual"]), float(result["arcLengthM"]))
        if existing is None:

            deduplicated[key] = (source_index, result)
        else:
            existing_result = existing[1]
            existing_rank = (
                float(existing_result["maxPsiNResidual"]),
                float(existing_result["arcLengthM"]),
            )
            if rank < existing_rank:
                deduplicated[key] = (source_index, result)

    wall_node_by_key: dict[tuple[int, int], str] = {}
    wall_node_records: dict[str, dict[str, object]] = {}
    edges: list[dict[str, object]] = []
    ordered = sorted(
        deduplicated.values(),
        key=lambda item: (
            item[0],
            str(item[1]["terminalKind"]),
            int(item[1].get("targetCriticalIndex", -1)),
            int(item[1].get("wallSegment", -1)),
            float(item[1].get("wallSegmentFraction", -1.0)),
        ),
    )
    for edge_index, (source_index, result) in enumerate(ordered):
        terminal_kind = result["terminalKind"]
        if terminal_kind == "wall-intersection":
            segment = int(result["wallSegment"])
            fraction = float(result["wallSegmentFraction"])
            wall_key = (segment, round(fraction * 1_000_000))
            target_id = wall_node_by_key.get(wall_key)
            if target_id is None:
                target_id = f"{frame_id}/node/wall/{len(wall_node_by_key)}"
                wall_node_by_key[wall_key] = target_id
                terminal = result["terminalRzM"]
                wall_node = {
                        "nodeId": target_id,
                        "kind": "wall-intersection",
                        "geometryId": context.geometry.geometry_id,
                        "wallSegment": segment,
                        "wallSegmentFraction": fraction,

                        "wallSNormalized": float(result["wallSNormalized"]),
                        "rM": float(terminal[0]),
                        "zM": float(terminal[1]),
                        "positionUncertaintyM": context.frame.spatial_uncertainty_floor_m,
                    }
                nodes.append(wall_node)
                wall_node_records[target_id] = wall_node
        else:
            target_id = x_ids[int(result["targetCriticalIndex"])]
        sampled = result["points"]
        direct = float(np.linalg.norm(sampled[-1] - sampled[0]))
        arc = float(result["arcLengthM"])
        edges.append(
            {
                "edgeId": f"{frame_id}/edge/separatrix/{edge_index}",
                "kind": "constant-flux-separatrix-branch",
                "status": "active-derived",
                "sourceArmIndex": int(result["armIndex"]),
                "fromNodeId": x_ids[source_index],
                "toNodeId": target_id,
                "psiN": critical_points[source_index].psi_n,
                "closed": target_id == x_ids[source_index],
                "arcLengthM": arc,
                "directDistanceM": direct,
                "extensionRatio": arc / direct if direct > 1e-8 else None,
                "maxPsiNResidual": float(result["maxPsiNResidual"]),
                "pointsRzM": sampled.astype(float).reshape(-1).tolist(),
            }
        )

    wall_arcs: list[dict[str, object]] = []
    ordered_wall_nodes = sorted(
        wall_node_records.values(),
        key=lambda node: (float(node["wallSNormalized"]), str(node["nodeId"])),
    )
    if len(ordered_wall_nodes) >= 2:
        for arc_index, start_node in enumerate(ordered_wall_nodes):
            end_node = ordered_wall_nodes[(arc_index + 1) % len(ordered_wall_nodes)]
            points = _canonical_wall_arc_points(
                context.geometry.points,
                int(start_node["wallSegment"]),
                float(start_node["wallSegmentFraction"]),
                int(end_node["wallSegment"]),
                float(end_node["wallSegmentFraction"]),
            )
            arc_length = float(np.sum(np.linalg.norm(np.diff(points, axis=0), axis=1)))
            wall_arcs.append(
                {
                    "wallArcId": f"{frame_id}/wall-arc/{arc_index}",
                    "geometryId": context.geometry.geometry_id,
                    "fromNodeId": start_node["nodeId"],
                    "toNodeId": end_node["nodeId"],
                    "direction": "canonical-forward",
                    "wrapsCanonicalStart": float(end_node["wallSNormalized"]) <= float(start_node["wallSNormalized"]),
                    "startSNormalized": float(start_node["wallSNormalized"]),
                    "endSNormalized": float(end_node["wallSNormalized"]),
                    "arcLengthM": arc_length,
                    "pointsRzM": points.astype(float).reshape(-1).tolist(),
                }
            )

    regions = [
        {
            "regionId": f"{frame_id}/region/closed/{region_index}",
            "kind": "closed-flux-region",
            "state": "derived",
            "psiN": float(surface["psiN"]),
            "containsMagneticAxis": bool(surface["containsMagneticAxis"]),
            "areaM2": float(surface["areaM2"]),
            "boundary": [
                {
                    "order": 0,
                    "referenceKind": "closed-surface",
                    "referenceId": surface["surfaceId"],
                    "direction": "counter-clockwise",
                }
            ],
            "evidence": surface["evidence"],
        }
        for region_index, surface in enumerate(closed_surfaces or [])
    ]
    unresolved_regions = []
    if edges:
        unresolved_regions.append(
            {
                "unresolvedRegionId": f"{frame_id}/unresolved-region/open-field",
                "kind": "open-field-separatrix-region",
                "state": "unresolved",
                "reason": "branch/wall face-cycle classification is not yet scientifically reviewed",
                "edgeIds": [edge["edgeId"] for edge in edges],
                "wallArcIds": [arc["wallArcId"] for arc in wall_arcs],
                "fabricated": False,
            }
        )

    null_clusters = []
    for first in range(len(critical_points)):
        for second in range(first + 1, len(critical_points)):
            distance = math.hypot(
                critical_points[first].r_m - critical_points[second].r_m,
                critical_points[first].z_m - critical_points[second].z_m,
            )
            if distance <= 4.0 * context.grid_diagonal_m:
                null_clusters.append(
                    {
                        "nodeIds": [x_ids[first], x_ids[second]],
                        "distanceM": distance,
                        "deltaPsiN": abs(critical_points[first].psi_n - critical_points[second].psi_n),

                        "interpretation": "multi-null-cluster-candidate",
                    }
                )
    extended_edges = [
        edge["edgeId"]
        for edge in edges
        if edge["toNodeId"] in wall_node_by_key.values()
        and edge["extensionRatio"] is not None
        and float(edge["extensionRatio"]) >= 2.0
    ]
    return {
        "canonicalRepresentation": {
            "kind": "node-edge-region-topology-graph",
            "schemaVersion": "fusion.efit.topology-graph.v2",
            "coordinateSpace": "EFIT cylindrical R-Z plane in metres",
            "geometryId": context.geometry.geometry_id,
        },
        "nodes": nodes,
        "edges": edges,
        "wallArcs": wall_arcs,
        "regions": regions,
        "unresolvedArms": unresolved,
        "unresolvedRegions": unresolved_regions,
        "features": {
            "xPointCount": len(critical_points),
            "activeXPointCount": sum(point.role == "boundary" for point in critical_points),
            "candidateXPointCount": sum(point.role != "boundary" for point in critical_points),
            "boundaryXPointCount": sum(point.role == "boundary" for point in critical_points),
            "nearBoundaryXPointCount": sum(point.role == "near-boundary" for point in critical_points),
            "wallIntersectionCount": len(wall_node_by_key),
            "resolvedBranchCount": len(edges),
            "unresolvedArmCount": len(unresolved),
            "nullClusters": null_clusters,
            "extendedLegCandidateEdgeIds": extended_edges,
        },
    }


def _q_at_psi_n(qpsi: np.ndarray, psi_n: float) -> float | None:
    finite = np.isfinite(qpsi)
    if int(np.sum(finite)) < 2:
        return None
    value = float(np.interp(psi_n, np.linspace(0.0, 1.0, len(qpsi))[finite], qpsi[finite]))
    return value if math.isfinite(value) else None


def derive_frame(
    frame: EquilibriumFrame,
    geometry: GeometryRevision,
    shot_id: str,

    reconstruction_id: str,
    config: GraphConfig,
) -> dict[str, object]:
    frame_id = f"{reconstruction_id}/frame/{frame.time_ms:08d}ms"
    flags = ["SOURCE_PARSED"]
    if len(frame.limiter) < 3:
        flags.append("WALL_GEOMETRY_MISSING")
    if len(frame.lcfs) < 3:
        flags.append("LCFS_MISSING")
    if abs(frame.current) < config.minimum_abs_current_a:
        flags.append("LOW_ABS_CURRENT")
    if not math.isfinite(frame.psi_span) or abs(frame.psi_span) < config.minimum_abs_psi_span_wb_per_rad:
        flags.append("SMALL_PSI_SPAN")
    if frame.iconvr != config.required_iconvr:
        flags.append("EFIT_NOT_CONVERGED")
    gate_flags = {
        "WALL_GEOMETRY_MISSING",
        "LCFS_MISSING",
        "LOW_ABS_CURRENT",
        "SMALL_PSI_SPAN",
        "EFIT_NOT_CONVERGED",
    }
    gated = bool(gate_flags.intersection(flags))
    surfaces: list[dict[str, object]] = []
    graph: dict[str, object] = {
        "canonicalRepresentation": {
            "kind": "node-edge-region-topology-graph",
            "schemaVersion": "fusion.efit.topology-graph.v2",
            "coordinateSpace": "EFIT cylindrical R-Z plane in metres",
            "geometryId": geometry.geometry_id,
        },
        "nodes": [],
        "edges": [],
        "wallArcs": [],
        "regions": [],
        "unresolvedArms": [],
        "unresolvedRegions": [],
        "features": {
            "xPointCount": 0,
            "activeXPointCount": 0,
            "candidateXPointCount": 0,
            "boundaryXPointCount": 0,
            "nearBoundaryXPointCount": 0,
            "wallIntersectionCount": 0,
            "resolvedBranchCount": 0,
            "unresolvedArmCount": 0,
            "nullClusters": [],
            "extendedLegCandidateEdgeIds": [],
        },
    }

    if not gated:
        context = build_context(frame, geometry)
        surfaces, surfaces_truncated = derive_closed_flux_surfaces(context, config)
        if surfaces_truncated:
            flags.append("CLOSED_SURFACE_TRUNCATED")
        missing_levels = [
            level
            for level in config.surface_levels
            if not any(
                surface["source"] == "derived-contour"
                and math.isclose(float(surface["psiN"]), level)
                and surface["containsMagneticAxis"]
                for surface in surfaces
            )
        ]
        if missing_levels:
            flags.append("CLOSED_SURFACE_LEVEL_INCOMPLETE")
        critical, critical_truncated = derive_critical_points(context, config)
        if critical_truncated:
            flags.append("CRITICAL_POINT_TRUNCATED")
        graph = derive_topology_graph(context, critical, frame_id, config, surfaces)
        if graph["features"]["unresolvedArmCount"]:
            flags.append("UNRESOLVED_SEPARATRIX_ARMS")
    severe_partial = {
        "CLOSED_SURFACE_TRUNCATED",
        "CRITICAL_POINT_TRUNCATED",
        "UNRESOLVED_SEPARATRIX_ARMS",
    }
    validity = "unavailable" if gated else "partial" if severe_partial.intersection(flags) else "usable"
    return {
        "frameId": frame_id,
        "shotId": shot_id,
        "reconstructionId": reconstruction_id,
        "timeMs": frame.time_ms,
        "geometryId": geometry.geometry_id,
        "quality": {
            "validity": validity,
            "flags": flags,
            "positionUncertaintyFloorM": frame.spatial_uncertainty_floor_m,
            "sourceGrid": {
                "nr": frame.nw,
                "nz": frame.nh,
                "rMinM": frame.rleft,
                "rMaxM": frame.rleft + frame.rdim,
                "zMinM": frame.zmid - frame.zdim / 2,
                "zMaxM": frame.zmid + frame.zdim / 2,
            },

            "algorithmVersion": ALGORITHM_VERSION,
        },
        "scalars": {
            "currentA": frame.current,
            "rAxisM": frame.r_axis,
            "zAxisM": frame.z_axis,
            "bcentrT": frame.bcentr,
            "psiAxisWbPerRad": frame.psi_axis,
            "psiBoundaryWbPerRad": frame.psi_boundary,
            "q95": _q_at_psi_n(frame.qpsi, 0.95),
            "efitError": frame.efit_error if math.isfinite(frame.efit_error) else None,
            "iconvr": frame.iconvr if frame.iconvr >= 0 else None,
        },
        "closedFluxSurfaces": surfaces,
        "topologyGraph": graph,
    }


def _contract_points(value: object, label: str) -> np.ndarray:
    array = np.asarray(value, dtype=np.float64)
    if array.ndim != 1 or len(array) < 4 or len(array) % 2 or not np.all(np.isfinite(array)):
        raise ValueError(f"{label}: invalid finite interleaved R/Z array")
    return array.reshape((-1, 2))


def _require_exact_keys(value: object, expected: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    if set(value) != expected:
        raise ValueError(f"{label} keys changed: {sorted(set(value) ^ expected)}")
    return value


def validate_derived_frame(record: dict[str, object], geometry: GeometryRevision) -> None:
    """Validate the bounded public frame contract before any byte is serialized."""
    required = {
        "frameId",
        "shotId",
        "reconstructionId",
        "timeMs",
        "geometryId",
        "quality",
        "scalars",
        "closedFluxSurfaces",
        "topologyGraph",
    }
    if set(record) != required:
        raise ValueError(f"frame contract keys changed: {sorted(set(record) ^ required)}")
    if record["geometryId"] != geometry.geometry_id:
        raise ValueError("frame geometryId does not match the validated geometry")
    quality = _require_exact_keys(
        record["quality"],
        {"validity", "flags", "positionUncertaintyFloorM", "sourceGrid", "algorithmVersion"},
        "frame quality",
    )
    if quality.get("validity") not in {"usable", "partial", "unavailable"}:
        raise ValueError("invalid frame quality contract")
    source_grid = _require_exact_keys(
        quality.get("sourceGrid"),
        {"nr", "nz", "rMinM", "rMaxM", "zMinM", "zMaxM"},
        "source-grid bounds",
    )
    _require_exact_keys(
        record["scalars"],
        {
            "currentA",
            "rAxisM",
            "zAxisM",
            "bcentrT",
            "psiAxisWbPerRad",
            "psiBoundaryWbPerRad",
            "q95",
            "efitError",
            "iconvr",
        },
        "frame scalars",
    )
    r_min = float(source_grid["rMinM"])
    r_max = float(source_grid["rMaxM"])
    z_min = float(source_grid["zMinM"])
    z_max = float(source_grid["zMaxM"])
    epsilon = 1e-7

    def check_bounds(points: np.ndarray, label: str) -> None:
        if (
            np.any(points[:, 0] < r_min - epsilon)
            or np.any(points[:, 0] > r_max + epsilon)
            or np.any(points[:, 1] < z_min - epsilon)
            or np.any(points[:, 1] > z_max + epsilon)
        ):
            raise ValueError(f"{label}: coordinates leave the source grid")

    surfaces = record["closedFluxSurfaces"]
    if not isinstance(surfaces, list):
        raise ValueError("closedFluxSurfaces must be an array")
    surface_ids: set[str] = set()
    for surface in surfaces:
        surface = _require_exact_keys(
            surface,
            {
                "surfaceId",
                "source",
                "psiN",
                "closed",
                "containsMagneticAxis",
                "areaM2",
                "pointsRzM",
                "evidence",
            },
            "closed surface",
        )
        _require_exact_keys(
            surface["evidence"],
            {"source", "state", "confidence", "flags"},
            "closed-surface evidence",
        )
        if not surface.get("closed"):
            raise ValueError("closed surface contract is malformed")
        surface_id = str(surface["surfaceId"])
        if surface_id in surface_ids:
            raise ValueError("duplicate closed surfaceId")
        surface_ids.add(surface_id)
        points = _contract_points(surface["pointsRzM"], f"surface {surface_id}")
        if len(points) != 128 or np.linalg.norm(points[0] - points[-1]) <= 1e-12:
            raise ValueError(
                "closed surface must contain 128 unique samples with an implicit last-to-first closing edge"
            )
        check_bounds(points, f"surface {surface_id}")

    graph = record["topologyGraph"]
    if not isinstance(graph, dict):
        raise ValueError("topologyGraph must be an object")
    expected_graph_keys = {
        "canonicalRepresentation",
        "nodes",
        "edges",
        "wallArcs",
        "regions",
        "unresolvedArms",
        "unresolvedRegions",
        "features",
    }
    if set(graph) != expected_graph_keys:
        raise ValueError(f"topology graph keys changed: {sorted(set(graph) ^ expected_graph_keys)}")
    canonical = _require_exact_keys(
        graph["canonicalRepresentation"],
        {"kind", "schemaVersion", "coordinateSpace", "geometryId"},
        "canonical representation",
    )
    if canonical.get("geometryId") != geometry.geometry_id:
        raise ValueError("topology graph canonical geometry mismatch")

    nodes = graph["nodes"]
    if not isinstance(nodes, list):
        raise ValueError("graph nodes must be an array")
    node_by_id: dict[str, dict[str, object]] = {}
    wall_cumulative, wall_total = _wall_lengths(geometry.points)
    for node in nodes:
        if not isinstance(node, dict):
            raise ValueError("graph node must be an object")
        if node.get("kind") == "x-point":
            _require_exact_keys(
                node,
                {
                    "nodeId",
                    "kind",
                    "role",
                    "activityRole",
                    "activeBranchEligible",
                    "evidenceOnly",
                    "evidence",
                    "rM",
                    "zM",
                    "psiN",
                    "absPsiNMinusOne",
                    "gradientResidual",
                    "fitRms",
                    "lcfsDistanceM",
                    "hessianEigenvaluesPerM2",
                    "positionUncertaintyM",
                },
                "X-point node",
            )
            _require_exact_keys(
                node["evidence"],
                {"source", "state", "reason", "confidence", "flags"},
                "X-point evidence",
            )
        elif node.get("kind") == "wall-intersection":
            _require_exact_keys(
                node,
                {
                    "nodeId",
                    "kind",
                    "geometryId",
                    "wallSegment",
                    "wallSegmentFraction",
                    "wallSNormalized",
                    "rM",
                    "zM",
                    "positionUncertaintyM",
                },
                "wall-intersection node",
            )
        elif node.get("kind") == "magnetic-axis":
            _require_exact_keys(node, {"nodeId", "kind", "rM", "zM"}, "magnetic-axis node")
        node_id = str(node["nodeId"])
        if node_id in node_by_id:
            raise ValueError("duplicate graph nodeId")
        node_by_id[node_id] = node
        point = np.asarray([[float(node["rM"]), float(node["zM"])]])
        check_bounds(point, f"node {node_id}")
        if node["kind"] == "x-point":
            if node.get("role") not in {"boundary", "near-boundary"}:
                raise ValueError("invalid X-point role")
            if node.get("activityRole") not in {"primary", "secondary"}:
                raise ValueError("invalid X-point activityRole")
            if bool(node.get("activeBranchEligible")) != (node.get("role") == "boundary"):
                raise ValueError("X-point active-branch eligibility mismatch")
            psi_n = float(node["psiN"])
            delta_psi_n = abs(psi_n - 1.0)
            if not math.isfinite(psi_n) or abs(float(node["absPsiNMinusOne"]) - delta_psi_n) > 1e-9:
                raise ValueError("X-point normalized-flux residual is inconsistent")
            role_limit = 0.002 if node["role"] == "boundary" else 0.02
            if delta_psi_n > role_limit + 1e-9:
                raise ValueError("X-point normalized flux exceeds its role gate")
            if node["role"] == "near-boundary" and delta_psi_n <= 0.002:
                raise ValueError("near-boundary X-point incorrectly passes the active boundary gate")
            if not math.isfinite(float(node["fitRms"])) or float(node["fitRms"]) > 0.01 + 1e-12:
                raise ValueError("X-point local fit exceeds the published gate")
            eigenvalues = np.asarray(node["hessianEigenvaluesPerM2"], dtype=np.float64)
            if eigenvalues.shape != (2,) or not np.all(np.isfinite(eigenvalues)) or eigenvalues[0] * eigenvalues[1] >= 0.0:
                raise ValueError("X-point Hessian is not a finite saddle")
            grid_diagonal = math.hypot(
                (r_max - r_min) / max(int(source_grid["nr"]) - 1, 1),
                (z_max - z_min) / max(int(source_grid["nz"]) - 1, 1),
            )
            lcfs_limit = (2.0 if node["role"] == "boundary" else 4.0) * grid_diagonal
            if not math.isfinite(float(node["lcfsDistanceM"])) or float(node["lcfsDistanceM"]) > lcfs_limit + 1e-7:
                raise ValueError("X-point LCFS distance exceeds its published role gate")
        elif node["kind"] == "wall-intersection":
            if node.get("geometryId") != geometry.geometry_id:
                raise ValueError("wall node geometry mismatch")
            segment = int(node["wallSegment"])
            fraction = float(node["wallSegmentFraction"])
            if not 0 <= segment < len(geometry.points) - 1 or not 0.0 <= fraction <= 1.0:
                raise ValueError("wall node canonical segment reference is invalid")
            expected = geometry.points[segment] + fraction * (
                geometry.points[segment + 1] - geometry.points[segment]
            )
            if float(np.linalg.norm(expected - point[0])) > 1e-6:
                raise ValueError("wall node does not project to its canonical segment")
            expected_s = (
                wall_cumulative[segment]
                + fraction * np.linalg.norm(geometry.points[segment + 1] - geometry.points[segment])
            ) / wall_total
            if abs(expected_s - float(node["wallSNormalized"])) > 1e-6:
                raise ValueError("wall node normalized arc coordinate is inconsistent")
        elif node["kind"] != "magnetic-axis":
            raise ValueError("unknown graph node kind")

    edge_ids: set[str] = set()
    for edge in graph["edges"]:
        edge = _require_exact_keys(
            edge,
            {
                "edgeId",
                "kind",
                "status",
                "sourceArmIndex",
                "fromNodeId",
                "toNodeId",
                "psiN",
                "closed",
                "arcLengthM",
                "directDistanceM",
                "extensionRatio",
                "maxPsiNResidual",
                "pointsRzM",
            },
            "separatrix edge",
        )
        edge_id = str(edge["edgeId"])
        if edge_id in edge_ids:
            raise ValueError("duplicate graph edgeId")
        edge_ids.add(edge_id)
        source = node_by_id.get(str(edge["fromNodeId"]))
        target = node_by_id.get(str(edge["toNodeId"]))
        if source is None or target is None:
            raise ValueError("graph edge references an unknown node")
        if source.get("kind") != "x-point" or source.get("role") != "boundary":
            raise ValueError("active branch originates from a non-boundary candidate")
        points = _contract_points(edge["pointsRzM"], f"edge {edge_id}")
        if len(points) != config_points_per_branch(record):
            raise ValueError("graph edge point count changed")
        check_bounds(points, f"edge {edge_id}")
        if np.linalg.norm(points[0] - [source["rM"], source["zM"]]) > 1e-4:
            raise ValueError("graph edge does not start at its source X-point")
        if np.linalg.norm(points[-1] - [target["rM"], target["zM"]]) > 1e-4:
            raise ValueError("graph edge does not end at its terminal node")
        if not math.isfinite(float(edge["maxPsiNResidual"])) or float(edge["maxPsiNResidual"]) > 0.002 + 1e-9:
            raise ValueError("graph edge exceeds the published normalized-flux residual gate")
        if abs(float(edge["psiN"]) - float(source["psiN"])) > 1e-9:
            raise ValueError("graph edge normalized flux differs from its source X-point")

    wall_arc_ids: set[str] = set()
    for arc in graph["wallArcs"]:
        arc = _require_exact_keys(
            arc,
            {
                "wallArcId",
                "geometryId",
                "fromNodeId",
                "toNodeId",
                "direction",
                "wrapsCanonicalStart",
                "startSNormalized",
                "endSNormalized",
                "arcLengthM",
                "pointsRzM",
            },
            "canonical wall arc",
        )
        arc_id = str(arc["wallArcId"])
        if arc_id in wall_arc_ids:
            raise ValueError("duplicate wallArcId")
        wall_arc_ids.add(arc_id)
        if arc.get("geometryId") != geometry.geometry_id or arc.get("direction") != "canonical-forward":
            raise ValueError("wall arc canonical geometry contract mismatch")
        source = node_by_id.get(str(arc["fromNodeId"]))
        target = node_by_id.get(str(arc["toNodeId"]))
        if source is None or target is None or source.get("kind") != "wall-intersection" or target.get("kind") != "wall-intersection":
            raise ValueError("wall arc endpoints must be wall-intersection nodes")
        points = _contract_points(arc["pointsRzM"], f"wall arc {arc_id}")
        check_bounds(points, f"wall arc {arc_id}")
        if np.linalg.norm(points[0] - [source["rM"], source["zM"]]) > 1e-6:
            raise ValueError("wall arc source does not match its node")
        if np.linalg.norm(points[-1] - [target["rM"], target["zM"]]) > 1e-6:
            raise ValueError("wall arc target does not match its node")

    region_ids: set[str] = set()
    for region in graph["regions"]:
        region = _require_exact_keys(
            region,
            {
                "regionId",
                "kind",
                "state",
                "psiN",
                "containsMagneticAxis",
                "areaM2",
                "boundary",
                "evidence",
            },
            "graph region",
        )
        _require_exact_keys(
            region["evidence"],
            {"source", "state", "confidence", "flags"},
            "region evidence",
        )
        region_id = str(region["regionId"])
        if region_id in region_ids:
            raise ValueError("duplicate regionId")
        region_ids.add(region_id)
        boundary = region.get("boundary")
        if not isinstance(boundary, list) or not boundary:
            raise ValueError("region requires an ordered boundary")
        if [int(item["order"]) for item in boundary] != list(range(len(boundary))):
            raise ValueError("region boundary order is not contiguous")
        for item in boundary:
            item = _require_exact_keys(
                item,
                {"order", "referenceKind", "referenceId", "direction"},
                "region boundary reference",
            )
            kind = item.get("referenceKind")
            reference = str(item.get("referenceId"))
            if kind == "closed-surface" and reference not in surface_ids:
                raise ValueError("region references an unknown closed surface")
            if kind == "branch-edge" and reference not in edge_ids:
                raise ValueError("region references an unknown branch edge")
            if kind == "wall-arc" and reference not in wall_arc_ids:
                raise ValueError("region references an unknown wall arc")

    for unresolved in graph["unresolvedArms"]:
        unresolved = _require_exact_keys(
            unresolved,
            {"unresolvedArmId", "xPointNodeId", "armIndex", "state", "reason", "extrapolated"},
            "unresolved arm",
        )
        if unresolved.get("extrapolated") is not False:
            raise ValueError("unresolved arms must never be extrapolated")
        if str(unresolved.get("xPointNodeId")) not in node_by_id:
            raise ValueError("unresolved arm references an unknown X-point")

    for unresolved in graph["unresolvedRegions"]:
        unresolved = _require_exact_keys(
            unresolved,
            {
                "unresolvedRegionId",
                "kind",
                "state",
                "reason",
                "edgeIds",
                "wallArcIds",
                "fabricated",
            },
            "unresolved region",
        )
        if unresolved["fabricated"] is not False:
            raise ValueError("unresolved regions must never be fabricated")
        if any(str(edge_id) not in edge_ids for edge_id in unresolved["edgeIds"]):
            raise ValueError("unresolved region references an unknown edge")
        if any(str(arc_id) not in wall_arc_ids for arc_id in unresolved["wallArcIds"]):
            raise ValueError("unresolved region references an unknown wall arc")

    features = _require_exact_keys(
        graph["features"],
        {
            "xPointCount",
            "activeXPointCount",
            "candidateXPointCount",
            "boundaryXPointCount",
            "nearBoundaryXPointCount",
            "wallIntersectionCount",
            "resolvedBranchCount",
            "unresolvedArmCount",
            "nullClusters",
            "extendedLegCandidateEdgeIds",
        },
        "graph features",
    )
    for cluster in features["nullClusters"]:
        cluster = _require_exact_keys(
            cluster,
            {"nodeIds", "distanceM", "deltaPsiN", "interpretation"},
            "null cluster",
        )
        if any(str(node_id) not in node_by_id for node_id in cluster["nodeIds"]):
            raise ValueError("null cluster references an unknown node")
    if any(str(edge_id) not in edge_ids for edge_id in features["extendedLegCandidateEdgeIds"]):
        raise ValueError("extended-leg candidate references an unknown edge")


def config_points_per_branch(record: dict[str, object]) -> int:
    """Current public v2 graph contract fixes branch resampling at 64 points."""
    del record
    return 64
