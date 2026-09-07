"""Archived simulation -> grey free-free emission -> CHERAB rays -> scalar closure.

No facility observations, atomic database, instrument calibration or solver
feedback are implied. The common Zeff and Gaunt factor are explicit assumptions.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import time

import numpy as np
from matplotlib.path import Path as Polygon
from scipy.interpolate import LinearNDInterpolator, RegularGridInterpolator
from raysect.optical import World, Ray, Point3D, Vector3D
from raysect.primitive import Box
from cherab.core.math import AxisymmetricMapper, Interpolate2DLinear
from cherab.tools.emitters import RadiationFunction

Z_EFF = 1.0  # Assumed fully ionised hydrogenic plasma, not inferred from the run.
GAUNT = 1.2
EV_TO_K = 11604.518121550082
FREE_FREE = 1.426e-40  # SI: W m^3 K^-1/2. Rybicki & Lightman, eq. 5.15b.
CHANNELS = 12
STEP_M = 0.0025


def sha(b):
    return hashlib.sha256(b).hexdigest()


def free_free(te_ev, ne):
    te_ev, ne = np.asarray(te_ev, dtype=np.float64), np.asarray(ne, dtype=np.float64)
    if np.any(~np.isfinite(te_ev)) or np.any(~np.isfinite(ne)) or np.any(te_ev <= 0) or np.any(ne <= 0):
        raise ValueError('Nonpositive or missing plasma input')
    return FREE_FREE * GAUNT * Z_EFF * ne**2 * np.sqrt(te_ev * EV_TO_K)


def coordinate_function(case):
    g = case['geometry']
    if g['kind'] == 'native-equilibrium':
        psi = RegularGridInterpolator((g['z'], g['r']), g['psi'], bounds_error=False, fill_value=np.nan)
        pn, rho = np.asarray(g['psiNorm']), np.asarray(g['rhoTorNorm'])
        if len(pn) != len(rho) or np.any(np.diff(pn) <= 0) or np.any(np.diff(rho) <= 0):
            raise ValueError('Invalid native coordinate map')

        def evaluate(points):
            normalized = (psi(points[:, ::-1]) - g['psiAxis']) / (g['psiBoundary'] - g['psiAxis'])
            return np.interp(normalized, pn, rho, left=np.nan, right=np.nan)
        return evaluate
    # The TORAX geometry projection is explicitly a reconstructed shape. Do not
    # manufacture psi or assign a COCOS convention to it.
    points = np.asarray([p for ring in g['rings'] for p in ring['points']])
    values = np.asarray([ring['rho'] for ring in g['rings'] for _ in ring['points']])
    points, unique = np.unique(points, axis=0, return_index=True)
    return LinearNDInterpolator(points, values[unique], fill_value=np.nan)


def make_grid(case, nr=129, nz=161):
    boundary = np.asarray(case['geometry']['boundary'])
    lower, upper = boundary.min(axis=0), boundary.max(axis=0)
    padding = (upper-lower)*0.04
    r = np.linspace(lower[0]-padding[0], upper[0]+padding[0], nr)
    z = np.linspace(lower[1]-padding[1], upper[1]+padding[1], nz)
    rr, zz = np.meshgrid(r, z)
    points = np.column_stack((rr.ravel(), zz.ravel()))
    inside = Polygon(boundary).contains_points(points)
    rho = np.full(len(points), np.nan)
    rho[inside] = coordinate_function(case)(points[inside])
    if np.any(~np.isfinite(rho[inside])) or np.any(rho[inside] < 0) or np.any(rho[inside] > 1):
        raise ValueError('Missing or out-of-range coordinate INSIDE LCFS')
    return r, z, rho.reshape(nz, nr), inside.reshape(nz, nr)


def emission(case, frame, grid):
    _, _, rho, inside = grid
    values = np.zeros_like(rho)
    # Zero outside LCFS is a declared no-SOL-emission boundary condition.
    # Missing values inside LCFS must fail, never become zeros.
    if case['rho'][0] != 0 or case['rho'][-1] != 1:
        raise ValueError('Incomplete radial profiles')
    te = np.interp(rho[inside], case['rho'], np.asarray(case['te'][frame], dtype=np.float64))
    ne = np.interp(rho[inside], case['rho'], np.asarray(case['ne'][frame], dtype=np.float64))
    values[inside] = free_free(te, ne)
    return values


def trace(r, z, values, heights, step=STEP_M):
    world = World()
    function = Interpolate2DLinear(r, z, np.ascontiguousarray(values.T), extrapolate=False)
    # A thin positive-R slab contains exactly the requested poloidal chords;
    # this avoids unintentionally integrating the opposite side of the torus.
    Box(Point3D(float(r[0]), -0.001, float(z[0])), Point3D(float(r[-1]), 0.001, float(z[-1])),
        parent=world, material=RadiationFunction(AxisymmetricMapper(function), step=step))
    output = []
    for height in heights:
        ray = Ray(origin=Point3D(float(r[-1]+0.01), 0, float(height)), direction=Vector3D(-1, 0, 0),
                  min_wavelength=400, max_wavelength=401, bins=1)
        # RadiationFunction distributes TOTAL supplied W/m3 across the dummy
        # band; this is bolometric radiance, not a 400--401 nm prediction.
        output.append(float(ray.trace(world).total()))
    return np.asarray(output)


def quadrature(r, z, values, heights):
    interp = RegularGridInterpolator((z, r), values)
    # At fixed z a bilinear field is piecewise linear in r. Trapezoids at every
    # grid knot integrate that interpolant exactly, independently of Raysect.
    return np.asarray([np.trapz(interp(np.column_stack((np.full(len(r), h), r))), r)/(4*math.pi) for h in heights])


def relative(a, b):
    return float(np.max(np.abs(a-b)/np.maximum(np.abs(b), np.max(np.abs(b))*1e-9)))


def infer_density(template, observed, sigma, training):
    template, observed, sigma = map(np.asarray, (template, observed, sigma))
    t, y, s = template[training], observed[training], sigma[training]
    amplitude = np.sum(t*y/s**2) / np.sum(t*t/s**2)
    if amplitude <= 0:
        raise ValueError('Unphysical fitted amplitude')
    # Temperature, geometry, Gaunt and Zeff are held fixed: epsilon ~ ne^2.
    return float(np.sqrt(amplitude))


def baseline_check():
    r, z = np.linspace(1, 2, 9), np.linspace(-1, 1, 9)
    measured = trace(r, z, np.ones((9, 9)), [0])[0]
    expected = 1/(4*math.pi)
    error = abs(measured/expected-1)
    if error > 1e-6:
        raise ValueError(f'Uniform slab / 4pi check failed: {error}')
    return {'name': 'uniform-slab-1-W-m3-1-m', 'expected': expected, 'actual': measured, 'relativeError': error}


def process_case(case, seed):
    grid = make_grid(case)
    r, z, rho, inside = grid
    boundary = np.asarray(case['geometry']['boundary'])
    heights = np.linspace(boundary[:, 1].min(), boundary[:, 1].max(), CHANNELS+2)[1:-1]
    channels = [{'id': f'LOS-{i+1:02d}', 'start': [float(r[-1]), float(h)], 'end': [float(r[0]), float(h)], 'fit': i % 2 == 0} for i, h in enumerate(heights)]
    training = np.arange(CHANNELS) % 2 == 0
    rng = np.random.default_rng(seed)
    frames = []
    worst = 0.0
    for index, timestamp in enumerate(case['time']):
        values = emission(case, index, grid)
        prediction = trace(r, z, values, heights)
        reference = quadrature(r, z, values, heights)
        error = relative(prediction, reference)
        worst = max(worst, error)
        if error > 0.001 or np.any(prediction <= 0):
            raise ValueError(f'CHERAB / quadrature mismatch: {error}')
        true_scale = 1.12
        sigma = 0.02 * reference * true_scale**2
        observation = reference * true_scale**2 + rng.normal(0, sigma)
        fitted = infer_density(prediction, observation, sigma, training)
        residual = (prediction*fitted**2-observation)/sigma
        frames.append({'time': timestamp, 'te': case['te'][index], 'ne': case['ne'][index],
                       'emission': np.round(values[::2, ::2], 6).ravel().tolist(),
                       'predicted': prediction.tolist(), 'observed': observation.tolist(), 'sigma': sigma.tolist(),
                       'densityFit': fitted, 'fitRmsSigma': float(np.sqrt(np.mean(residual[training]**2))),
                       'heldOutRmsSigma': float(np.sqrt(np.mean(residual[~training]**2))),
                       'quadratureRelativeError': error})
    final = emission(case, -1, grid)
    standard = trace(r, z, final, heights)
    fine_step = trace(r, z, final, heights, STEP_M/2)
    fine_grid = make_grid(case, 257, 321)
    reference_fine = quadrature(fine_grid[0], fine_grid[1], emission(case, -1, fine_grid), heights)
    grid_error = relative(standard, reference_fine)
    return {k: case[k] for k in ['id', 'name', 'device', 'engine', 'runId', 'source', 'rho', 'assumptions']} | {
        'geometry': {'kind': case['geometry']['kind'], 'boundary': case['geometry']['boundary'], 'axis': case['geometry']['axis'],
                     'r': r[::2].tolist(), 'z': z[::2].tolist(), 'mask': inside[::2, ::2].ravel().tolist(), 'channels': channels},
        'frames': frames,
        'verification': {'quadratureMaxRelativeError': worst, 'stepHalvingRelativeError': relative(standard, fine_step),
                         'gridRefinementRelativeError': grid_error, 'gridRefinementScope': 'final-frame-only-129x161-to-257x321',
                         'fieldGrid': [129, 161], 'displayGrid': [65, 81], 'stepM': STEP_M,
                         'independentDeviceValidation': False, 'sourceNumericalConvergence': 'not-established'}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    start = time.perf_counter()
    data = (args.root/'work/diagnostics/input.json').read_bytes()
    inputs = json.loads(data)
    assert inputs['schema'] == 'diagnostic-input.v1' and inputs['authority'] == 'simulated'
    versions = {p: importlib.metadata.version(p) for p in ['cherab', 'raysect', 'numpy', 'scipy', 'matplotlib']}
    baseline = baseline_check()
    print(json.dumps({'baseline': baseline, 'versions': versions}), flush=True)
    results = []
    for i, case in enumerate(inputs['cases']):
        result = process_case(case, 20260907+i)
        results.append(result)
        print(json.dumps({'case': result['id'], 'frames': len(result['frames']), 'verification': result['verification']}), flush=True)
    payload = {'schema': 'synthetic-diagnostic.v1', 'authority': 'synthetic', 'recordKind': 'diagnostic-run',
               'model': {'id': 'hydrogenic-grey-free-free.v1', 'formula': '1.426e-40 * gB * Zeff * ne^2 * sqrt(Te[eV] * 11604.51812155)',
                         'zeff': Z_EFF, 'gaunt': GAUNT, 'emissionUnit': 'W/m^3', 'signalUnit': 'W/m^2/sr',
                         'spectralScope': 'bolometric-grey-not-a-visible-band', 'atomicData': 'none',
                         'reference': 'Rybicki & Lightman, Radiative Processes in Astrophysics, eq. 5.15b'},
               'closure': {'kind': 'single-density-scale-fixed-Te-Zeff-geometry', 'injectedDensityScale': 1.12,
                           'noiseRelativeSigma': 0.02, 'seed': 20260907, 'observations': 'synthetic-reference-quadrature-plus-Gaussian-noise',
                           'validation': 'software-self-consistency-only', 'feedbackToPhysicsSolver': False},
               'provenance': {'inputSha256': sha(data), 'prepareSha256': inputs['prepareSha256'], 'workerSha256': sha(Path(__file__).read_bytes()),
                              'python': platform.python_version(), 'versions': versions},
               'verification': {'baseline': baseline, 'elapsedSeconds': time.perf_counter()-start}, 'cases': results}
    raw = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
    compressed = gzip.compress(raw, mtime=0)
    digest = sha(compressed)
    out = args.root/'public/data/simulations'/f'{digest}.json.gz'
    out.write_bytes(compressed)
    entry = {'path': f'/data/simulations/{digest}.json.gz', 'sha256': digest, 'bytes': len(compressed), 'rawSha256': sha(raw), 'rawBytes': len(raw),
             'cases': [{'id': c['id'], 'name': c['name'], 'device': c['device'], 'engine': c['engine'], 'runId': c['runId'],
                        'frames': len(c['frames']), 'geometryKind': c['geometry']['kind']} for c in results]}
    (args.root/'app/simulations/data/synthetic-diagnostics.json').write_text(json.dumps(entry, indent=2)+'\n')
    (args.root/'work/diagnostics/result.json').write_bytes(raw)
    print(json.dumps({'artifact': entry['path'], 'bytes': len(compressed), 'rawBytes': len(raw), 'seconds': payload['verification']['elapsedSeconds']}), flush=True)


if __name__ == '__main__':
    main()
