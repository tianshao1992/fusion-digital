"""Read-only full-frame audit of two private IMAS equilibria; writes summary only."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

import h5py
import numpy as np

P = 'time_slice[]&profiles_2d[]&'
Q = 'time_slice[]&profiles_1d&'
G = 'time_slice[]&global_quantities&'


def stats(values):
    a = np.asarray(values, dtype=float)
    return {'min': float(a.min()), 'median': float(np.median(a)), 'max': float(a.max())}


def readable(value):
    if isinstance(value, bytes):
        return value.decode('utf-8')
    return value.item() if isinstance(value, np.generic) else value


def audit(path, shot):
    issues = []
    records = []
    with h5py.File(path, 'r') as f:
        g = f['equilibrium']
        t = g['time'][:]
        n = len(t)
        axes = g[G+'psi_axis'][:]
        edges = g[G+'psi_boundary'][:]
        ip = g[G+'ip'][:]
        b0 = g['vacuum_toroidal_field&b0'][:]
        shape_fields = [key for key in g if key.endswith('_SHAPE')]
        shape_unique = {key: np.unique(g[key][:].reshape(-1, g[key].shape[-1]), axis=0).tolist()
                        for key in shape_fields}
        # The boundary outline uses variable length; padded values are not part of geometry.
        for k in range(n):
            frame_issues = []
            r = g[P+'grid&dim1'][k, 0]
            z = g[P+'grid&dim2'][k, 0]
            psi = g[P+'psi'][k, 0]
            br = g[P+'b_field_r'][k, 0]
            bz = g[P+'b_field_z'][k, 0]
            rr = g[P+'r'][k, 0]
            zz = g[P+'z'][k, 0]
            profile = g[Q+'f'][k]
            p1 = g[Q+'psi'][k]
            boundary_n = int(g['time_slice[]&boundary&outline&r_SHAPE'][k, 0])
            boundary_r = g['time_slice[]&boundary&outline&r'][k, :boundary_n]
            boundary_z = g['time_slice[]&boundary&outline&z'][k, :boundary_n]
            for name, a in [('r', r), ('z', z), ('psi', psi), ('br', br), ('bz', bz),
                            ('rr', rr), ('zz', zz), ('f', profile), ('psi_1d', p1),
                            ('boundary_r', boundary_r), ('boundary_z', boundary_z)]:
                if not np.all(np.isfinite(a)) or np.any(np.abs(a) > 1e30):
                    frame_issues.append(name+'_invalid_or_sentinel')
            if not np.all(np.diff(r) > 0) or not np.all(np.diff(z) > 0):
                frame_issues.append('grid_nonmonotonic')
            if not np.all(rr == r[None, :]) or not np.all(zz == z[:, None]):
                frame_issues.append('grid_not_Z_R_layout')
            if not np.all(np.diff(p1) < 0):
                frame_issues.append('psi_1d_not_strictly_descending')
            if not np.isclose(p1[0], axes[k], rtol=1e-12, atol=1e-12):
                frame_issues.append('profile_start_not_axis')
            if not np.isclose(p1[-1], edges[k], rtol=1e-12, atol=1e-12):
                frame_issues.append('profile_end_not_boundary')
            if axes[k] <= edges[k]:
                frame_issues.append('psi_axis_not_greater_than_boundary')
            if np.any(profile <= 0) or b0[k] <= 0:
                frame_issues.append('nonpositive_F_or_b0')
            if not np.ptp(psi) > 1e-12:
                frame_issues.append('constant_psi')
            # Match the converter's finite difference convention using interior pixels.
            dz, dr = np.gradient(psi, z, r, edge_order=2)
            comparisons = {}
            for name, actual, expected in [('br', br, -dz / (2*np.pi*rr)),
                                           ('bz', bz, dr / (2*np.pi*rr))]:
                a = actual[2:-2, 2:-2].ravel()
                e = expected[2:-2, 2:-2].ravel()
                denom = np.dot(e, e)
                slope = float(np.dot(e, a)/denom) if denom else float('nan')
                rel = float(np.linalg.norm(a-e) / max(np.linalg.norm(a), 1e-30))
                comparisons[name] = {'fit_slope': slope, 'relative_rms': rel}
                if not np.isfinite(rel) or rel > 1e-8:
                    frame_issues.append(name+'_gradient_convention_mismatch')
            rec = {'frame': k, 'time_s': float(t[k]), 'grid_shape': list(psi.shape),
                   'r_m': [float(r[0]), float(r[-1])], 'z_m': [float(z[0]), float(z[-1])],
                   'dr_m': float(np.diff(r).mean()), 'dz_m': float(np.diff(z).mean()),
                   'psi_axis': float(axes[k]), 'psi_boundary': float(edges[k]),
                   'f_min': float(profile.min()), 'f_max': float(profile.max()),
                   'f_edge': float(profile[-1]), 'b0_t': float(b0[k]),
                   'inferred_r0_m': float(profile[-1]/b0[k]),
                   'boundary_points': boundary_n, 'gradient_comparison': comparisons}
            records.append(rec)
            if frame_issues:
                issues.append({'frame': k, 'time_s': float(t[k]), 'issues': frame_issues})
        gaps = [{'after_frame': int(k), 'before_s': float(t[k]), 'after_s': float(t[k+1]),
                 'gap_ms': float(round((t[k+1]-t[k])*1000, 6))}
                for k in np.where(np.diff(t) > 0.0015)[0]]
        scalar_bad = {name: np.where(~np.isfinite(a) | (np.abs(a) > 1e30))[0].tolist()
                      for name, a in [('time', t), ('psi_axis', axes), ('psi_boundary', edges),
                                      ('ip', ip), ('b0', b0)]}
        metadata = {key: readable(g[key][()]) for key in ['code&name', 'code&version', 'code&commit',
                    'ids_properties&version_put&data_dictionary']}
        flags = g['code&output_flag'][:]
        return {
            'shot': shot, 'source_sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest(),
            'frames': n, 'time_s': [float(t[0]), float(t[-1])],
            'strictly_increasing_time': bool(np.all(np.diff(t) > 0)),
            'time_step_s': stats(np.diff(t)), 'gaps': gaps,
            'frames_with_issues': issues, 'scalar_invalid_indices': scalar_bad,
            'metadata': metadata, 'output_flags': np.unique(flags).tolist(),
            'shape_metadata_unique': shape_unique,
            'layout': 'psi[z_index,r_index]; grid dim1=R, dim2=Z',
            'gradient_formula': 'Br=-dpsi/dZ/(2*pi*R); Bz=+dpsi/dR/(2*pi*R)',
            'gradient_match': {component: {metric: stats([q['gradient_comparison'][component][metric] for q in records])
                               for metric in ['fit_slope', 'relative_rms']} for component in ['br', 'bz']},
            'psi_axis': stats(axes), 'psi_boundary': stats(edges), 'ip_source': stats(ip),
            'f_values': {'min': min(q['f_min'] for q in records), 'max': max(q['f_max'] for q in records)},
            'f_edge_over_b0_m': stats([q['inferred_r0_m'] for q in records]),
            'grid': {key: stats([q[key] for q in records]) for key in ['dr_m', 'dz_m']},
            'boundary_point_count': stats([q['boundary_points'] for q in records]),
            'sample_0_4s': records[int(np.argmin(np.abs(t-.4)))],
            'r0_explicitly_present': any('r0' in key.lower() for key in g),
            'units_attributes_present': any('unit' in str(key).lower() for d in g.values() for key in d.attrs),
            'cocos_metadata_present': any('cocos' in key.lower() for key in g),
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', action='append', required=True, help='shot=/path/to/original.h5')
    parser.add_argument('--output', type=Path, required=True, help='Private report outside the repository and public directory')
    args = parser.parse_args()
    sources = [(int(spec.split('=', 1)[0]), Path(spec.split('=', 1)[1]).resolve()) for spec in args.source]
    if sorted(shot for shot, _ in sources) != [21066, 21138]:
        parser.error('This audited source contract is limited to exactly shots 21066 and 21138')
    if args.output.exists():
        parser.error('Report already exists; select a new private output path')
    report = {'audit_at': datetime.now(timezone.utc).isoformat(), 'private_only': True,
              'scope': 'Two named files, every time frame and every 2D psi/Br/Bz value; no publication.',
              'shots': [audit(path, shot) for shot, path in sources]}
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf-8')
    print(json.dumps({'shots': [{key: shot[key] for key in ['shot', 'frames', 'time_s', 'frames_with_issues']}
                               for shot in report['shots']]}, ensure_ascii=False))
