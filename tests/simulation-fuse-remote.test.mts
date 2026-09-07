import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import {
  assertFuseResultMatchesSpec,
  normalizeFuseGatewayEndpoint,
  parseFuseCollectedResult,
  parseFuseJobId,
  parseFuseJobStatus,
  parseRecoveredFuseJobStatus,
  readGatewayJson,
} from '../app/simulations/fuse-remote.ts';
import records from '../app/simulations/data/fuse-demo.json' with { type: 'json' };
import bundles from '../app/simulations/data/physics-bundles.json' with { type: 'json' };
import maps from '../app/simulations/data/fuse-coordinate-maps.json' with { type: 'json' };
import { defaultRunSpec } from '../app/simulations/run-spec.ts';

const project = new URL('../', import.meta.url);
const asset = async (publicPath: string) => JSON.parse(gunzipSync(await readFile(new URL(`public${publicPath}`, project))).toString());

test('FUSE gateway endpoint accepts loopback HTTP or origin-only HTTPS', () => {
  assert.equal(normalizeFuseGatewayEndpoint('http://127.0.0.1:8791/'), 'http://127.0.0.1:8791');
  assert.equal(normalizeFuseGatewayEndpoint('https://compute.example'), 'https://compute.example');
  for (const value of ['http://compute.example:8791', 'https://user:pass@compute.example', 'https://compute.example/v1', 'https://compute.example?q=1', 'http://localhost']) assert.throws(() => normalizeFuseGatewayEndpoint(value));
});

test('FUSE recovery accepts only a complete job ID and binds the returned status identity', () => {
  const id = 'fuse-diiid-20260907114931870-3a0857cf';
  assert.equal(parseFuseJobId(`  ${id}  `), id);
  for (const value of ['', 'torax-basic-123', 'FUSE-DIIID-123', 'fuse-diiid-../secret', 'fuse-diiid-id?token=value', `fuse-diiid-${'a'.repeat(91)}`]) {
    assert.throws(() => parseFuseJobId(value), /INVALID_FUSE_JOB_ID/);
  }
  const status = { schema: 'engine-job.v1', engineId: 'fuse', id, state: 'running', processStopped: false, exitCode: null };
  assert.equal(parseRecoveredFuseJobStatus(id, status).id, id);
  assert.throws(
    () => parseRecoveredFuseJobStatus('fuse-diiid-20260907114931870-deadbeef', status),
    /JOB_IDENTITY_MISMATCH/,
  );
});

test('FUSE recovery UI keeps endpoint, token and job ID in component memory only', async () => {
  const source = await readFile(new URL('../app/simulations/FuseRemoteExecution.tsx', import.meta.url), 'utf8');
  assert.match(source, /recover:\s*\(id: string, spec: RunSpec\)/);
  assert.match(source, /parseRecoveredFuseJobStatus\(expectedId/);
  assert.match(source, /submittedSpec\.current = expectedSpec/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
});

test('FUSE session result binds gateway verification, native artifacts, state and submitted spec', async () => {
  const run = structuredClone(records[0]); const bundle = bundles.find(item => item.runId === run.id)!; const mapBundle = maps.find(item => item.runId === run.id)!;
  const physics = await asset(bundle.path); const coordinateMap = await asset(mapBundle.artifact.path);
  run.source.artifacts.push({ name: 'coordinate-map.json', sha256: mapBundle.artifact.rawSha256 });
  const value = {
    schema: 'fuse-job-result.v1', run, physics, coordinateMap,
    verification: {
      authority: 'local-gateway-verified', manifestSha256: run.source.recordSha256,
      physicsSha256: bundle.rawSha256, nativeSha256: mapBundle.sourceNativeSha256,
      coordinateMapSha256: mapBundle.artifact.rawSha256,
    },
  };
  const result = parseFuseCollectedResult(value);
  assert.equal(result.run.id, result.physics.runId);
  assertFuseResultMatchesSpec(result, { ...defaultRunSpec(), recipe: 'diiid-default-stationary' });
  assert.throws(() => parseFuseCollectedResult({ ...value, verification: { ...value.verification, nativeSha256: '0'.repeat(64) } }));
  assert.throws(() => assertFuseResultMatchesSpec(result, defaultRunSpec()));
  assert.equal(parseFuseJobStatus({ schema: 'engine-job.v1', engineId: 'fuse', id: run.id, state: 'running', processStopped: false, exitCode: null, elapsedSeconds: 2 }).state, 'running');
  assert.throws(() => parseFuseJobStatus({ schema: 'engine-job.v1', engineId: 'fuse', id: run.id, state: 'unknown', processStopped: false, exitCode: null }));
});

test('bounded gateway reader cancels an oversized stream', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(9)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(() => readGatewayJson(new Response(body), 8), /GATEWAY_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled, true);
});
