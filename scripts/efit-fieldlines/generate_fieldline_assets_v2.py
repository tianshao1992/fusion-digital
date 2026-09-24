"""Generate reviewed line-only playback assets from two audited IMAS files.

This is an offline exporter. It never publishes source grids, private paths, or
network addresses. Source hashes and the all-frame input audit are prerequisites.
No missing times, boundary extrapolation, SOL model, or collision result is made.

Usage: python generate_fieldline_assets.py --source 21066=/private/file.h5
       --source 21138=/private/file.h5 --audit imas-field-audit.json --output out
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

for _name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_name, "1")

HERE = Path(__file__).resolve().parent
for _path in (HERE.parent / "exl50u-control-private-20260908/.tools", HERE / "python-deps"):
    if _path.is_dir():
        sys.path.insert(0, str(_path))

import h5py
import numpy as np
from core_fieldlines import DEFAULT_SEED_PSI_N, AxisymmetricCoreField, FieldDomainError
from core_fieldlines_v2 import ALGORITHM_ID, PoloidalTraceSettings, trace_core_poloidal_line, assess_q_consistency
from antenna_midplane_flux import build_antenna_midplane_flux
from efit_core_contours import closed_core_contours

P = "time_slice[]&profiles_2d[]&"
Q = "time_slice[]&profiles_1d&"
G = "time_slice[]&global_quantities&"
BOUNDARY = "time_slice[]&boundary&outline&"
FILES: dict[str, h5py.File] = {}
SETTINGS = PoloidalTraceSettings()
CHUNK_FRAMES = 16


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def rounded(values):
    return np.asarray(values).round(6).reshape(-1).tolist()


def _checked_array(value, name):
    array = np.asarray(value, dtype=float)
    if not np.isfinite(array).all() or np.any(np.abs(array) > 1e30):
        raise FieldDomainError(f"invalid-{name}-values")
    return array


def _shape(group, name, source_index):
    return tuple(int(v) for v in group[name + "_SHAPE"][source_index].reshape(-1))


def make_frame(task):
    shot, path, index, source_index, time_ms = task
    if path not in FILES:
        FILES[path] = h5py.File(path, "r")
    g = FILES[path]["equilibrium"]
    frame = {"shot": shot, "index": index, "sourceIndex": source_index, "timeMs": time_ms,
             "state": "unavailable", "lines": [], "boundaryRz": [], "axisRz": [],
             "efitScalars": None, "efitContours": [], "antennaMidplaneFlux": None,
             "qValidation": {"relativeTolerance": .05, "absoluteTolerance": .05, "comparisons": []}}
    try:
        nr = _shape(g, P + "grid&dim1", source_index)
        nz = _shape(g, P + "grid&dim2", source_index)
        npsi = _shape(g, P + "psi", source_index)
        nf = _shape(g, Q + "f", source_index)
        n1 = _shape(g, Q + "psi", source_index)
        if len(nr) != 1 or len(nz) != 1 or npsi != (nz[0], nr[0]) or nf != n1 or len(nf) != 1:
            raise FieldDomainError("inconsistent-source-array-shapes")
        r = _checked_array(g[P + "grid&dim1"][source_index, 0, :nr[0]], "R")
        z = _checked_array(g[P + "grid&dim2"][source_index, 0, :nz[0]], "Z")
        psi = _checked_array(g[P + "psi"][source_index, 0, :nz[0], :nr[0]], "psi")
        profile_psi = _checked_array(g[Q + "psi"][source_index, :nf[0]], "profile-psi")
        profile_f = _checked_array(g[Q + "f"][source_index, :nf[0]], "F")
        if _shape(g, Q + "q", source_index) != nf:
            raise FieldDomainError("inconsistent-q-profile-shape")
        profile_q = _checked_array(g[Q + "q"][source_index, :nf[0]], "q")
        axis = _checked_array([g[G + "magnetic_axis&r"][source_index], g[G + "magnetic_axis&z"][source_index]], "axis")
        psi_axis, psi_edge = _checked_array([g[G + "psi_axis"][source_index], g[G + "psi_boundary"][source_index]], "flux-span")
        br_shape = _shape(g, BOUNDARY + "r", source_index)
        bz_shape = _shape(g, BOUNDARY + "z", source_index)
        if br_shape != bz_shape or len(br_shape) != 1 or not 3 <= br_shape[0] <= 4096:
            raise FieldDomainError("invalid-boundary-outline-shape")
        boundary = _checked_array(np.column_stack((g[BOUNDARY + "r"][source_index, :br_shape[0]],
                                                   g[BOUNDARY + "z"][source_index, :bz_shape[0]])), "boundary")
        frame["axisRz"], frame["boundaryRz"] = rounded(axis), rounded(boundary)
        field = AxisymmetricCoreField.from_raw_psi_profile(r, z, psi, psi_axis, psi_edge,
                                                           profile_psi, profile_f, flux_unit="Wb", poloidal_sign=1,
                                                           core_boundary_rz=boundary)
        # These measurements and source-derived 2D fields stay available even if
        # a separate 3D line integration fails its numerical acceptance criteria.
        current, bcentr = _checked_array([g[G + "ip"][source_index], g["vacuum_toroidal_field&b0"][source_index]], "current-field")
        source_pn = (profile_psi - psi_axis) / (psi_edge - psi_axis)
        frame["efitScalars"] = {"currentA": float(current), "rAxisM": float(axis[0]), "zAxisM": float(axis[1]),
                                "bcentrT": float(bcentr), "psiAxisWb": float(psi_axis),
                                "psiBoundaryWb": float(psi_edge), "q95": float(np.interp(.95, source_pn, profile_q))}
        frame["antennaMidplaneFlux"] = build_antenna_midplane_flux(field, boundary)
        frame["efitContours"] = closed_core_contours(field, axis, boundary)
        lcfs_points = boundary.round(6)
        if not np.array_equal(lcfs_points[0], lcfs_points[-1]):
            lcfs_points = np.vstack((lcfs_points, lcfs_points[0]))
        if len(lcfs_points) > 256:
            raise FieldDomainError("source-LCFS-outline-exceeds-display-budget")
        frame["efitContours"].append({"psiN": 1, "pointsRzM": lcfs_points.reshape(-1).tolist(), "closed": True})
        lines = []
        for pn in DEFAULT_SEED_PSI_N:
            seed = field.outboard_seed(float(axis[0]), float(axis[1]), pn, 5 * math.pi / 3)
            minus = trace_core_poloidal_line(field, seed, -1, axis, SETTINGS)
            plus = trace_core_poloidal_line(field, seed, 1, axis, SETTINGS)
            if not minus.accepted or not plus.accepted:
                failure = minus if not minus.accepted else plus
                raise FieldDomainError(f"psiN-{pn}:{failure.termination}")
            loop_closure_error = float(np.linalg.norm(minus.cylindrical_r_phi_z[-1, [0, 2]] - plus.cylindrical_r_phi_z[-1, [0, 2]]))
            if loop_closure_error > 1e-4:
                raise FieldDomainError(f"psiN-{pn}:poloidal-loop-not-closed")
            q_source = float(np.interp(pn, source_pn, profile_q))
            q_check = assess_q_consistency(minus, plus, q_source)
            frame["qValidation"]["comparisons"].append({"psiN": pn, **q_check})
            if not q_check["accepted"]:
                raise FieldDomainError(f"psiN-{pn}:{q_check['reason']}")
            # The shared seed is included once; points progress continuously along B.
            points = np.concatenate((minus.cylindrical_r_phi_z[::-1], plus.cylindrical_r_phi_z[1:]), axis=0).round(6)
            rounded_drift = max(abs(field.psi_n(float(p[0]), float(p[2])) - pn) for p in points)
            drift = max(rounded_drift, minus.max_psi_n_drift, plus.max_psi_n_drift)
            if not np.isfinite(points).all() or drift > SETTINGS.max_psi_n_drift:
                raise FieldDomainError(f"psiN-{pn}:rounded-flux-drift-limit")
            lines.append({"psiN": pn, "points": points.reshape(-1).tolist(), "maxPsiNDrift": round(drift, 10),
                          "termination": [minus.termination, plus.termination],
                          "arcLengthM": [round(minus.length_m, 8), round(plus.length_m, 8)],
                          "poloidalSpanRad": [round(minus.poloidal_span_rad, 9), round(plus.poloidal_span_rad, 9)],
                          "toroidalSpanRad": [round(minus.toroidal_span_rad, 9), round(plus.toroidal_span_rad, 9)],
                          "sourceQ": round(q_source, 9), "qTrace": round(q_check["traceQ"], 9),
                          "qRelativeDifference": round(q_check["relativeError"], 9),
                          "poloidalClosureErrorM": round(loop_closure_error, 10),
                          "seedIndex": len(minus.cylindrical_r_phi_z) - 1})
        frame["lines"] = lines
        frame["state"] = "valid"
    except (FieldDomainError, ValueError) as error:
        # Known numerical/input rejections remain explicit at their original timestamp.
        # Unexpected programming/IO errors deliberately abort the export instead.
        reason = str(error)
        if "/" in reason and "outside-core-no-SOL-extension" not in reason:
            reason = "invalid-source-or-field-domain"
        frame["reason"] = reason[:160]
        frame["lines"] = []
    return frame


def write_chunk(out: Path, shot: int, part: int, frames: list[dict]) -> dict:
    name = f"shot-{shot}-part-{part:03d}.jsonl.gz"
    raw = ("\n".join(dump(frame) for frame in frames) + "\n").encode("utf-8")
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    if len(raw) >= 16_000_000 or len(compressed) >= 8_000_000:
        raise ValueError("chunk exceeds browser asset budget")
    (out / name).write_bytes(compressed)
    return {"file": name, "firstIndex": frames[0]["index"], "frameCount": len(frames),
            "byteLength": len(compressed), "sha256": hashlib.sha256(compressed).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True, help="shot=/path/to/original.h5")
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--pilot", action="store_true", help="Trace first/near400ms/last frames only into a separate trial output")
    args = parser.parse_args()
    if not 1 <= args.workers <= 16:
        parser.error("workers must be 1..16")
    sources = [(int(spec.split("=", 1)[0]), Path(spec.split("=", 1)[1]).resolve()) for spec in args.source]
    if len(set(shot for shot, _ in sources)) != len(sources):
        parser.error("duplicate source shot")
    report = json.loads(args.audit.read_text(encoding="utf-8-sig"))
    audits = {entry["shot"]: entry for entry in report["shots"]}
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        parser.error("output must be empty; do not overwrite an earlier candidate")
    index = {"schemaVersion": "fusion.efit.fieldlines.v2", "model": "axisymmetric-equilibrium", "algorithmVersion": ALGORITHM_ID,
             "coordinates": "R-phi-Z:m-rad-m", "seedPsiN": list(DEFAULT_SEED_PSI_N), "phiDegrees": 300,
             "scope": "axisymmetric-core-only", "timePolicy": "original-source-times-no-interpolation",
             "fieldConvention": {"psiUnit": "Wb", "fUnit": "T.m", "formula": "Br=-dpsi/dZ/(2*pi*R);Bz=dpsi/dR/(2*pi*R);Bphi=F(psi)/R",
                                 "sourceLayout": "Z,R", "cocosId": None, "directionBasis": "source-coordinate-signs"},
             "displayLimits": {"maxArcLengthEachDirectionM": SETTINGS.max_length_m,
                               "maxToroidalTurnsEachDirection": SETTINGS.max_toroidal_turns,
                               "minPointsPerLine": 2 * SETTINGS.min_output_points - 1,
                               "maxPointsPerLine": 2 * SETTINGS.max_output_points - 1,
                               "poloidalCoverageEachDirectionRad": SETTINGS.target_poloidal_angle_rad,
                               "maxPsiNDrift": SETTINGS.max_psi_n_drift,
                               "maxQProfileRelativeDifference": .05,
                               "qProfileAbsoluteTolerance": .05,
                               "maxPoloidalClosureErrorM": 1e-4,
                               "maxDeltaPhiRad": SETTINGS.max_delta_phi_rad,
                               "maxWorldChordM": SETTINGS.max_world_chord_m},
             "limitations": ["No SOL or F extrapolation", "No CAD collisions or engineering connection lengths",
                             "Axisymmetric equilibrium, not 3D perturbations or RF fields",
                             "Source grid spacing approximately 15.625 mm R and 29.688 mm Z",
                             "Antenna movement changes relative geometry and evaluates source midplane flux; field traces remain shot-dependent",
                             "1 mm antenna sampling is interpolation of the centimetre-scale source grid, not measurement resolution",
                             "Core flux contours and antenna flux remain independent of 3D numerical line acceptance",
                             "A full poloidal transit is generally not a closed 3D line; never join its ends"],
             "antennaProfile": {"rStartM": 1.1, "rStepM": .001, "samples": 501, "zM": 0, "phiDegrees": 300,
                                "psiUnit": "Wb", "fieldSymmetry": "axisymmetric",
                                "outsideLcfs": "source-grid-psi-retained-with-region-label", "outsideGrid": "null"},
             "q95Source": "Signed linear interpolation of source profiles_1d.q at source-normalized psiN=0.95",
             "contourSource": "Five independently extracted source-psi spline contours; psiN=1 preserves the source LCFS outline",
             "generatorSha256": digest(Path(__file__)), "tracerSha256": digest(HERE / "core_fieldlines_v2.py"),
             "baseFieldSha256": digest(HERE / "core_fieldlines.py"),
             "antennaProfileSha256": digest(HERE / "antenna_midplane_flux.py"),
             "contourGeneratorSha256": digest(HERE / "efit_core_contours.py"), "shots": []}
    started = time.monotonic()
    metrics = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        for shot, path in sources:
            audit = audits.get(shot)
            source_hash = digest(path)
            if not audit or audit["source_sha256"] != source_hash or audit["frames_with_issues"] or not audit["strictly_increasing_time"]:
                raise ValueError(f"Shot {shot}: missing, failed, or source-mismatched all-frame audit")
            if any(audit["scalar_invalid_indices"].values()):
                raise ValueError(f"Shot {shot}: audit contains invalid scalar frames")
            with h5py.File(path, "r") as source:
                times = _checked_array(source["equilibrium/time"][:], "time")
            if len(times) != audit["frames"] or not np.all(np.diff(times) > 0):
                raise ValueError(f"Shot {shot}: source times no longer match audit")
            chosen = list(range(len(times)))
            if args.pilot:
                chosen = sorted(set([0, int(np.argmin(np.abs(times - 0.4))), len(times) - 1]))
            entry = {"shot": shot, "sourceSha256": source_hash, "sourceFrameCount": len(times),
                     "nominalStepMs": round(float(np.median(np.diff(times))) * 1000, 6),
                     "sourceGridSpacingM": [audit["grid"]["dr_m"]["median"], audit["grid"]["dz_m"]["median"]],
                     "gaps": [{"afterSourceIndex": gap["after_frame"], "fromMs": round(gap["before_s"] * 1000, 6),
                               "toMs": round(gap["after_s"] * 1000, 6), "gapMs": gap["gap_ms"]} for gap in audit["gaps"]],
                     "frames": [], "chunks": []}
            index["shots"].append(entry)
            tasks = [(shot, str(path), i, src, round(float(times[src]) * 1000, 6)) for i, src in enumerate(chosen)]
            chunk = []
            termination = Counter()
            failures = Counter()
            for frame in pool.map(make_frame, tasks, chunksize=2):
                max_drift = max((line["maxPsiNDrift"] for line in frame["lines"]), default=0.0)
                summary = {key: frame[key] for key in ("index", "sourceIndex", "timeMs", "state")}
                summary.update({"lineCount": len(frame["lines"]), "maxPsiNDrift": max_drift,
                                "efitScalars": frame["efitScalars"]})
                if "reason" in frame:
                    summary["reason"] = frame["reason"]
                    failures[frame["reason"]] += 1
                for line in frame["lines"]:
                    termination.update(line["termination"])
                entry["frames"].append(summary)
                chunk.append(frame)
                if len(chunk) == CHUNK_FRAMES or frame["index"] == len(tasks) - 1:
                    entry["chunks"].append(write_chunk(out, shot, len(entry["chunks"]), chunk))
                    chunk = []
                if (frame["index"] + 1) % 64 == 0 or frame["index"] == len(tasks) - 1:
                    print(dump({"shot": shot, "done": frame["index"] + 1, "total": len(tasks),
                                "unavailable": sum(failures.values()), "elapsedS": round(time.monotonic() - started, 1)}), flush=True)
            metrics.append({"shot": shot, "sourceFrames": len(times), "exportedFrames": len(entry["frames"]),
                            "validFrames": len(entry["frames"]) - sum(failures.values()), "failures": dict(failures),
                            "maxPsiNDrift": max(frame["maxPsiNDrift"] for frame in entry["frames"]),
                            "compressedBytes": sum(chunk["byteLength"] for chunk in entry["chunks"]),
                            "chunks": len(entry["chunks"]), "terminations": dict(termination)})
    (out / "index.json").write_text(dump(index) + "\n", encoding="utf-8")
    summary = {"pilot": args.pilot, "elapsedS": round(time.monotonic() - started, 3), "shots": metrics,
               "indexSha256": digest(out / "index.json")}
    (out.parent / (out.name + "-generation-report.json")).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(dump(summary), flush=True)


if __name__ == "__main__":
    main()
