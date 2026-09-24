"""Offline, axisymmetric, core-only magnetic field-line tracing.

This helper does not infer a COCOS convention, reconstruct missing frames, extend
F outside the core, or calculate engineering collision/connection lengths.
Callers must pass a source-audited flux unit and poloidal sign explicitly. The
EXL IMAS source audited in this task uses total Wb, Br=-psi_Z/(2*pi*R), and
Bz=+psi_R/(2*pi*R). Output cylindrical coordinates are [R metres, phi radians,
Z metres]; phi is unwrapped. Three.js uses [R*cos(phi), Z, -R*sin(phi)].

References (equations independently implemented, not copied source):
https://freegs.readthedocs.io/en/latest/_modules/freegs/equilibrium.html
https://freegs.readthedocs.io/en/latest/_modules/freegs/fieldtracer.html
Sauter & Medvedev, Comput. Phys. Commun. 184 (2013), COCOS conventions.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Literal

import numpy as np
from scipy.integrate import solve_ivp
from scipy.interpolate import PchipInterpolator, RectBivariateSpline
from scipy.optimize import brentq


ALGORITHM_ID = "axisymmetric-core-arclength-rk45-v1"
DEFAULT_SEED_PSI_N = (0.25, 0.5, 0.75, 0.90, 0.97)


class FieldDomainError(ValueError):
    """Invalid or outside the supported source/core domain; never extrapolate."""


class _IntegrationBudgetError(RuntimeError):
    pass


def _array(value, name: str, ndim: int) -> np.ndarray:
    result = np.asarray(value, dtype=np.float64)
    if result.ndim != ndim or not np.all(np.isfinite(result)):
        raise ValueError(f"{name}: expected finite {ndim}-dimensional array")
    return result


@dataclass(frozen=True)
class TraceSettings:
    max_length_m: float = 10.0
    max_toroidal_turns: float = 1.0
    output_points: int = 256
    max_step_m: float = 0.05
    rtol: float = 1e-7
    atol: float = 1e-9
    max_psi_n_drift: float = 1e-4
    max_steps: int = 2000
    max_evaluations: int = 30000

    def validate(self) -> None:
        for name in ("max_length_m", "max_toroidal_turns", "max_step_m", "rtol", "atol", "max_psi_n_drift"):
            value = getattr(self, name)
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name}: expected finite positive value")
        if not 2 <= self.output_points <= 512:
            raise ValueError("output_points: must be 2..512 per direction")
        if not 2 <= self.max_steps <= 100000 or not 7 <= self.max_evaluations <= 1000000:
            raise ValueError("invalid integration budget")


@dataclass
class TraceResult:
    accepted: bool
    termination: str
    direction: int
    seed_psi_n: float | None
    length_m: float
    max_psi_n_drift: float | None
    accepted_steps: int
    evaluations: int
    cylindrical_r_phi_z: np.ndarray

    def metadata(self) -> dict:
        return {
            "accepted": self.accepted,
            "termination": self.termination,
            "direction": self.direction,
            "seedPsiN": self.seed_psi_n,
            "displayArcLengthM": self.length_m,
            "maxPsiNDrift": self.max_psi_n_drift,
            "acceptedSteps": self.accepted_steps,
            "evaluations": self.evaluations,
            "pointCount": len(self.cylindrical_r_phi_z),
        }


class AxisymmetricCoreField:
    def __init__(
        self,
        r_m,
        z_m,
        psi_zr,
        psi_axis: float,
        psi_boundary: float,
        profile_psi_n,
        f_m_t,
        *,
        flux_unit: Literal["Wb", "Wb/rad"],
        poloidal_sign: Literal[-1, 1],
        core_boundary_rz=None,
    ) -> None:
        self.r = _array(r_m, "R", 1)
        self.z = _array(z_m, "Z", 1)
        psi = _array(psi_zr, "psi[Z,R]", 2)
        pn = _array(profile_psi_n, "profile psiN", 1)
        f = _array(f_m_t, "F", 1)
        if len(self.r) < 4 or len(self.z) < 4 or psi.shape != (len(self.z), len(self.r)):
            raise ValueError("psi must be [Z,R], with at least 4 points per increasing grid axis")
        if self.r[0] <= 0 or np.any(np.diff(self.r) <= 0) or np.any(np.diff(self.z) <= 0):
            raise ValueError("R/Z must strictly increase and R must remain positive")
        if not np.isfinite([psi_axis, psi_boundary]).all() or abs(psi_boundary - psi_axis) < 1e-10:
            raise ValueError("invalid axis/boundary flux span")
        if len(pn) < 2 or pn.shape != f.shape or np.any(np.diff(pn) <= 0):
            raise ValueError("F profile must have matching strictly increasing psiN coordinates")
        if abs(pn[0]) > 1e-8 or abs(pn[-1] - 1) > 1e-8:
            raise ValueError("F profile must cover the complete 0..1 core psiN domain")
        pn = pn.copy()
        pn[0], pn[-1] = 0.0, 1.0
        if flux_unit not in ("Wb", "Wb/rad") or poloidal_sign not in (-1, 1):
            raise ValueError("explicit source-audited flux unit and poloidal sign required")
        self.psi_axis = float(psi_axis)
        self.psi_span = float(psi_boundary - psi_axis)
        self.flux_unit = flux_unit
        self.poloidal_factor = poloidal_sign / (2 * math.pi if flux_unit == "Wb" else 1.0)
        self.psi = RectBivariateSpline(self.r, self.z, psi.T, kx=3, ky=3, s=0)
        self.f = PchipInterpolator(pn, f, extrapolate=False)
        self.core_boundary_rz = None
        if core_boundary_rz is not None:
            polygon = _array(core_boundary_rz, "core LCFS polygon [R,Z]", 2)
            if polygon.shape[1] != 2 or len(polygon) < 3:
                raise ValueError("core LCFS polygon needs at least three [R,Z] points")
            if np.array_equal(polygon[0], polygon[-1]):
                polygon = polygon[:-1]
            if len(polygon) < 3:
                raise ValueError("degenerate core LCFS polygon")
            self.core_boundary_rz = polygon
            self._px, self._py = polygon.T
            self._qx, self._qy = np.roll(polygon, -1, axis=0).T
            dz = self._qy - self._py
            self._boundary_dx_dz = (self._qx - self._px) / np.where(dz != 0, dz, 1)
            area2 = np.sum(self._px * self._qy - self._qx * self._py)
            if abs(area2) < 1e-10:
                raise ValueError("degenerate core LCFS polygon area")

    def inside_core_boundary(self, r: float, z: float) -> bool:
        """Source LCFS mask prevents psiN-equivalent private-flux regions.

        Real-source callers MUST supply the unpadded source LCFS. None is for
        analytic tests or callers with an independently bounded analytic domain.
        """
        if self.core_boundary_rz is None:
            return True
        crossing = ((self._py > z) != (self._qy > z)) & (r < self._px + (z - self._py) * self._boundary_dx_dz)
        return bool(np.count_nonzero(crossing) % 2)

    @classmethod
    def from_raw_psi_profile(cls, r_m, z_m, psi_zr, psi_axis, psi_boundary, profile_psi, f_m_t, **kwargs):
        raw = _array(profile_psi, "raw profile psi", 1)
        if not np.isfinite([psi_axis, psi_boundary]).all() or abs(psi_boundary - psi_axis) < 1e-10:
            raise ValueError("invalid axis/boundary flux span")
        pn = (raw - psi_axis) / (psi_boundary - psi_axis)
        f = _array(f_m_t, "F", 1)
        if np.all(np.diff(pn) < 0):
            pn, f = pn[::-1], f[::-1]
        return cls(r_m, z_m, psi_zr, psi_axis, psi_boundary, pn, f, **kwargs)

    def _check_grid(self, r: float, z: float) -> None:
        if not math.isfinite(r) or not math.isfinite(z) or not self.r[0] <= r <= self.r[-1] or not self.z[0] <= z <= self.z[-1]:
            raise FieldDomainError("outside-source-grid")

    def psi_n(self, r: float, z: float) -> float:
        self._check_grid(r, z)
        value = (float(self.psi.ev(r, z)) - self.psi_axis) / self.psi_span
        if not math.isfinite(value):
            raise FieldDomainError("nonfinite-flux")
        return value

    def components(self, r: float, z: float) -> tuple[float, float, float]:
        pn = self.psi_n(r, z)
        if not self.inside_core_boundary(r, z):
            raise FieldDomainError("outside-source-core-LCFS")
        if not 0.0 <= pn <= 1.0:
            raise FieldDomainError("outside-core-no-SOL-extension")
        br = -self.poloidal_factor * float(self.psi.ev(r, z, dy=1)) / r
        bz = self.poloidal_factor * float(self.psi.ev(r, z, dx=1)) / r
        bphi = float(self.f(pn)) / r
        if not np.isfinite([br, bphi, bz]).all() or math.hypot(br, bphi, bz) < 1e-10:
            raise FieldDomainError("nonfinite-or-vanishing-field")
        return br, bphi, bz

    def outboard_seed(self, r_axis_m: float, z_axis_m: float, psi_n: float, phi_rad: float = 5 * math.pi / 3) -> np.ndarray:
        if not 0 < psi_n < 1 or not math.isfinite(phi_rad):
            raise ValueError("seed psiN must be strictly inside 0..1 and phi finite")
        axis_value = self.psi_n(r_axis_m, z_axis_m)
        if abs(axis_value) > 0.05 or axis_value >= psi_n or not self.inside_core_boundary(r_axis_m, z_axis_m):
            raise FieldDomainError("source-magnetic-axis-not-consistent-with-core")
        # The FIRST outward crossing ties the seed to the axis-connected core.
        # Stop searching at the first core boundary; never select a remote island.
        radii = np.linspace(r_axis_m, self.r[-1], max(257, len(self.r) * 4))
        values = (self.psi.ev(radii, np.full_like(radii, z_axis_m)) - self.psi_axis) / self.psi_span
        for index in range(1, len(radii)):
            left, right = values[index - 1] - psi_n, values[index] - psi_n
            if left <= 0 <= right:
                root = brentq(lambda r: self.psi_n(r, z_axis_m) - psi_n, radii[index - 1], radii[index], xtol=1e-12)
                if not self.inside_core_boundary(root, z_axis_m):
                    raise FieldDomainError("outboard-seed-outside-source-core-LCFS")
                return np.array([root, phi_rad, z_axis_m], dtype=np.float64)
            if values[index] > 1.0 or not self.inside_core_boundary(float(radii[index]), z_axis_m):
                break
        raise FieldDomainError("no-axis-connected-outboard-flux-crossing")


def trace_core_line(field: AxisymmetricCoreField, seed_r_phi_z, direction: Literal[-1, 1], settings: TraceSettings | None = None) -> TraceResult:
    settings = settings or TraceSettings()
    settings.validate()
    if direction not in (-1, 1):
        raise ValueError("direction must be +1 or -1 along B")
    seed = _array(seed_r_phi_z, "seed[R,phi,Z]", 1)
    if seed.shape != (3,):
        raise ValueError("seed must be [R,phi,Z]")
    calls = 0
    seed_pn: float | None = None

    def reject(reason: str, length: float = 0, drift: float | None = None, steps: int = 0) -> TraceResult:
        return TraceResult(False, reason, direction, seed_pn, length, drift, steps, calls, np.empty((0, 3)))

    try:
        seed_pn = field.psi_n(float(seed[0]), float(seed[2]))
        if not 0 < seed_pn < 1:
            return reject("seed-outside-open-core")
        field.components(float(seed[0]), float(seed[2]))
    except FieldDomainError as error:
        return reject(str(error))

    def rhs(_s, position):
        nonlocal calls
        calls += 1
        if calls > settings.max_evaluations:
            raise _IntegrationBudgetError("integration-evaluation-budget")
        r, _phi, z = position
        br, bp, bz = field.components(float(r), float(z))
        norm = math.hypot(br, bp, bz)
        return direction * np.array([br / norm, bp / (r * norm), bz / norm])

    def turns_event(_s, position):
        return settings.max_toroidal_turns * 2 * math.pi - abs(position[1] - seed[1])

    def drift_event(_s, position):
        return settings.max_psi_n_drift - abs(field.psi_n(float(position[0]), float(position[2])) - seed_pn)

    turns_event.terminal = True
    turns_event.direction = -1
    drift_event.terminal = True
    drift_event.direction = -1
    try:
        solution = solve_ivp(rhs, (0.0, settings.max_length_m), seed, method="RK45", rtol=settings.rtol, atol=settings.atol,
                             max_step=settings.max_step_m, dense_output=True, events=(turns_event, drift_event))
    except (FieldDomainError, _IntegrationBudgetError) as error:
        return reject(str(error))
    steps = len(solution.t) - 1
    end = float(solution.t[-1])
    if not solution.success:
        return reject("integrator-failed", end, steps=steps)
    if steps > settings.max_steps:
        return reject("integration-step-budget", end, steps=steps)
    if len(solution.t_events[1]):
        return reject("flux-drift-limit", end, settings.max_psi_n_drift, steps)
    positions = solution.sol(np.linspace(0, end, settings.output_points)).T
    # Check dense-output samples AND integration knots; rejected lines emit no vertices.
    check = np.concatenate((positions, solution.y.T), axis=0)
    try:
        drift = max(abs(field.psi_n(float(p[0]), float(p[2])) - seed_pn) for p in check)
        for p in check:
            field.components(float(p[0]), float(p[2]))
    except FieldDomainError as error:
        return reject(str(error), end, steps=steps)
    if not np.isfinite(positions).all() or drift > settings.max_psi_n_drift:
        return reject("flux-drift-limit", end, drift, steps)
    termination = "toroidal-turn-limit" if len(solution.t_events[0]) else "display-arclength-limit"
    return TraceResult(True, termination, direction, seed_pn, end, float(drift), steps, calls, positions)


def to_web_world(cylindrical_r_phi_z) -> np.ndarray:
    points = _array(cylindrical_r_phi_z, "cylindrical points", 2)
    if points.shape[1] != 3:
        raise ValueError("points must contain [R,phi,Z]")
    r, phi, z = points.T
    return np.column_stack((r * np.cos(phi), z, -r * np.sin(phi)))
