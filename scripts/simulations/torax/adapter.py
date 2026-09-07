"""Pinned TORAX adapter. Trusted recipe code; no user-supplied module or command."""
import argparse
import copy
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from supervisor import supervise, write_json

COMMIT = '4aea2377385ba4dfe37b0ef4396374162af1314b'
EXAMPLES = {
    'basic': 'basic_config.py', 'iter-hybrid': 'iterhybrid_predictor_corrector.py',
    'iter-rampup': 'iterhybrid_rampup.py', 'step-flat-top': 'step_flattop_bgb.py',
    'iter-heat-low': 'iterhybrid_predictor_corrector.py',
    'iter-heat-high': 'iterhybrid_predictor_corrector.py',
    'iter-grid-50': 'iterhybrid_predictor_corrector.py',
    'fuse-profile-handoff': 'basic_config.py',
}
PROFILES = {
    'te': ('T_e', 'eV', 1000), 'ti': ('T_i', 'eV', 1000), 'ne': ('n_e', 'm^-3', 1),
    'q': ('q', '1', 1), 'psi': ('psi', 'Wb', 1),
    'chi_e': ('chi_turb_e', 'm^2/s', 1), 'chi_i': ('chi_turb_i', 'm^2/s', 1),
    'j_total': ('j_total', 'A/m^2', 1), 'pressure': ('pressure_thermal_total', 'Pa', 1),
    'p_alpha_e': ('p_alpha_e', 'W/m^3', 1), 'p_alpha_i': ('p_alpha_i', 'W/m^3', 1),
}
SCALARS = {
    'fusion_power': ('P_fusion', 'W', 1), 'external_power': ('P_external_total', 'W', 1),
    'alpha_power': ('P_alpha_total', 'W', 1), 'auxiliary_power': ('P_aux_total', 'W', 1),
    'fusion_gain': ('Q_fusion', '1', 1), 'plasma_current': ('Ip', 'A', 1),
    'thermal_energy': ('W_thermal_total', 'J', 1), 'q95': ('q95', '1', 1),
    'te_volume_average': ('T_e_volume_avg', 'eV', 1000),
    'ti_volume_average': ('T_i_volume_avg', 'eV', 1000),
    'ne_volume_average': ('n_e_volume_avg', 'm^-3', 1), 'bootstrap_fraction': ('f_bootstrap', '1', 1),
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def worker(root, out):
    import numpy as np
    import torax
    from torax._src.config import config_loader
    from torax._src.orchestration import run_simulation
    spec = json.loads((out / 'spec.json').read_text())
    recipe = json.loads((out / 'recipe.json').read_text())
    assert spec['engine'] == {'id': 'torax', 'commit': COMMIT}
    assert recipe['id'] == spec['recipe'] and spec['recipe'] in EXAMPLES
    params = spec['parameters']
    assert .01 <= params['duration'] <= 400 and 10 <= params['radialCells'] <= 100
    assert isinstance(params['radialCells'], int) and .5 <= params['heatingScale'] <= 1.5
    assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == COMMIT
    # Normalize CRLF through Git's Windows checkout policy; no source edits.
    assert not subprocess.check_output(['git', '-c', 'core.autocrlf=true', '-C', str(root), 'status', '--porcelain', '--untracked-files=no'], text=True).strip(), 'DIRTY_TORAX_SOURCE'
    source = root / 'torax/examples' / EXAMPLES[spec['recipe']]
    cfg = copy.deepcopy(config_loader.import_module(str(source))['CONFIG'])
    cfg['numerics'].update(t_final=params['duration'])
    cfg['geometry']['n_rho'] = params['radialCells']
    if params['heatingScale'] != 1:
        assert 'generic_heat' in cfg['sources'], 'UNSUPPORTED_HEATING'
        cfg['sources']['generic_heat']['P_total'] = cfg['sources']['generic_heat'].get('P_total', 120e6) * params['heatingScale']
    snapshot = None
    lineage = None
    checks = ['process-exit-zero', 'sim-error-zero', 'complete-time-range', 'finite-output', 'positive-core-profiles']
    limitations = ['Simulation output, not device observations.',
                  'Numerical convergence and experimental validation are not established.',
                  'TORAX has no unified COCOS convention; no 2D equilibrium projection is implied.']
    if spec['recipe'] == 'fuse-profile-handoff':
        assert spec['input']['profileSnapshotSha256'] == digest(out / 'snapshot.json')
        snapshot = json.loads((out / 'snapshot.json').read_text())
        assert snapshot['coordinate'] == 'rho_tor_norm' and snapshot['mapping'] == 'kinetic-profiles-only.v1'
        assert snapshot['authority'] == 'simulated'
        pc = {'Ip': 1.08374265e6, 'normalize_n_e_to_nbar': False,
              'n_e_nbar_is_fGW': False, 'n_e_right_bc_is_fGW': False}
        for channel in snapshot['profiles']:
            name, unit, factor = PROFILES[channel['id']]
            assert channel['unit'] == unit
            pc[name] = {0.0: dict(zip(snapshot['rho'], np.asarray(channel['values'], dtype=np.float64) / factor))}
            pc[name + '_right_bc'] = channel['values'][-1] / factor
        cfg['profile_conditions'] = pc
        cfg['geometry'].update(R_major=1.6955, a_minor=.60, B_0=1.70904)
        cfg['plasma_composition'] = {'main_ion': 'D', 'impurity': 'C', 'Z_eff': 1.6}
        cfg['sources'] = {'generic_heat': {'P_total': 2e6 * params['heatingScale']}, 'ei_exchange': {}, 'ohmic': {}}
        cfg['numerics'].update(evolve_current=False, evolve_density=False, max_dt=.01)
        cfg['pedestal'] = {'set_pedestal': False}
        lineage = {'sourceRunId': snapshot['source']['runId'], 'sourceRecordSha256': snapshot['source']['recordSha256'],
                   'sourceArtifactSha256': snapshot['source']['artifactSha256'], 'mapping': snapshot['mapping'],
                   'snapshotSha256': digest(out / 'snapshot.json')}
        limitations += ['Only Te, Ti and ne initial profiles are transferred; eV to keV and linear rho interpolation are explicit.',
                        'Receiving geometry is a DIII-D-like circular approximation, with prescribed positive B and Ip, 2 MW generic heating.',
                        'No FUSE equilibrium, signed q, sources, current diffusion or density evolution is transferred; this is not discharge reproduction.']
    else:
        assert spec['input'] is None
    multiplier = cfg['numerics'].get('resistivity_multiplier', 1)
    limitations.append(f'Configured resistivity multiplier: {multiplier}; physical current-diffusion timescale may be accelerated.')
    config = torax.ToraxConfig.from_dict(cfg)
    (out / 'resolved-config.json').write_text(config.model_dump_json(indent=2) + '\n')
    environment = {'python': sys.version.split()[0], 'cpuAffinity': sorted(os.sched_getaffinity(0)),
                   'backend': 'cpu', 'x64': True, 'packages': {d.metadata['Name']: d.version for d in importlib.metadata.distributions()}}
    write_json(out / 'environment.json', environment)
    assets = [{'name': source.name, 'sha256': digest(source)}]
    asset_paths = []
    if cfg['geometry']['geometry_type'] == 'chease':
        asset_paths.append(root / 'torax/data/third_party/geo/iterhybrid.mat2cols')
    if spec['recipe'] == 'step-flat-top':
        asset_paths.append(root / 'torax/data/third_party/imas/STEP_SPP_001_ECHD_ftop.nc')
    if cfg['transport']['model_name'] == 'qlknn':
        import fusion_surrogates
        asset_paths.append(Path(fusion_surrogates.__file__).parent / 'qlknn/models/qlknn_7_11.onnx')
    for path in asset_paths:
        assets.append({'name': path.name, 'sha256': digest(path)})
    start = time.monotonic()
    tree, history = run_simulation.run_simulation(config, progress_bar=False)
    elapsed = time.monotonic() - start
    tree.to_netcdf(out / 'native.nc')
    numerics = tree['numerics']
    assert int(numerics['sim_error'].values) == 0, str(history.sim_error)
    assert str(numerics['sim_status'].values) == 'completed'
    times = tree.time.values
    assert np.all(np.diff(times) > 0) and abs(times[-1] - times[0] - params['duration']) < 1e-8
    axes = []
    for name, grid in [('rho_norm', 'cell-with-boundaries'), ('rho_cell_norm', 'cell'), ('rho_face_norm', 'face')]:
        axes.append({'id': name, 'coordinate': 'rho_tor_norm', 'grid': grid, 'values': tree[name].values.tolist()})
    profiles = []
    for key, (native, unit, scale) in PROFILES.items():
        if native not in tree['profiles']:
            continue
        value = tree['profiles'][native]
        axis = next(d for d in value.dims if d != 'time')
        data = value.transpose('time', axis).values * scale
        assert np.all(np.isfinite(data)), native
        if key in ['te', 'ti', 'ne']:
            assert np.all(data > 0), native
        profiles.append({'id': key, 'unit': unit, 'axisId': axis, 'values': data.tolist()})
    scalars = []
    for key, (native, unit, scale) in SCALARS.items():
        data = tree['scalars'][native].values * scale
        assert np.all(np.isfinite(data)), native
        scalars.append({'id': key, 'unit': unit, 'values': data.tolist()})
    if snapshot:
        errors = {}
        for channel in snapshot['profiles']:
            p = next(p for p in profiles if p['id'] == channel['id'])
            axis = next(a['values'] for a in axes if a['id'] == p['axisId'])
            expected = np.interp(axis, snapshot['rho'], np.asarray(channel['values'], dtype=np.float64))
            # Boundary/axis values are reconstructed by TORAX; compare the finite-volume cells.
            mask = (np.array(axis) > 0) & (np.array(axis) < 1)
            errors[channel['id']] = float(np.max(np.abs(np.array(p['values'][0])[mask] / expected[mask] - 1)))
            assert errors[channel['id']] < 1e-10, errors
        write_json(out / 'handoff-checks.json', errors)
        checks.append('initial-profile-interpolation-verified')
    result = {'schema': 'transport-timeseries.v1', 'id': out.name, 'authority': 'simulated', 'recordKind': 'simulation-run',
              'engine': {'id': 'torax', 'version': importlib.metadata.version('torax'), 'commit': COMMIT, 'runtime': 'python-jax-cpu', 'runtimeVersion': sys.version.split()[0]},
              'recipe': recipe['id'], 'device': recipe['device'], 'comparisonGroup': recipe['family'], 'parameters': params,
              'time': {'unit': 's', 'reference': 'simulation-time', 'values': times.tolist()}, 'axes': axes, 'profiles': profiles, 'scalars': scalars,
              'execution': {'state': 'succeeded', 'simError': 0, 'elapsedSeconds': elapsed, 'steps': len(times) - 1},
              'assessment': {'dataChecks': 'passed', 'numericalConvergence': 'not-established', 'deviceValidation': 'not-established', 'checks': checks},
              'provenance': {'configSha256': digest(out / 'resolved-config.json'), 'nativeSha256': digest(out / 'native.nc'), 'environmentSha256': digest(out / 'environment.json'), 'adapterSha256': digest(__file__), 'scientificAssets': assets},
              'lineage': lineage, 'referenceProfiles': snapshot, 'limitations': limitations}
    write_json(out / 'result.json', result)
    from export_geometry import project_geometry
    write_json(out / 'geometry.json', project_geometry(root, {'id': out.name, 'recipe': spec['recipe']}, result))
    write_json(out / 'manifest.json', {p.name: {'sha256': digest(p), 'bytes': p.stat().st_size} for p in out.iterdir() if p.name in ['spec.json', 'recipe.json', 'snapshot.json', 'native.nc', 'resolved-config.json', 'environment.json', 'result.json', 'adapter.py', 'supervisor.py', 'handoff-checks.json', 'geometry.json', 'export_geometry.py', 'hdf_reader.py']})
    print(json.dumps({'id': out.name, 'steps': len(times) - 1, 'elapsedSeconds': elapsed}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--attempt', type=Path, required=True)
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    if args.worker:
        worker(args.root, args.attempt)
        return
    spec = json.loads((args.attempt / 'spec.json').read_text())
    cpus = spec['resources']['cpus']
    assert isinstance(cpus, int) and 1 <= cpus <= 8
    assert 30 <= spec['resources']['timeoutSeconds'] <= 3600
    os.sched_setaffinity(0, sorted(os.sched_getaffinity(0))[:cpus])
    env = os.environ.copy()
    env.update(JAX_PLATFORMS='cpu', JAX_ENABLE_X64='true', MPLBACKEND='Agg', OMP_NUM_THREADS=str(cpus), OPENBLAS_NUM_THREADS=str(cpus),
               XDG_CACHE_HOME=str(args.root / '.cache-local'), MPLCONFIGDIR=str(args.root / '.cache-local/matplotlib'),
               JAX_COMPILATION_CACHE_DIR=str(args.root / '.cache-local/jax'), PYTHONUNBUFFERED='1')
    status = supervise([sys.executable, __file__, '--root', str(args.root), '--attempt', str(args.attempt), '--worker'],
                       args.attempt, spec['resources']['timeoutSeconds'], env)
    print(json.dumps(status), flush=True)
    raise SystemExit(0 if status['state'] == 'succeeded' else 1)


if __name__ == '__main__':
    main()
