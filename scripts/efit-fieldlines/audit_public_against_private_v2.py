"""Read-only all-frame cross-check of derived v2 assets against original H5."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
for path in (HERE.parent / "exl50u-control-private-20260908/.tools", HERE / "python-deps"):
    if path.is_dir():
        sys.path.insert(0, str(path))
import h5py
import numpy as np
from scipy.interpolate import RectBivariateSpline
from antenna_midplane_flux import midplane_lcfs_intervals

P = "time_slice[]&profiles_2d[]&"
Q = "time_slice[]&profiles_1d&"
G = "time_slice[]&global_quantities&"
BOUNDARY = "time_slice[]&boundary&outline&"


def audit(directory: Path, source_paths):
    index = json.loads((directory / "index.json").read_text())
    report = {"status": "passed", "scope": "Every source frame, scalar, antenna flux sample, emitted core-contour vertex and 3D line vertex", "shots": []}
    for shot in index["shots"]:
        source_path = source_paths[shot["shot"]]
        with source_path.open("rb") as stream:
            assert hashlib.file_digest(stream, "sha256").hexdigest() == shot["sourceSha256"]
        max_profile_error = max_contour_drift = max_line_drift = max_coverage_error = 0.0
        outside_lcfs_samples = source_frames = line_vertices = contour_vertices = 0
        with h5py.File(source_path, "r") as h5:
            g = h5["equilibrium"]
            for chunk in shot["chunks"]:
                raw = gzip.decompress((directory / chunk["file"]).read_bytes())
                for text in raw.splitlines():
                    frame = json.loads(text)
                    k = frame["sourceIndex"]
                    assert abs(frame["timeMs"] / 1000 - g["time"][k]) < 1e-12
                    axis_psi, edge_psi = float(g[G + "psi_axis"][k]), float(g[G + "psi_boundary"][k])
                    pn = (g[Q + "psi"][k] - axis_psi) / (edge_psi - axis_psi)
                    source_q = g[Q + "q"][k]
                    expected_scalars = {"currentA": float(g[G + "ip"][k]), "rAxisM": float(g[G + "magnetic_axis&r"][k]),
                                        "zAxisM": float(g[G + "magnetic_axis&z"][k]), "bcentrT": float(g["vacuum_toroidal_field&b0"][k]),
                                        "psiAxisWb": axis_psi, "psiBoundaryWb": edge_psi,
                                        "q95": float(np.interp(.95, pn, source_q))}
                    assert frame["efitScalars"] == expected_scalars == shot["frames"][k]["efitScalars"]
                    r, z, psi = g[P + "grid&dim1"][k, 0], g[P + "grid&dim2"][k, 0], g[P + "psi"][k, 0]
                    spline = RectBivariateSpline(r, z, psi.T, kx=3, ky=3, s=0)
                    profile = frame["antennaMidplaneFlux"]
                    sample_r = profile["rStartM"] + np.arange(len(profile["psiWb"])) * profile["rStepM"]
                    expected_flux = spline.ev(sample_r, np.full_like(sample_r, profile["zM"]))
                    profile_error = float(np.max(np.abs(np.asarray(profile["psiWb"]) - expected_flux)))
                    assert profile_error <= 5.01e-11
                    max_profile_error = max(max_profile_error, profile_error)
                    boundary_n = int(g[BOUNDARY + "r_SHAPE"][k, 0])
                    boundary = np.column_stack((g[BOUNDARY + "r"][k, :boundary_n], g[BOUNDARY + "z"][k, :boundary_n]))
                    assert profile["lcfsIntervalsRM"] == midplane_lcfs_intervals(boundary)
                    inside = np.zeros(len(sample_r), dtype=bool)
                    for lo, hi in profile["lcfsIntervalsRM"]:
                        inside |= (sample_r >= lo) & (sample_r <= hi)
                    outside_lcfs_samples += int(np.count_nonzero(~inside))
                    # These source frames cover the entire requested antenna range;
                    # finite values outside LCFS must not be replaced with core values.
                    assert all(value is not None for value in profile["psiWb"])
                    for contour in frame["efitContours"]:
                        points = np.asarray(contour["pointsRzM"]).reshape(-1, 2)
                        contour_vertices += len(points)
                        if contour["psiN"] == 1:
                            expected = boundary.round(6)
                            if not np.array_equal(expected[0], expected[-1]):
                                expected = np.vstack((expected, expected[0]))
                            np.testing.assert_array_equal(points, expected)
                            continue
                        drift = float(np.max(abs((spline.ev(points[:, 0], points[:, 1]) - axis_psi) / (edge_psi - axis_psi) - contour["psiN"])))
                        assert drift <= 1e-4
                        max_contour_drift = max(max_contour_drift, drift)
                    for line in frame["lines"]:
                        points = np.asarray(line["points"]).reshape(-1, 3)
                        line_vertices += len(points)
                        drift = float(np.max(abs((spline.ev(points[:, 0], points[:, 2]) - axis_psi) / (edge_psi - axis_psi) - line["psiN"])))
                        assert drift <= 1e-4 and drift <= line["maxPsiNDrift"] + 1e-9
                        max_line_drift = max(max_line_drift, drift)
                        angle = np.unwrap(np.arctan2(points[:, 2] - expected_scalars["zAxisM"], points[:, 0] - expected_scalars["rAxisM"]))
                        coverage_error = abs(abs(angle[-1] - angle[0]) - 2 * np.pi)
                        assert coverage_error < 1e-4
                        max_coverage_error = max(max_coverage_error, float(coverage_error))
                        within_lcfs = np.zeros(len(points), dtype=bool)
                        for a, b in zip(boundary, np.roll(boundary, -1, axis=0)):
                            if a[1] == b[1]:
                                continue
                            within_lcfs ^= ((a[1] > points[:, 2]) != (b[1] > points[:, 2])) & (points[:, 0] < a[0] + (points[:, 2] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
                        assert np.all(within_lcfs)
                        expected_q = float(np.interp(line["psiN"], pn, source_q))
                        assert abs(line["sourceQ"] - expected_q) <= 5.01e-10
                        assert abs(line["qTrace"] - abs(expected_q)) <= max(.05, .05 * abs(expected_q)) + 1e-8
                    source_frames += 1
        report["shots"].append({"shot": shot["shot"], "frames": source_frames, "antennaSamples": source_frames * 501,
                                "outsideLcfsFluxSamplesRetained": outside_lcfs_samples,
                                "maxAntennaFluxRoundingErrorWb": max_profile_error,
                                "coreContourVertices": contour_vertices, "maxCoreContourPsiNDrift": max_contour_drift,
                                "lineVertices": line_vertices, "maxLinePsiNDrift": max_line_drift,
                                "maxActualPoloidalCoverageErrorRad": max_coverage_error})
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--source", action="append", required=True)
    args = parser.parse_args()
    sources = {int(spec.split("=", 1)[0]): Path(spec.split("=", 1)[1]) for spec in args.source}
    result = audit(args.directory, sources)
    (args.directory.parent / (args.directory.name + "-source-crosscheck.json")).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result), flush=True)
