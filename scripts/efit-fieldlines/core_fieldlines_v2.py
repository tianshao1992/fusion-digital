"""Core-only full-poloidal coverage, using poloidal-arclength parameterization.

The magnetic vector and its sign are unchanged from v1. V1 stopped after one
toroidal revolution, which is not one poloidal transit when |q|>1. V2 follows
each direction to pi accumulated geometric poloidal angle about the source
magnetic axis; joining the two gives one full poloidal transit. The full line
is generally NOT a closed 3D loop, and its ends must not be joined visually.

dR/dlp=Br/Bp, dZ/dlp=Bz/Bp, dphi/dlp=Bphi/(R*Bp). These are exactly the same
field-line ODE reparameterized by poloidal arclength. No q-profile approximation
is used to draw the curve. See the FreeGS safety-factor integral:
https://freegs.readthedocs.io/en/latest/_modules/freegs/critical.html#find_safety

Core-only, no SOL/F extrapolation, no CAD collision or engineering connection
length. Axisymmetric rotations of a completed line are valid distinct seeds in
the SAME axisymmetric model, not extra measured fields.
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import numpy as np
from scipy.integrate import solve_ivp
from core_fieldlines import AxisymmetricCoreField, FieldDomainError, _array

ALGORITHM_ID = "axisymmetric-core-full-poloid-rk45-v2"


@dataclass(frozen=True)
class PoloidalTraceSettings:
    target_poloidal_angle_rad: float = math.pi
    max_toroidal_turns: float = 32.0
    max_length_m: float = 300.0
    max_poloidal_length_m: float = 10.0
    max_step_poloidal_m: float = .01
    rtol: float = 1e-9
    atol: float = 1e-11
    max_psi_n_drift: float = 1e-4
    max_steps: int = 3000
    max_evaluations: int = 30000
    min_output_points: int = 256
    max_output_points: int = 2048
    max_delta_phi_rad: float = .12
    max_poloidal_chord_m: float = .02
    max_world_chord_m: float = .06
    coverage_tolerance_rad: float = 1e-6

    def validate(self):
        for name, value in vars(self).items():
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive")
        if self.target_poloidal_angle_rad > 2 * math.pi:
            raise ValueError("target exceeds one poloidal transit per direction")
        if not 16 <= self.min_output_points <= self.max_output_points <= 2048:
            raise ValueError("output point budget must be between 16 and 2048 per direction")


@dataclass
class PoloidalTraceResult:
    accepted: bool
    termination: str
    direction: int
    seed_psi_n: float | None
    length_m: float
    poloidal_length_m: float
    poloidal_span_rad: float
    toroidal_span_rad: float
    max_psi_n_drift: float | None
    accepted_steps: int
    evaluations: int
    cylindrical_r_phi_z: np.ndarray
    max_delta_phi_rad: float = 0.0
    max_world_chord_m: float = 0.0

    def metadata(self):
        return {
            "accepted": self.accepted, "termination": self.termination,
            "direction": self.direction, "seedPsiN": self.seed_psi_n,
            "displayArcLengthM": self.length_m, "poloidalArcLengthM": self.poloidal_length_m,
            "poloidalSpanRad": self.poloidal_span_rad, "toroidalSpanRad": self.toroidal_span_rad,
            "maxPsiNDrift": self.max_psi_n_drift, "acceptedSteps": self.accepted_steps,
            "evaluations": self.evaluations, "pointCount": len(self.cylindrical_r_phi_z),
            "maxDeltaPhiRad": self.max_delta_phi_rad, "maxWorldChordM": self.max_world_chord_m,
        }


def assess_q_consistency(minus: PoloidalTraceResult, plus: PoloidalTraceResult, source_q: float,
                         relative_tolerance: float = .05, absolute_tolerance: float = .05) -> dict:
    """Same-equilibrium internal consistency, NOT independent physical validation.

    q = absolute toroidal advance / one complete 2*pi poloidal transit. The
    stored source sign is retained, but comparing magnitudes does not validate
    field orientation or COCOS sign. The 5% threshold is a conservative numerical
    source-consistency gate, not an estimated measurement uncertainty. The 0.05
    absolute allowance avoids an ill-conditioned relative test near q=0.
    """
    if not np.isfinite([source_q, relative_tolerance, absolute_tolerance]).all() or relative_tolerance <= 0 or absolute_tolerance <= 0:
        raise ValueError("q comparison requires finite source and positive tolerances")
    result = {"accepted": False, "reason": "incomplete-poloidal-coverage", "sourceQ": float(source_q),
              "traceQ": None, "absoluteError": None, "allowedAbsoluteError": max(absolute_tolerance, relative_tolerance * abs(source_q)),
              "relativeError": None, "relativeTolerance": relative_tolerance, "absoluteTolerance": absolute_tolerance}
    if not minus.accepted or not plus.accepted or abs(minus.poloidal_span_rad + plus.poloidal_span_rad - 2 * math.pi) > 2e-6:
        return result
    trace_q = (minus.toroidal_span_rad + plus.toroidal_span_rad) / (2 * math.pi)
    if not math.isfinite(trace_q) or trace_q <= 0:
        result["reason"] = "nonfinite-or-zero-traced-q"
        return result
    error = abs(trace_q - abs(source_q))
    accepted = error <= result["allowedAbsoluteError"]
    result.update({"accepted": accepted, "reason": "source-q-consistent" if accepted else "source-q-inconsistent",
                   "traceQ": trace_q, "absoluteError": error,
                   "relativeError": error / abs(source_q) if abs(source_q) > 1e-12 else None})
    return result


def _world(points):
    r, phi, z = points.T
    return np.column_stack((r * np.cos(phi), z, -r * np.sin(phi)))


def trace_core_poloidal_line(field: AxisymmetricCoreField, seed_r_phi_z, direction: int, axis_rz,
                            settings: PoloidalTraceSettings | None = None) -> PoloidalTraceResult:
    settings = settings or PoloidalTraceSettings()
    settings.validate()
    if direction not in (-1, 1):
        raise ValueError("direction must be +1 or -1 along B")
    seed = _array(seed_r_phi_z, "seed[R,phi,Z]", 1)
    axis = _array(axis_rz, "axis[R,Z]", 1)
    if seed.shape != (3,) or axis.shape != (2,):
        raise ValueError("invalid seed or magnetic-axis shape")
    calls = 0
    pn = None

    def rejected(reason, solution=None, drift=None):
        end = solution.y[:, -1] if solution is not None else np.zeros(5)
        return PoloidalTraceResult(False, reason, direction, pn, float(end[4]),
                                   float(solution.t[-1]) if solution is not None else 0,
                                   abs(float(end[3])), abs(float(end[1] - seed[1])) if solution is not None else 0,
                                   drift, len(solution.t) - 1 if solution is not None else 0,
                                   calls, np.empty((0, 3)))

    try:
        pn = field.psi_n(float(seed[0]), float(seed[2]))
        if not 0 < pn < 1:
            return rejected("seed-outside-open-core")
        if not field.inside_core_boundary(float(axis[0]), float(axis[1])):
            return rejected("magnetic-axis-outside-core")
        field.components(float(seed[0]), float(seed[2]))
    except FieldDomainError as error:
        return rejected(str(error))

    def rhs(_lp, y):
        nonlocal calls
        calls += 1
        if calls > settings.max_evaluations:
            raise FieldDomainError("integration-evaluation-budget")
        r, _phi, z = y[:3]
        br, bphi, bz = field.components(float(r), float(z))
        bp = math.hypot(br, bz)
        if bp < 1e-9:
            raise FieldDomainError("vanishing-poloidal-field")
        dr, dz = direction * br / bp, direction * bz / bp
        rho_r, rho_z = r - axis[0], z - axis[1]
        rho2 = rho_r * rho_r + rho_z * rho_z
        if rho2 < 1e-10:
            raise FieldDomainError("poloidal-angle-singularity")
        return np.array([dr, direction * bphi / (r * bp), dz,
                         (rho_r * dz - rho_z * dr) / rho2, math.hypot(bp, bphi) / bp])

    def complete_event(_lp, y):
        return settings.target_poloidal_angle_rad - abs(y[3])
    def turns_event(_lp, y):
        return settings.max_toroidal_turns * 2 * math.pi - abs(y[1] - seed[1])
    def length_event(_lp, y):
        return settings.max_length_m - y[4]
    def drift_event(_lp, y):
        return settings.max_psi_n_drift - abs(field.psi_n(float(y[0]), float(y[2])) - pn)
    events = (complete_event, turns_event, length_event, drift_event)
    for event in events:
        event.terminal, event.direction = True, -1
    try:
        solution = solve_ivp(rhs, (0, settings.max_poloidal_length_m), np.r_[seed, 0.0, 0.0],
                             method="RK45", rtol=settings.rtol, atol=settings.atol,
                             max_step=settings.max_step_poloidal_m, dense_output=True, events=events)
    except FieldDomainError as error:
        return rejected(str(error))
    if not solution.success:
        return rejected("integrator-failed", solution)
    if len(solution.t) - 1 > settings.max_steps:
        return rejected("integration-step-budget", solution)
    if not len(solution.t_events[0]):
        reason = "incomplete-poloidal-length-budget"
        for index, name in ((1, "incomplete-toroidal-turn-budget"), (2, "incomplete-3d-length-budget"), (3, "flux-drift-limit")):
            if len(solution.t_events[index]):
                reason = name
        return rejected(reason, solution)

    # Oversample only the dense polynomial, not B evaluations. Distribute vertices
    # according to geometry and toroidal phase so HFS/high-q turns cannot alias.
    lp_dense = np.unique(np.r_[np.linspace(0, solution.t[-1], 4097), solution.t])
    dense = solution.sol(lp_dense).T
    points_dense = dense[:, :3]
    weights = np.maximum.reduce((
        np.abs(np.diff(points_dense[:, 1])) / settings.max_delta_phi_rad,
        np.linalg.norm(np.diff(points_dense[:, [0, 2]], axis=0), axis=1) / settings.max_poloidal_chord_m,
        np.linalg.norm(np.diff(_world(points_dense), axis=0), axis=1) / settings.max_world_chord_m,
    ))
    cumulative = np.r_[0, np.cumsum(weights)]
    if not np.isfinite(cumulative).all() or cumulative[-1] <= 0:
        return rejected("invalid-dense-curve", solution)
    # A 2% margin makes strict final-step checks robust to smooth local variation.
    npoints = max(settings.min_output_points, int(math.ceil(cumulative[-1] * 1.02)) + 1)
    if npoints > settings.max_output_points:
        return rejected("complete-curve-output-budget", solution)
    lp_output = np.interp(np.linspace(0, cumulative[-1], npoints), cumulative, lp_dense)
    output = solution.sol(lp_output).T
    points = output[:, :3]
    check = np.concatenate((dense, output), axis=0)
    try:
        r, z = check[:, 0], check[:, 2]
        if not np.isfinite(check).all() or np.any(r < field.r[0]) or np.any(r > field.r[-1]) or np.any(z < field.z[0]) or np.any(z > field.z[-1]):
            return rejected("outside-source-grid", solution)
        pns = (field.psi.ev(r, z) - field.psi_axis) / field.psi_span
        drift = float(np.max(np.abs(pns - pn)))
        if np.any(pns <= 0) or np.any(pns >= 1) or drift > settings.max_psi_n_drift:
            return rejected("flux-drift-limit", solution, drift)
        # Dense actual LCFS inclusion, not psiN-only inference.
        if field.core_boundary_rz is not None:
            inside = np.zeros(len(r), dtype=bool)
            for x0, z0, x1, z1 in zip(field._px, field._py, field._qx, field._qy):
                if z1 == z0:
                    continue
                inside ^= ((z0 > z) != (z1 > z)) & (r < x0 + (z - z0) * (x1 - x0) / (z1 - z0))
            if not np.all(inside):
                return rejected("outside-source-core-LCFS", solution, drift)
    except FieldDomainError as error:
        return rejected(str(error), solution)
    geometric_theta = np.unwrap(np.arctan2(check[:len(dense), 2] - axis[1], check[:len(dense), 0] - axis[0]))
    geometric_span = abs(float(geometric_theta[-1] - geometric_theta[0]))
    integrated_span = abs(float(output[-1, 3]))
    if abs(geometric_span - settings.target_poloidal_angle_rad) > settings.coverage_tolerance_rad or abs(integrated_span - geometric_span) > settings.coverage_tolerance_rad:
        return rejected("incomplete-geometric-poloidal-coverage", solution, drift)
    max_phi = float(np.max(np.abs(np.diff(points[:, 1]))))
    max_world = float(np.max(np.linalg.norm(np.diff(_world(points), axis=0), axis=1)))
    max_pol = float(np.max(np.linalg.norm(np.diff(points[:, [0, 2]], axis=0), axis=1)))
    if max_phi > settings.max_delta_phi_rad or max_world > settings.max_world_chord_m or max_pol > settings.max_poloidal_chord_m:
        return rejected("render-chord-budget", solution, drift)
    return PoloidalTraceResult(True, "poloidal-coverage-complete", direction, pn, float(output[-1, 4]),
                               float(solution.t[-1]), geometric_span, abs(float(output[-1, 1] - seed[1])),
                               drift, len(solution.t) - 1, calls, points, max_phi, max_world)
