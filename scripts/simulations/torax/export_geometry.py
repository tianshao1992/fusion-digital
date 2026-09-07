"""Derive display geometry from immutable TORAX runs; never alter a solver result."""
import argparse
import bisect
import gzip
import hashlib
import json
import math
from pathlib import Path
from hdf_reader import HdfReader


def sha(data):
    return hashlib.sha256(data).hexdigest()


def interp(x, y, target):
    if target < x[0] or target > x[-1]:
        return None
    i = bisect.bisect_left(x, target)
    if i == 0 or x[i] == target:
        return y[i]
    return y[i-1] + (y[i]-y[i-1]) * (target-x[i-1]) / (x[i]-x[i-1])


def inside(x, y, polygon):
    found = False
    for i, (bx, by) in enumerate(polygon):
        ax, ay = polygon[i-1]
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            found = not found
    return found


def project_geometry(root, entry, result):
    native = root / 'local/platform-runs' / entry['id'] / 'native.nc'
    assert sha(native.read_bytes()) == result['provenance']['nativeSha256'], 'NATIVE_HASH_MISMATCH'
    config_file = native.parent / 'resolved-config.json'
    assert sha(config_file.read_bytes()) == result['provenance']['configSha256'], 'CONFIG_HASH_MISMATCH'
    config = json.loads(config_file.read_text())
    geometry = {'schema': 'transport-geometry.v1', 'runId': entry['id'],
                'sourceNativeSha256': result['provenance']['nativeSha256'],
                'authority': 'derived-display', 'coordinate': 'R-Z', 'unit': 'm',
                'timeReference': 'fixed-input-geometry', 'cocos': None, 'grid': None, 'rings': [],
                'source': {'name': 'native.nc', 'sha256': result['provenance']['nativeSha256']},
                'assumptions': [], 'projectorSha256': sha(Path(__file__).read_bytes())}
    if entry['recipe'] == 'step-flat-top':
        source = root / 'torax/data/third_party/imas/STEP_SPP_001_ECHD_ftop.nc'
        digest = sha(source.read_bytes())
        assert any(a['name'] == source.name and a['sha256'] == digest for a in result['provenance']['scientificAssets']), 'GEOMETRY_SOURCE_UNBOUND'
        f = HdfReader(source)
        try:
            prefix = '/equilibrium/0/time_slice.'
            def read(name):
                return f.numeric(prefix + name)
            r = read('profiles_2d.grid.dim1')[1]; z = read('profiles_2d.grid.dim2')[1]
            shape, raw = read('profiles_2d.psi')
            assert shape == [1, 1, len(r), len(z)] and read('profiles_2d.grid_type.index')[1] == [1.0]
            boundary = list(zip(read('boundary.outline.r')[1], read('boundary.outline.z')[1]))
            axis = [read('global_quantities.magnetic_axis.r')[1][0], read('global_quantities.magnetic_axis.z')[1][0]]
            pa = read('global_quantities.psi_axis')[1][0]; pb = read('global_quantities.psi_boundary')[1][0]
            p1 = read('profiles_1d.psi')[1]; rho1 = read('profiles_1d.rho_tor_norm')[1]
            normalized = [(p-pa)/(pb-pa) for p in p1]
            assert all(b > a for a, b in zip(normalized, normalized[1:]))
            if normalized[0] > 0:
                normalized.insert(0, 0); rho1.insert(0, 0)
            assert abs(normalized[-1]-1) < 1e-10 and rho1[-1] == 1
            rho = []; psi = []
            for j, zz in enumerate(z):
                rrho = []; rpsi = []
                for i, rr in enumerate(r):
                    p = raw[i*len(z)+j]  # IMAS dim1=R, dim2=Z; public array order z,r.
                    in_plasma = inside(rr, zz, boundary)
                    value = interp(normalized, rho1, (p-pa)/(pb-pa)) if in_plasma else None
                    rrho.append(value); rpsi.append(p if in_plasma else None)
                rho.append(rrho); psi.append(rpsi)
            i = min(range(len(r)), key=lambda i: abs(r[i]-axis[0])); j = min(range(len(z)), key=lambda j: abs(z[j]-axis[1]))
            assert psi[j][i] is not None and abs((psi[j][i]-pa)/(pb-pa)) < .01, 'AXIS_ORIENTATION_CHECK'
            geometry.update(kind='input-equilibrium-grid', source={'name': source.name, 'sha256': digest}, boundary=boundary, axis=axis,
                            grid={'r': r, 'z': z, 'psi': psi, 'rho': rho, 'psiAxis': pa, 'psiBoundary': pb},
                            assumptions=['fixed-STEP-IMAS-input', 'psi-grid-is-not-TORAX-evolved-equilibrium', 'profiles-constant-on-input-flux-surfaces', 'rho-from-source-psi-to-toroidal-rho-map', 'LCFS-grid-point-mask', 'out-of-rho-domain-samples-remain-null'])
        finally:
            f.close()
    else:
        f = HdfReader(native)
        try:
            x = f.numeric('rho_norm')[1]; face = f.numeric('rho_face_norm')[1]
            def static_profile(name):
                shape, values = f.numeric('profiles/' + name)
                n = shape[-1]; first = values[:n]
                assert all(abs(v-first[i % n]) <= 1e-10*max(1, abs(v)) for i, v in enumerate(values)), 'TIME_DEPENDENT_GEOMETRY_UNSUPPORTED'
                return first
            ri = static_profile('R_in'); ro = static_profile('R_out'); elong = static_profile('elongation')
            du = static_profile('delta_upper') if f.has('profiles/delta_upper') else [0.0]*len(face)
            dl = static_profile('delta_lower') if f.has('profiles/delta_lower') else [0.0]*len(face)
            rings = []
            for rho in face:
                lower = interp(x, ri, rho); upper = interp(x, ro, rho)
                center = (lower+upper)/2; minor = (upper-lower)/2; kappa = interp(x, elong, rho)
                points = []
                for k in range(97):
                    theta = 2*math.pi*k/96
                    delta = interp(face, du if math.sin(theta) >= 0 else dl, rho)
                    assert abs(delta) < 1
                    points.append([center + minor*math.cos(theta+math.asin(delta)*math.sin(theta)), kappa*minor*math.sin(theta)])
                rings.append({'rho': rho, 'points': points})
            geometry.update(kind='shape-reconstruction', rings=rings, boundary=rings[-1]['points'], axis=rings[0]['points'][0],
                            assumptions=['parametric-R-in-R-out-kappa-delta-reconstruction', 'Z-axis-assumed-zero', 'not-a-2D-equilibrium-solve', 'profiles-constant-on-reconstructed-surfaces'])
            if config['geometry']['geometry_type'] == 'circular':
                geometry['assumptions'].append('circular-model-elongation-correction-visualized-as-ellipse')
        finally:
            f.close()
    return geometry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--project', type=Path, default=Path.cwd())
    args = parser.parse_args()
    catalog = args.project / 'app/simulations/data/transport-runs.json'
    geometry_catalog = []
    for entry in json.loads(catalog.read_text()):
        asset = entry['artifact']
        compressed = (args.project / 'public' / asset['path'].lstrip('/')).read_bytes()
        assert sha(compressed) == asset['sha256']
        raw = gzip.decompress(compressed); assert sha(raw) == asset['rawSha256']
        result = json.loads(raw)
        geometry = project_geometry(args.root, entry, result)
        raw = (json.dumps(geometry, separators=(',', ':'), allow_nan=False)+'\n').encode()
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        artifact = {'path': '/data/simulations/'+sha(compressed)+'.json.gz', 'sha256': sha(compressed), 'bytes': len(compressed), 'rawSha256': sha(raw), 'rawBytes': len(raw)}
        (args.project / 'public' / artifact['path'].lstrip('/')).write_bytes(compressed)
        geometry_catalog.append({'runId': entry['id'], 'kind': geometry['kind'], 'sourceNativeSha256': geometry['sourceNativeSha256'], 'artifact': artifact})
        print(entry['recipe'], geometry['kind'], len(compressed))
    (args.project / 'app/simulations/data/transport-geometries.json').write_text(json.dumps(geometry_catalog, indent=2)+'\n')


if __name__ == '__main__':
    main()
