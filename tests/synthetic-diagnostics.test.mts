import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parseDiagnosticData, fitDensity, projectDensity } from '../app/simulations/diagnostics/contracts.ts';
const read = (p: string) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const catalog = read('../app/simulations/data/synthetic-diagnostics.json');
const compressed = fs.readFileSync(new URL('../public'+catalog.path, import.meta.url));
const raw = gunzipSync(compressed);
const data = parseDiagnosticData(JSON.parse(raw.toString()));
const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');

test('real CHERAB archive matches hashes, case identities and archived source projections', () => {
  assert.equal(hash(compressed), catalog.sha256); assert.equal(hash(raw), catalog.rawSha256);
  assert.equal(compressed.length, catalog.bytes); assert.equal(raw.length, catalog.rawBytes);
  assert.equal(data.provenance.versions.cherab, '1.5.0'); assert.equal(data.provenance.versions.raysect, '0.8.1.post1');
  assert.equal(hash(fs.readFileSync(new URL('../scripts/diagnostics/run_cherab.py', import.meta.url))), data.provenance.workerSha256);
  assert.equal(hash(fs.readFileSync(new URL('../scripts/diagnostics/prepare-inputs.mts', import.meta.url))), data.provenance.prepareSha256);
  const fuse = read('../app/simulations/data/physics-bundles.json');
  const transport = read('../app/simulations/data/transport-runs.json');
  const geometry = read('../app/simulations/data/transport-geometries.json');
  const maps = read('../app/simulations/data/fuse-coordinate-maps.json');
  for (const c of data.cases) {
    const e = catalog.cases.find((e: { id: string }) => e.id === c.id);
    assert.equal(c.runId, e.runId); assert.equal(c.frames.length, e.frames);
    const p = c.engine === 'fuse' ? fuse.find((r: { runId: string }) => r.runId === c.runId) : transport.find((r: { id: string }) => r.id === c.runId).artifact;
    const g = (c.engine === 'fuse' ? maps : geometry).find((g: { runId: string }) => g.runId === c.runId);
    for (const [a, digest] of [[p, c.source.physicsSha256], [g.artifact, c.source.geometrySha256]]) {
      const bytes = fs.readFileSync(new URL('../public'+a.path, import.meta.url));
      assert.equal(hash(bytes), a.sha256); assert.equal(hash(gunzipSync(bytes)), digest);
    }
    assert.equal(c.source.nativeSha256, g.sourceNativeSha256);
  }
});

test('independent integration and final-frame sensitivity checks remain within demo tolerances', () => {
  assert.ok(data.verification.baseline.relativeError < 1e-6);
  for (const c of data.cases) {
    assert.ok(c.verification.quadratureMaxRelativeError < .001);
    assert.ok(c.verification.stepHalvingRelativeError < .001);
    assert.ok(c.verification.gridRefinementRelativeError < .01);
    assert.equal(c.verification.independentDeviceValidation, false);
    assert.equal(c.verification.sourceNumericalConvergence, 'not-established');
  }
});

test('browser inversion agrees with Python and leaves validation channels out of the fit', () => {
  for (const c of data.cases) for (const f of c.frames) {
    const mask = c.geometry.channels.map(v => v.fit), fit = fitDensity(f, mask);
    assert.ok(Math.abs(fit-f.densityFit) < 1e-12);
    assert.ok(Math.abs(fit-1.12) < .025);
    const projected = projectDensity(f, fit), heldOut = projected.residual.filter((_, i) => !mask[i]);
    assert.ok(Math.abs(Math.sqrt(heldOut.reduce((s, v) => s+v*v, 0)/heldOut.length)-f.heldOutRmsSigma) < 1e-11);
    const altered = structuredClone(f); altered.observed = f.observed.map((v, i) => mask[i] ? v : v*3);
    assert.equal(fitDensity(altered, mask), fit);
    assert.ok(projectDensity(altered, fit).residual.some(v => Math.abs(v) > 10));
    const doubled = projectDensity(f, 1.4);
    assert.ok(doubled.predicted.every((v, i) => Math.abs(v/f.predicted[i]-1.96) < 1e-12));
  }
});

test('missing data, wrong units, invalid coordinates and upgraded authority fail closed', () => {
  const corruptions: ((d: typeof data) => void)[] = [
    d => { Reflect.set(d, 'authority', 'measured'); },
    d => { Reflect.set(d.model, 'signalUnit', 'W'); },
    d => { d.model.zeff = 2; },
    d => { Reflect.set(d.closure, 'feedbackToPhysicsSolver', true); },
    d => { Reflect.set(d.cases[0].frames[0].ne, 0, null); },
    d => { d.cases[0].frames[0].sigma[0] = 0; },
    d => { d.cases[0].frames[0].emission.pop(); },
    d => { d.cases[0].rho[1] = -1; },
    d => { d.cases[0].source.geometrySha256 = 'invalid'; },
    d => { Reflect.set(d.cases[0].verification, 'independentDeviceValidation', true); },
  ];
  for (const corrupt of corruptions) { const d = structuredClone(data); corrupt(d); assert.throws(() => parseDiagnosticData(d)); }
  for (const scale of [NaN, Infinity, 0, -1, 2]) assert.throws(() => projectDensity(data.cases[0].frames[0], scale));
});
