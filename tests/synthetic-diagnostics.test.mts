import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parseDiagnosticData, fitDensity, projectDensity } from '../app/simulations/diagnostics/contracts.ts';
import { parsePhysics } from '../app/simulations/physics.ts';
import { parseTransportResult } from '../app/simulations/platform/contracts.ts';
import { parseTransportGeometry } from '../app/simulations/platform/geometry.ts';
const read = (p: string) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const catalog = read('../app/simulations/data/synthetic-diagnostics.json');
const compressed = fs.readFileSync(new URL('../public'+catalog.path, import.meta.url));
const raw = gunzipSync(compressed);
const data = parseDiagnosticData(JSON.parse(raw.toString()));
const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
type Artifact = { path: string; sha256: string; rawSha256: string; bytes: number; rawBytes: number };
function sourceArtifact(artifact: Artifact) {
  const bytes = fs.readFileSync(new URL('../public'+artifact.path, import.meta.url));
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(hash(bytes), artifact.sha256);
  const sourceRaw = gunzipSync(bytes);
  assert.equal(sourceRaw.length, artifact.rawBytes);
  assert.equal(hash(sourceRaw), artifact.rawSha256);
  return JSON.parse(sourceRaw.toString());
}

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
  assert.deepEqual(new Set(data.cases.map(c => c.id)), new Set(catalog.cases.map((c: { id: string }) => c.id)));
  for (const c of data.cases) {
    const e = catalog.cases.find((e: { id: string }) => e.id === c.id);
    assert.ok(e);
    assert.equal(c.runId, e.runId); assert.equal(c.frames.length, e.frames);
    if (c.engine === 'fuse') {
      const bundle = fuse.find((entry: { runId: string }) => entry.runId === c.runId);
      const mapEntry = maps.find((entry: { runId: string }) => entry.runId === c.runId);
      assert.ok(bundle && mapEntry);
      const physics = parsePhysics(sourceArtifact(bundle));
      const coordinateMap = sourceArtifact(mapEntry.artifact) as { runId: string; source: { physicsSha256: string; nativeSha256: string } };
      const te = physics.profiles.find(profile => profile.id === 'te');
      const ne = physics.profiles.find(profile => profile.id === 'ne');
      assert.ok(te && ne);
      assert.equal(physics.coreTimeSeconds, physics.timeSeconds);
      assert.equal(coordinateMap.runId, physics.runId);
      assert.equal(coordinateMap.source.physicsSha256, bundle.rawSha256);
      assert.equal(coordinateMap.source.nativeSha256, mapEntry.sourceNativeSha256);
      assert.deepEqual(c.source, {
        physicsSha256: bundle.rawSha256,
        geometrySha256: mapEntry.artifact.rawSha256,
        nativeSha256: mapEntry.sourceNativeSha256,
        recordSha256: bundle.recordSha256,
      });
      assert.deepEqual(c.rho, te.x);
      assert.deepEqual(c.frames.map(frame => frame.time), [physics.coreTimeSeconds]);
      assert.deepEqual(c.frames.map(frame => frame.te), [te.y]);
      assert.deepEqual(c.frames.map(frame => frame.ne), [ne.y]);
      assert.equal(c.geometry.kind, 'native-equilibrium');
      assert.deepEqual(c.geometry.boundary, physics.equilibrium.boundary);
      assert.deepEqual(c.geometry.axis, physics.equilibrium.axis);
      continue;
    }
    const runEntry = transport.find((entry: { id: string }) => entry.id === c.runId);
    const geometryEntry = geometry.find((entry: { runId: string }) => entry.runId === c.runId);
    assert.ok(runEntry && geometryEntry);
    const result = parseTransportResult(sourceArtifact(runEntry.artifact));
    const sourceGeometry = parseTransportGeometry(sourceArtifact(geometryEntry.artifact));
    const te = result.profiles.find(profile => profile.id === 'te');
    const ne = result.profiles.find(profile => profile.id === 'ne');
    assert.ok(te && ne && te.axisId === ne.axisId);
    const rho = result.axes.find(axis => axis.id === te.axisId);
    assert.ok(rho);
    assert.equal(sourceGeometry.runId, result.id);
    assert.equal(sourceGeometry.sourceNativeSha256, result.provenance.nativeSha256);
    assert.equal(geometryEntry.sourceNativeSha256, result.provenance.nativeSha256);
    assert.deepEqual(c.source, {
      physicsSha256: runEntry.artifact.rawSha256,
      geometrySha256: geometryEntry.artifact.rawSha256,
      nativeSha256: result.provenance.nativeSha256,
      recordSha256: runEntry.artifact.rawSha256,
    });
    assert.deepEqual(c.rho, rho.values);
    assert.deepEqual(c.frames.map(frame => frame.time), result.time.values);
    assert.deepEqual(c.frames.map(frame => frame.te), te.values);
    assert.deepEqual(c.frames.map(frame => frame.ne), ne.values);
    assert.equal(c.geometry.kind, sourceGeometry.kind);
    assert.deepEqual(c.geometry.boundary, sourceGeometry.boundary);
    assert.deepEqual(c.geometry.axis, sourceGeometry.axis);
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
