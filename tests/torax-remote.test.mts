import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { defaultEngineSpec } from '../app/simulations/platform/contracts.ts';
import { activeJob, matchResult, normalizeEndpoint, parseJob, parseUpload, snapshotDigest } from '../app/simulations/platform/compute-client.ts';
import { createFuseSnapshot, validateInput } from '../scripts/simulations/engine-service.mts';

test('remote compute accepts HTTPS or exact loopback and rejects credential/path injection', () => {
  assert.equal(normalizeEndpoint(' https://compute.example/ '), 'https://compute.example');
  assert.equal(normalizeEndpoint('http://127.0.0.1:8791'), 'http://127.0.0.1:8791');
  for (const endpoint of ['http://compute.example', 'https://user:secret@compute.example', 'https://compute.example/api', 'https://compute.example?token=x', 'file:///tmp/code', 'http://localhost.evil:8791']) assert.throws(() => normalizeEndpoint(endpoint));
});
test('uploaded profiles bind browser bytes to backend input and cannot change the recipe executable', async () => {
  const snapshot = await createFuseSnapshot();
  const spec = defaultEngineSpec('fuse-profile-handoff', { profileSnapshotSha256: await snapshotDigest(snapshot) });
  const upload = { schema: 'torax-run-upload.v1', spec, snapshot };
  assert.deepEqual((await parseUpload(JSON.stringify(upload))).snapshot, snapshot);
  assert.deepEqual((await validateInput(spec, snapshot)).snapshot, snapshot);
  const altered = structuredClone(snapshot); altered.profiles[0].values[0] *= 1.1;
  await assert.rejects(parseUpload(JSON.stringify({ ...upload, snapshot: altered })), /SNAPSHOT_BINDING/);
  await assert.rejects(validateInput(spec, altered), /SNAPSHOT_BINDING/);
  const rebound = defaultEngineSpec('fuse-profile-handoff', { profileSnapshotSha256: await snapshotDigest(altered) });
  assert.deepEqual((await parseUpload(JSON.stringify({ ...upload, spec: rebound, snapshot: altered }))).snapshot, altered);
  await assert.rejects(validateInput(rebound, altered), /FUSE_SNAPSHOT_SOURCE_UNVERIFIED/);
  const unknownSource = structuredClone(snapshot); unknownSource.source.engineId = 'user-model';
  const unknownSourceSpec = defaultEngineSpec('fuse-profile-handoff', { profileSnapshotSha256: await snapshotDigest(unknownSource) });
  await assert.rejects(validateInput(unknownSourceSpec, unknownSource), /FUSE_SNAPSHOT_SOURCE_UNVERIFIED/);
  await assert.rejects(parseUpload(JSON.stringify({ ...upload, command: 'python user.py' })), /INVALID_UPLOAD/);
  await assert.rejects(parseUpload(JSON.stringify({ ...upload, snapshot: { ...snapshot, coordinate: 'psi_norm' } })), /INCOMPATIBLE/);
  await assert.rejects(parseUpload(' '.repeat(120001)), /UPLOAD_TOO_LARGE/);
  await assert.rejects(validateInput(defaultEngineSpec(), snapshot), /SNAPSHOT_BINDING/);
});
test('remote job responses preserve identity and unresolved processes remain active', () => {
  const status = { schema: 'engine-job.v1', id: 'torax-basic-test', state: 'running', processStopped: false, elapsedSeconds: 1 };
  assert.equal(parseJob(status, status.id).state, 'running');
  assert.throws(() => parseJob(status, 'torax-other'), /INVALID_JOB_STATUS/);
  assert.throws(() => parseJob({ ...status, state: 'invented' }), /INVALID_JOB_STATUS/);
  assert.equal(activeJob({ ...parseJob(status), state: 'reconciliation-required' }), true);
  assert.equal(activeJob({ ...parseJob(status), state: 'succeeded', processStopped: false }), true);
  assert.equal(activeJob({ ...parseJob(status), state: 'succeeded', processStopped: true }), false);
});
test('a returned result must match job, submitted parameters and input lineage', () => {
  const catalog = JSON.parse(readFileSync('app/simulations/data/transport-runs.json', 'utf8'));
  const entry = catalog.find((e: { recipe: string }) => e.recipe === 'basic');
  const result = JSON.parse(gunzipSync(readFileSync('public' + entry.artifact.path)).toString());
  const spec = defaultEngineSpec('basic'); spec.parameters = result.parameters;
  assert.equal(matchResult(result, result.id, spec).id, result.id);
  assert.throws(() => matchResult(result, 'torax-other', spec), /RESULT_IDENTITY/);
  assert.throws(() => matchResult(result, result.id, { ...spec, parameters: { ...spec.parameters, heatingScale: 1.2 } }), /RESULT_SPEC_MISMATCH/);
});
