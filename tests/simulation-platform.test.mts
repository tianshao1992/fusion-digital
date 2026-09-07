import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { defaultEngineSpec, parseEngineSpec, parseProfileSnapshot, parseTransportResult, canCompare, interpolateProfile, type TransportResult, type TransportRunEntry } from '../app/simulations/platform/contracts.ts';
import { recipes } from '../app/simulations/platform/catalog.ts';
import { createFuseSnapshot, json, sha } from '../scripts/simulations/engine-service.mts';
import { profileAtTime } from '../app/simulations/platform/display.ts';
import { createComparisonRecord } from '../app/simulations/platform/comparison.ts';

const entries: TransportRunEntry[] = JSON.parse(await readFile(new URL('../app/simulations/data/transport-runs.json', import.meta.url), 'utf8'));
const runs = new Map<string, TransportResult>();
for (const e of entries) {
  const compressed = await readFile(new URL(`../public${e.artifact.path}`, import.meta.url));
  const raw = gunzipSync(compressed);
  assert.equal(sha(compressed), e.artifact.sha256); assert.equal(sha(raw), e.artifact.rawSha256);
  assert.equal(compressed.length, e.artifact.bytes); assert.equal(raw.length, e.artifact.rawBytes);
  const r = parseTransportResult(JSON.parse(raw.toString()));
  runs.set(r.recipe, r);
}
test('all eight real runs have complete time ranges and hash-bound catalog metrics', () => {
  assert.equal(runs.size, 8);
  for (const recipe of recipes) {
    const r = runs.get(recipe.id)!, e = entries.find(e => e.id === r.id)!;
    assert.equal(r.engine.commit, defaultEngineSpec().engine.commit);
    assert.equal(r.time.values.at(-1), recipe.defaults.duration);
    assert.equal(e.steps, r.execution.steps); assert.equal(e.radialCells, r.parameters.radialCells);
    for (const m of e.metrics) assert.equal(m.value, r.scalars.find(s => s.id === m.id)!.values.at(-1));
    assert.equal(r.assessment.numericalConvergence, 'not-established');
  }
});
test('specs reject shell/path injection, unbounded resources, wrong source and unsupported inputs', () => {
  const base = defaultEngineSpec();
  for (const bad of [{ ...base, command: 'exec' }, { ...base, recipe: '../other.py' }, { ...base, parameters: { ...base.parameters, radialCells: 2 } }, { ...base, resources: { cpus: 100, timeoutSeconds: 1800 } }, { ...base, input: { profileSnapshotSha256: 'a'.repeat(64) } }]) assert.throws(() => parseEngineSpec(bad));
  assert.throws(() => parseEngineSpec(defaultEngineSpec('fuse-profile-handoff')));
  assert.throws(() => parseEngineSpec({ ...defaultEngineSpec('step-flat-top'), parameters: { duration: 400, radialCells: 100, heatingScale: 1.1 } }));
});
test('transport contract separates profile/scalar units, radial grids, shape, authority and private fields', () => {
  const source = runs.get('iter-hybrid')!;
  const mutations = [
    (r: TransportResult) => { r.profiles[0].unit = 'keV'; },
    (r: TransportResult) => { r.profiles[0].values[0].pop(); },
    (r: TransportResult) => { r.axes[0].values.reverse(); },
    (r: TransportResult) => { r.time.values[1] = r.time.values[0]; },
    (r: TransportResult) => { r.profiles[0].values[0][2] = 0; },
    (r: TransportResult) => { r.scalars[0].id = 'te'; r.scalars[0].unit = 'eV'; },
  ];
  for (const mutate of mutations) { const r = structuredClone(source); mutate(r); assert.throws(() => parseTransportResult(r)); }
  assert.throws(() => parseTransportResult({ ...source, authority: 'measured' }));
  assert.throws(() => parseTransportResult({ ...source, privatePath: 'D:/private' }));
});
test('FUSE handoff binds the exact published artifact and reproduces initial finite-volume cells', async () => {
  const r = runs.get('fuse-profile-handoff')!, input = await createFuseSnapshot();
  assert.deepEqual(r.referenceProfiles, input);
  assert.equal(sha(json(input)), r.lineage!.snapshotSha256);
  assert.equal(input.source.runId, r.lineage!.sourceRunId);
  assert.throws(() => parseProfileSnapshot({ ...input, coordinate: 'psi_norm' }));
  for (const channel of input.profiles) {
    const p = r.profiles.find(p => p.id === channel.id)!, x = r.axes.find(a => a.id === p.axisId)!.values;
    for (let i = 0; i < x.length; i++) {
      if (x[i] === 0 || x[i] === 1) continue;
      const expected = interpolateProfile(input.rho, channel.values, x[i])!;
      assert.ok(Math.abs(p.values[0][i]! / expected - 1) < 1e-10);
    }
  }
});
test('comparison allows matched physics families and avoids cross-device and out-of-time inference', () => {
  assert.equal(canCompare(runs.get('iter-hybrid')!, runs.get('iter-grid-50')!), true);
  assert.equal(canCompare(runs.get('iter-hybrid')!, runs.get('iter-rampup')!), false);
  assert.equal(canCompare(runs.get('iter-hybrid')!, runs.get('step-flat-top')!), false);
  assert.equal(interpolateProfile([0, 1], [10, 20], .5), 15);
  assert.equal(interpolateProfile([0, 1], [10, null], .5), null);
  assert.equal(profileAtTime(runs.get('basic')!, 'te', 500)!.y[0], null);
});
test('public projection has no local paths and preserves scientific asset provenance', () => {
  for (const r of runs.values()) {
    assert.doesNotMatch(JSON.stringify(r), /D:\\|\/mnt\/d\/|site-packages|Bearer /);
    assert.equal(createHash('sha256').update('x').digest('hex').length, r.provenance.nativeSha256.length);
    if (r.recipe.startsWith('iter-')) assert.ok(r.provenance.scientificAssets.some(a => a.name === 'qlknn_7_11.onnx'));
  }
});
test('comparison export preserves both configurations, source identities and absolute difference semantics', () => {
  const a = runs.get('iter-hybrid')!, b = runs.get('iter-grid-50')!, c = createComparisonRecord(a, b, 5);
  assert.equal(c.left.nativeSha256, a.provenance.nativeSha256); assert.equal(c.right.parameters.radialCells, 50);
  const p = c.scalars.find(s => s.id === 'fusion_power')!;
  assert.equal(p.difference, p.left! - p.right!); assert.equal(c.accuracyRanking, false);
  assert.throws(() => createComparisonRecord(a, runs.get('step-flat-top')!, 5));
  assert.throws(() => createComparisonRecord(a, b, 6));
});
