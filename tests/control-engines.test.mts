import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONTROL_RUNNER_SHA256, CONTROL_SOURCE_COMMIT, IMAGE_DIGESTS, defaultControlSpec, parseControlJob, parseControlResult, parseControlSpec, type ControlEngine } from '../app/simulations/control/contracts.ts';
import { assessControlCoupling, controlSnapshot } from '../app/simulations/control/coupling.ts';
import { projectControlBundle, sha } from '../scripts/simulations/control-collector.mts';
import { createControlService } from '../scripts/simulations/control-engine-service.mts';
import { publishControl } from '../scripts/simulations/publish-control.mts';
import { createGateway } from '../scripts/simulations/gateway.mts';
import type { AddressInfo } from 'node:net';

// SYNTHETIC protocol fixtures only. They never go into the product's public directory.
function fixture(engine: ControlEngine = 'dina') {
  const spec = defaultControlSpec(engine); spec.parameters.durationSeconds = .002;
  const channels = ['CS', ...Array.from({ length: 10 }, (_, i) => `PF${i + 1}`), ...(engine === 'fge' ? ['VS'] : [])];
  const action = { rawCommandV: channels.map(() => 0), mappedCommandV: channels.map(() => 0), psmSentV: channels.map(() => 0), channelNames: channels, actualAppliedV: null, actualAppliedStatus: 'not_reported', vsOwnership: 'plant_internal' };
  const native = { schemaVersion: 'control-run.v1', authority: 'simulated', engine, scenarioId: spec.recipe, status: 'completed', requestedSteps: 2, completedSteps: 2, dispatchedSteps: 2, unconfirmedSteps: 0, dtS: .001, frames: [0, 1, 2].map(i => ({ step: i, tRelativeS: i * .001, solverTimeS: engine === 'dina' ? .8 + i * .001 : null, signals: { Ip: 500000 - i, R: .8, Z: .01, I_PF: Array.from({ length: 12 }, (_, k) => k) }, action: i === 0 ? null : structuredClone(action), fields: engine === 'fge' ? { lcfsPointsM: [[.7, 0], [.8, .1], [.9, 0], [.7, 0]] } : { available: false }, failure: false })) };
  const nativeSpec = { ...spec, parameters: { ...spec.parameters, usePsm: false } };
  const manifest = { schemaVersion: 'control-run-manifest.v1', authority: 'simulated', engine: spec.engine, runnerCommit: CONTROL_SOURCE_COMMIT, scenarioId: spec.recipe, runnerSha256: CONTROL_RUNNER_SHA256, status: native.status, execution: { backend: 'docker_raw_protocol', imageVerification: 'docker_inspect', endpointBinding: 'loopback_only', imageId: IMAGE_DIGESTS[engine], containerId: 'c'.repeat(64) }, quality: { missingValues: 'fail_closed', imputation: 'none' }, controller: { training: false, vsOwnership: 'plant_internal' }, artifacts: [] as { path: string; sha256: string; bytes: number }[] };
  const pack = () => { const raw = Buffer.from(JSON.stringify(native)), specBytes = Buffer.from(JSON.stringify(nativeSpec)); manifest.artifacts = [['result.json', raw], ['spec.json', specBytes]].map(([name, bytes]) => ({ path: name as string, sha256: sha(bytes as Buffer), bytes: (bytes as Buffer).length })); return { raw, specBytes, manifestBytes: Buffer.from(JSON.stringify(manifest)) }; };
  const result = () => { const p = pack(); return projectControlBundle(p.raw, p.manifestBytes, p.specBytes, engine + '-test-only', spec, CONTROL_RUNNER_SHA256); };
  return { spec, native, nativeSpec, manifest, pack, result };
}
for (const engine of ['dina', 'fge'] as const) {
  test(`${engine}: native baseline projection retains time, actions, 12 currents, source and missing applied values`, () => {
    const f = fixture(engine), r = f.result(); assert.equal(r.engine.sourceCommit, CONTROL_SOURCE_COMMIT); assert.deepEqual(r.time.values, [0, .001, .002]); assert.equal(r.signals.filter(s => s.id.startsWith('pf_current_')).length, 12); assert.equal(r.actions.appliedV, null); assert.equal(r.actions.commandedV[0][0], null); assert.equal(r.geometry.state, engine === 'fge' ? 'available' : 'unavailable'); assert.equal(r.assessment.numericalConvergence, 'not-established');
  });
  test(`${engine}: TORAX assessment always blocks unsupported physics and snapshot execution`, () => { const r = fixture(engine).result(); const a = assessControlCoupling(r, 'torax', 1); assert.equal(a.execution, 'not-implemented'); assert.equal(a.readiness, 'blocked'); assert.equal(a.source?.sampleSeconds, .001); assert.equal(controlSnapshot(r, 1).geometry.flux, null); assert.equal(assessControlCoupling(null, engine).readiness, 'blocked'); assert.throws(() => controlSnapshot(r, 9)); });
}
for (const [name, modify] of [
  ['nonzero voltage', (s: ReturnType<typeof defaultControlSpec>) => { s.parameters.voltagesV[0] = 1; }],
  ['decimation', (s: ReturnType<typeof defaultControlSpec>) => { s.parameters.recordEvery = 2; }],
  ['unbounded time', (s: ReturnType<typeof defaultControlSpec>) => { s.resources.timeoutSeconds = 1801; }],
  ['fractional step', (s: ReturnType<typeof defaultControlSpec>) => { s.parameters.durationSeconds = .0015; }],
  ['wrong source', (s: ReturnType<typeof defaultControlSpec>) => { s.engine.commit = 'a'.repeat(40); }],
] as const) test(`spec rejects ${name}`, () => { const s = defaultControlSpec('fge'); modify(s); assert.throws(() => parseControlSpec(s)); });
test('spec rejects arbitrary inputs, paths, endpoints, images and shell fields', () => { for (const k of ['command', 'host', 'path', 'image']) assert.throws(() => parseControlSpec({ ...defaultControlSpec('dina'), [k]: 'untrusted' })); assert.throws(() => parseControlSpec({ ...defaultControlSpec('dina'), input: { url: 'https://example.org' } })); });
test('collector rejects raw hash replacement and synthetic authority', () => { const f = fixture(), p = f.pack(); assert.throws(() => projectControlBundle(Buffer.from(p.raw.toString() + ' '), p.manifestBytes, p.specBytes, 'dina-test', f.spec, CONTROL_RUNNER_SHA256), /HASH/); f.native.authority = 'synthetic'; assert.throws(f.result); });
test('collector rejects wrong image, runtime commit, runner bytes and PSM', () => { for (const mutate of [(f: ReturnType<typeof fixture>) => { f.manifest.execution.imageId = 'sha256:' + '0'.repeat(64); }, (f: ReturnType<typeof fixture>) => { f.manifest.runnerCommit = 'a'.repeat(40); }, (f: ReturnType<typeof fixture>) => { f.manifest.runnerSha256 = 'a'.repeat(64); }, (f: ReturnType<typeof fixture>) => { f.nativeSpec.parameters.usePsm = true; }]) { const f = fixture(); mutate(f); assert.throws(f.result); } });
test('collector rejects missing signal and action channel replacement', () => { const f = fixture(); f.native.frames[1].signals.Ip = NaN; assert.throws(f.result); const g = fixture(); g.native.frames[1].action!.channelNames[0] = 'untrusted'; assert.throws(g.result); });
test('result cannot replace missing arrays, units, identity or missing values with success', () => { for (const mutate of [(r: ReturnType<ReturnType<typeof fixture>['result']>) => { r.actions.commandedV = null as never; }, (r: ReturnType<ReturnType<typeof fixture>['result']>) => { r.signals[0].unit = 'm'; }, (r: ReturnType<ReturnType<typeof fixture>['result']>) => { r.signals[0].values[1] = null; }, (r: ReturnType<ReturnType<typeof fixture>['result']>) => { r.time.values[1] = 0; }, (r: ReturnType<ReturnType<typeof fixture>['result']>) => { r.authority = 'synthetic' as never; }]) { const r = fixture().result(); mutate(r); assert.throws(() => parseControlResult(r)); } });
test('unconfirmed STEP count survives a partial timeout', () => { const f = fixture(); f.native.status = f.manifest.status = 'timed_out'; f.native.frames.pop(); f.native.completedSteps = 1; f.native.unconfirmedSteps = 1; const r = f.result(); assert.equal(r.execution.state, 'timed-out'); assert.equal(r.execution.unconfirmedSteps, 1); assert.equal(r.time.values.at(-1), .001); });
test('zero-sample cancellation has a distinct unavailable-result diagnostic', () => { const f = fixture(); f.native.status = f.manifest.status = 'cancelled'; f.native.frames = []; f.native.completedSteps = f.native.dispatchedSteps = 0; assert.throws(f.result, /CONTROL_NO_CONFIRMED_SAMPLES/); });
test('public publisher is content-addressed, immutable, and preserves prior runs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'control-publisher-test-')), input = path.join(root, 'input'); await mkdir(input); await mkdir(path.join(root, 'app/simulations/data'), { recursive: true }); await writeFile(path.join(root, 'app/simulations/data/control-runs.json'), '[]');
  const f = fixture(), p = f.pack(); for (const [name, bytes] of [['result.json', p.raw], ['manifest.json', p.manifestBytes], ['spec.json', p.specBytes]] as const) await writeFile(path.join(input, name), bytes);
  const a = await publishControl(input, 'dina-unit-test-a', root), b = await publishControl(input, 'dina-unit-test-b', root); assert.notEqual(a.id, b.id); assert.equal(sha(await readFile(path.join(root, 'public', a.artifact.path))), a.artifact.sha256); assert.equal(JSON.parse(await readFile(path.join(root, 'app/simulations/data/control-runs.json'), 'utf8')).length, 2); assert.deepEqual(await publishControl(input, a.id, root), a);
});
test('persistent idempotency survives restart and unresolved lease never releases automatically', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'control-jobs-test-')), options = { root, workspace: root, runnerSha256: CONTROL_RUNNER_SHA256, engines: ['dina' as const], containers: { dina: 'test-only' } };
  const first = createControlService(options); first.close(); const db = new DatabaseSync(path.join(root, 'jobs.sqlite')), spec = defaultControlSpec('dina'), id = 'dina-persistent-test', key = 'persistent-test-key-1234', hash = sha('body');
  db.prepare('INSERT INTO jobs(id,idem,hash,spec,state,stopped,started) VALUES(?,?,?,?,?,0,?)').run(id, key, hash, JSON.stringify(spec), 'running', Date.now()); db.prepare('INSERT INTO lease VALUES(1,?)').run(id); db.close();
  const next = createControlService(options); try { assert.equal((await next.status(id)).state, 'reconciliation-required'); assert.equal((await next.submit(spec, key, hash)).id, id); await assert.rejects(() => next.submit(spec, key, sha('different')), /CONFLICT/); await assert.rejects(() => next.submit(spec, 'another-valid-key-123', hash), /REARM/); assert.equal(next.busy(), true); assert.throws(() => parseControlJob({ ...awaitableJob(id), engineId: 'fge' })); } finally { next.close(); }
});
test('second supervisor instance is rejected without changing the first owner', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'control-owner-test-')), options = { root, workspace: root, runnerSha256: CONTROL_RUNNER_SHA256, engines: ['dina' as const], containers: { dina: 'test-only' } };
  const first = createControlService(options);
  try { assert.throws(() => createControlService(options), /CONTROL_GATEWAY_ALREADY_RUNNING/); assert.equal(first.busy(), false); } finally { first.close(); }
  const restarted = createControlService(options); restarted.close();
});
function awaitableJob(id: string) { return { schema: 'engine-job.v1', id, engineId: 'dina', state: 'running', processStopped: false, elapsedSeconds: 0, reason: null }; }
test('dedicated gateway advertises only configured controls and rejects other engine inputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'control-gateway-test-')), service = createControlService({ root, workspace: root, runnerSha256: CONTROL_RUNNER_SHA256, engines: ['dina'], containers: { dina: 'test-only' } });
  const token = 't'.repeat(32), server = createGateway(token, 'https://fusiondigital.club', undefined, undefined, undefined, service, ['dina']); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, headers = { Authorization: `Bearer ${token}`, Origin: 'https://fusiondigital.club', 'Content-Type': 'application/json' };
  try { assert.deepEqual((await (await fetch(base + '/v1/catalog', { headers })).json()).executionEngineIds, ['dina']); assert.equal((await fetch(base + '/v1/validate', { method: 'POST', headers, body: JSON.stringify({ spec: defaultControlSpec('dina') }) })).status, 200); assert.equal((await fetch(base + '/v1/validate', { method: 'POST', headers, body: JSON.stringify({ spec: defaultControlSpec('fge') }) })).status, 400); assert.equal((await fetch(base + '/v1/jobs', { method: 'POST', headers, body: JSON.stringify({ spec: defaultControlSpec('dina') }) })).status, 400); assert.equal((await fetch(base + '/v1/catalog')).status, 401); } finally { await new Promise<void>(resolve => server.close(() => resolve())); service.close(); }
});
