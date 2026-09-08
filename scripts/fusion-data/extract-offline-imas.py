"""Read verified, private IMAS captures; emit ONLY allowlisted numerical signals.

Output is a staging file, not a public asset. publish-offline-imas.mjs supplies
canonical JavaScript hashes and merges the existing public snapshot unchanged.
No network access, interpolation, inferred controller targets or H5 copying.
"""
import argparse
import hashlib
import json
from pathlib import Path

import h5py
import numpy as np


SIGNALS = [
    # Units follow the IMAS SI dictionary; indices are zero-based, not coil numbers.
    ("plasma-current", "等离子体电流", "Plasma current", "#147d73", "magnetics", "IP", "A", "ip[]&data", 0),
    ("pf-c12-current", "C12 / CS 电流", "C12 / CS current", "#365fc2", "pf_active", "COIL.C12.CURRENT", "A", "coil[]&current&data", 12),
    ("tf-c00-current", "TF C00 电流", "TF C00 current", "#b55224", "tf", "COIL.C00.CURRENT", "A", "coil[]&current&data", 0),
    ("langmuir-emb000-jsat", "探针 EMB000 Jsat", "Probe EMB000 Jsat", "#8752b8", "langmuir_probes", "EMBEDDED.EMB000.J_SAT", "A/m^2", "embedded[]&j_i_saturation&data", 0),
    ("equilibrium-ip", "平衡重建电流", "Equilibrium current", "#147d73", "equilibrium", "GLOBAL_QUANTITIES.IP", "A", "time_slice[]&global_quantities&ip", None),
    ("magnetic-axis-r", "磁轴 R", "Magnetic axis R", "#365fc2", "equilibrium", "GLOBAL_QUANTITIES.MAGNETIC_AXIS.R", "m", "time_slice[]&global_quantities&magnetic_axis&r", None),
    ("magnetic-axis-z", "磁轴 Z", "Magnetic axis Z", "#b55224", "equilibrium", "GLOBAL_QUANTITIES.MAGNETIC_AXIS.Z", "m", "time_slice[]&global_quantities&magnetic_axis&z", None),
]

BOUNDARY_R = "time_slice[]&boundary&outline&r"
BOUNDARY_Z = "time_slice[]&boundary&outline&z"
SHAPE_SIGNALS = [
    ("boundary-rmax", "Rmax（边界派生）", "Rmax (boundary-derived)", "#c03131", "m", "max(R)"),
    ("boundary-rmin", "Rmin（边界派生）", "Rmin (boundary-derived)", "#2459c4", "m", "min(R)"),
    ("boundary-kappa", "κ（边界派生）", "Kappa (boundary-derived)", "#247b38", "1", "(max(Z)-min(Z))/(max(R)-min(R))"),
]


def boundary_parameters(r, z, r_shapes, z_shapes):
    """Geometric extrema of the stored outline, NOT real-time PCS feedback.

    Flattened IMAS arrays are padded. Only the per-frame *_SHAPE prefix is
    physical data. An incomplete/degenerate outline invalidates the entire
    frame; do not shrink it by dropping invalid vertices. No contour fitting.
    """
    if r.ndim != 2 or r.shape != z.shape or r_shapes.shape != (len(r), 1) or z_shapes.shape != r_shapes.shape:
        raise ValueError("Invalid boundary array dimensions")
    output = np.full((len(r), 3), np.nan)
    for i, (nr, nz) in enumerate(zip(r_shapes[:, 0], z_shapes[:, 0])):
        if not np.isfinite(nr) or not np.isfinite(nz) or nr != nz or nr != int(nr) or not 3 <= nr <= r.shape[1]:
            continue
        rr, zz = r[i, :int(nr)], z[i, :int(nr)]
        if not np.all(np.isfinite(rr)) or not np.all(np.isfinite(zz)) or np.any(rr <= 0) or np.any(zz <= -9e39):
            continue
        width, height = np.ptp(rr), np.ptp(zz)
        if width <= 0 or height <= 0:
            continue
        output[i] = (np.max(rr), np.min(rr), height / width)
    return output


def sample_indices(values, limit=800):
    """Uniform source indices plus every null boundary; never bridge missing data."""
    size = len(values)
    if size <= limit:
        return np.arange(size)
    finite = np.isfinite(values)
    boundaries = np.flatnonzero(finite[1:] != finite[:-1])
    mandatory = {0, size - 1, *boundaries.tolist(), *(boundaries + 1).tolist()}
    if len(mandatory) > limit:
        raise ValueError("Too many missing-data boundaries for the publication budget")
    budget = limit - len(mandatory)
    uniform = np.linspace(0, size - 1, budget + 2, dtype=int)[1:-1]
    return np.array(sorted(mandatory.union(uniform.tolist())))


