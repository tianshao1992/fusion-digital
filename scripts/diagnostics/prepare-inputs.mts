// Only archived, hash-verified public projections enter the diagnostic worker.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parsePhysics } from '../../app/simulations/physics.ts';
import { parseTransportResult } from '../../app/simulations/platform/contracts.ts';
import { parseTransportGeometry } from '../../app/simulations/platform/geometry.ts';

const root = process.cwd();
const digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const read = async (p: string) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'));
type Artifact = { path: string; sha256: string; rawSha256: string; bytes: number; rawBytes: number };
async function artifact(a: Artifact) {
  if (!/^\/data\/simulations\/[a-f0-9]{64}\.json\.gz$/.test(a.path)) throw Error('INVALID_SOURCE_PATH');
  const compressed = await fs.readFile(path.join(root, 'public', a.path));
  if (compressed.length !== a.bytes || digest(compressed) !== a.sha256) throw Error('SOURCE_HASH');
  const raw = gunzipSync(compressed, { maxOutputLength: 20_000_000 });
  if (raw.length !== a.rawBytes || digest(raw) !== a.rawSha256) throw Error('SOURCE_RAW_HASH');
  return JSON.parse(raw.toString());
}
const cases = [];
const f = (await read('app/simulations/data/physics-bundles.json')).find((v: { runId: string }) => v.runId === 'fuse-diiid-20260906174722551-3ffd17fc');
const p = parsePhysics(await artifact(f));
const ce = (await read('app/simulations/data/fuse-coordinate-maps.json')).find((v: { runId: string }) => v.runId === p.runId);
const map = await artifact(ce.artifact);
if (map.runId !== p.runId || map.source.physicsSha256 !== f.rawSha256 || map.source.nativeSha256 !== ce.sourceNativeSha256 || p.coreTimeSeconds !== p.timeSeconds) throw Error('FUSE_GEOMETRY_BINDING');
const fp = (id: string) => { const v = p.profiles.find(v => v.id === id)!; if (!v || v.y.some(n => n === null || n <= 0) || v.axis !== 'rho_tor_norm') throw Error('FUSE_PROFILE'); return v; };
const te = fp('te'), ne = fp('ne');
if (te.unit !== 'eV' || ne.unit !== 'm^-3' || JSON.stringify(te.x) !== JSON.stringify(ne.x)) throw Error('PROFILE_UNITS_OR_AXES');
cases.push({ id: 'fuse-diiid', name: 'FUSE · DIII-D', device: 'DIII-D', engine: 'fuse', runId: p.runId,
  source: { physicsSha256: f.rawSha256, geometrySha256: ce.artifact.rawSha256, nativeSha256: ce.sourceNativeSha256, recordSha256: f.recordSha256 },
  time: [p.coreTimeSeconds], rho: te.x, te: [te.y], ne: [ne.y],
  geometry: { kind: 'native-equilibrium', boundary: p.equilibrium.boundary, axis: p.equilibrium.axis, r: p.equilibrium.r, z: p.equilibrium.z, psi: p.equilibrium.psi, psiAxis: p.equilibrium.psiAxis, psiBoundary: p.equilibrium.psiBoundary, psiNorm: map.psiNorm, rhoTorNorm: map.rhoTorNorm, cocos: p.cocos },
  assumptions: ['axisymmetric-flux-function', 'LCFS-only-no-SOL-emission', 'same-time-native-equilibrium'] });
const runs = await read('app/simulations/data/transport-runs.json');
const geometries = await read('app/simulations/data/transport-geometries.json');
for (const recipe of ['fuse-profile-handoff', 'iter-hybrid']) {
  const e = runs.find((v: { recipe: string }) => v.recipe === recipe);
  const r = parseTransportResult(await artifact(e.artifact));
  const ge = geometries.find((v: { runId: string }) => v.runId === r.id);
  const g = parseTransportGeometry(await artifact(ge.artifact));
  if (g.runId !== r.id || g.sourceNativeSha256 !== r.provenance.nativeSha256 || g.kind !== 'shape-reconstruction') throw Error('TORAX_GEOMETRY_BINDING');
  const te = r.profiles.find(v => v.id === 'te')!, ne = r.profiles.find(v => v.id === 'ne')!;
  if (te.axisId !== ne.axisId) throw Error('TORAX_AXIS_MISMATCH');
  cases.push({ id: recipe === 'iter-hybrid' ? 'torax-iter' : 'torax-diiid', name: recipe === 'iter-hybrid' ? 'TORAX · ITER hybrid' : 'FUSE → TORAX · DIII-D-derived', device: r.device, engine: 'torax', runId: r.id,
    source: { physicsSha256: e.artifact.rawSha256, geometrySha256: ge.artifact.rawSha256, nativeSha256: r.provenance.nativeSha256, recordSha256: e.artifact.rawSha256 },
    time: r.time.values, rho: r.axes.find(a => a.id === te.axisId)!.values, te: te.values, ne: ne.values,
    geometry: { kind: g.kind, boundary: g.boundary, axis: g.axis, rings: g.rings, cocos: null },
    assumptions: [...g.assumptions, 'LCFS-only-no-SOL-emission', 'time-axis-is-simulation-time'] });
}
const output = { schema: 'diagnostic-input.v1', authority: 'simulated', units: { te: 'eV', ne: 'm^-3', rho: 'rho_tor_norm', geometry: 'm', time: 's' }, prepareSha256: digest(await fs.readFile(new URL(import.meta.url))), cases };
await fs.mkdir(path.join(root, 'work/diagnostics'), { recursive: true });
await fs.writeFile(path.join(root, 'work/diagnostics/input.json'), JSON.stringify(output));
console.log(JSON.stringify({ cases: cases.map(c => ({ id: c.id, runId: c.runId, frames: c.time.length, geometry: c.geometry.kind })) }));