def extract(root, shots):
    verified = json.loads((root / "verified-h5-manifest.json").read_text(encoding="utf-8"))
    results = []
    for pulse in shots:
        catalog = json.loads((root / str(pulse) / "datasets.json").read_text(encoding="utf-8"))
        records = []
        missing = []
        for ids in dict.fromkeys(spec[4] for spec in SIGNALS):
            candidates = [item for item in verified["downloads"] if item["shot"] == pulse and item["idsName"] == ids and item["occurrence"] == 0]
            if not candidates and ids == "equilibrium":
                missing.append(ids)
                continue
            if len(candidates) != 1:
                raise ValueError(f"Ambiguous or missing dataset: {pulse}/{ids}")
            entry = candidates[0]
            source = [item for item in catalog if item["id"] == entry["datasetId"]]
            if len(source) != 1 or source[0]["status"] != "valid" or source[0]["publish_state"] != "published" or not source[0]["is_recommended"]:
                raise ValueError(f"Dataset is not an approved recommendation: {entry['datasetId']}")
            path = (root / entry["path"]).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ValueError("Capture path escapes private root")
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != entry["sha256"] or path.stat().st_size != entry["bytes"]:
                raise ValueError(f"Capture integrity failed: {pulse}/{ids}")
            with h5py.File(path, "r") as handle:
                group = handle[ids]
                for sid, zh, en, color, _, logical, unit, field, index in [spec for spec in SIGNALS if spec[4] == ids]:
                    values = np.asarray(group[field][()] if index is None else group[field][index], dtype=float)
                    # Embedded probes can each have their own acquisition clock.
                    time_field = "embedded[]&time" if ids == "langmuir_probes" else "time"
                    times = np.asarray(group[time_field][index] if ids == "langmuir_probes" else group[time_field][()], dtype=float)
                    if values.ndim != 1 or times.shape != values.shape or len(times) < 2 or not np.all(np.isfinite(times)) or not np.all(np.diff(times) > 0):
                        raise ValueError(f"Invalid independent time base: {pulse}/{sid}")
                    # IMAS undefined real sentinel is -9e40. Keep it as a gap, not a measurement.
                    values[values <= -9e39] = np.nan
                    indices = sample_indices(values)
                    samples = [[float(times[i]), float(values[i]) if np.isfinite(values[i]) else None] for i in indices]
                    records.append({
                        "id": sid, "label": zh, "labelEn": en, "color": color,
                        "observationKind": "facility-record", "processingLevel": "unclassified",
                        "projection": "imas-h5-offline", "dataItem": ids, "path": logical, "unit": unit, "kind": "1d",
                        "dataset": {"id": entry["datasetId"], "idsName": ids, "occurrence": entry["occurrence"], "run": entry["run"], "recommended": True, "catalogueStatus": "valid", "publishState": "published", "hasAuthoritativeImasH5": True},
                        "origin": {"h5Sha256": digest, "field": field, "timeField": time_field, "channelIndex": index, "timeUnit": "s"},
                        "sampling": {"sourcePoints": len(values), "publishedPoints": len(samples), "requestedMaxPoints": 800, "method": "offline-index-subsample", "timeRange": [samples[0][0], samples[-1][0]], "samplePolicy": "nearest", "noInterpolation": True, "connectAcrossGaps": False, "missingValues": sum(v is None for _, v in samples), "sourceMissingValues": int(np.count_nonzero(~np.isfinite(values)))},
                        "quality": {"state": "unknown", "basis": "not-exported"}, "samples": samples,
                    })
                if ids == "equilibrium":
                    times = np.asarray(group["time"][()], dtype=float)
                    shape_values = boundary_parameters(
                        np.asarray(group[BOUNDARY_R][()], dtype=float), np.asarray(group[BOUNDARY_Z][()], dtype=float),
                        group[BOUNDARY_R + "_SHAPE"][()], group[BOUNDARY_Z + "_SHAPE"][()],
                    )
                    if len(shape_values) != len(times):
                        raise ValueError("Boundary and equilibrium time lengths differ")
                    for column, (sid, zh, en, color, unit, formula) in enumerate(SHAPE_SIGNALS):
                        values = shape_values[:, column]
                        indices = sample_indices(values)
                        samples = [[float(times[i]), float(values[i]) if np.isfinite(values[i]) else None] for i in indices]
                        records.append({
                            "id": sid, "label": zh, "labelEn": en, "color": color,
                            "observationKind": "facility-record", "processingLevel": "boundary-derived",
                            "projection": "imas-h5-offline", "dataItem": ids, "path": "DERIVED.BOUNDARY." + sid.removeprefix("boundary-").upper(), "unit": unit, "kind": "1d",
                            "dataset": {"id": entry["datasetId"], "idsName": ids, "occurrence": entry["occurrence"], "run": entry["run"], "recommended": True, "catalogueStatus": "valid", "publishState": "published", "hasAuthoritativeImasH5": True},
                            "origin": {"h5Sha256": digest, "field": BOUNDARY_R, "timeField": "time", "channelIndex": None, "timeUnit": "s"},
                            "derivation": {"method": "boundary-extents-v1", "formula": formula, "fields": [BOUNDARY_R, BOUNDARY_Z, BOUNDARY_R + "_SHAPE", BOUNDARY_Z + "_SHAPE"], "notControllerTelemetry": True, "invalidOutlinePolicy": "whole-frame-null"},
                            "sampling": {"sourcePoints": len(values), "publishedPoints": len(samples), "requestedMaxPoints": 800, "method": "offline-index-subsample", "timeRange": [samples[0][0], samples[-1][0]], "samplePolicy": "nearest", "noInterpolation": True, "connectAcrossGaps": False, "missingValues": sum(v is None for _, v in samples), "sourceMissingValues": int(np.count_nonzero(~np.isfinite(values)))},
                            "quality": {"state": "unknown", "basis": "not-exported"}, "samples": samples,
                        })
        results.append({"pulse": pulse, "campaignDate": "2026-09-07" if pulse <= 21085 else "2026-09-08", "missingDataItems": missing, "signals": records})
        print(f"#{pulse}: {len(records)} signals; missing: {','.join(missing) or 'none'}", flush=True)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture-root", type=Path, required=True)
    parser.add_argument("--shots", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pulses = sorted({int(value) for value in args.shots.split(",")})
    data = extract(args.capture_root, pulses)
    args.output.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding="utf-8")
