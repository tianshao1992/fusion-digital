import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { defaultRunSpec, parseRunSpec } from '../app/simulations/run-spec.ts';
import { normalizeFuseGatewayEndpoint, parseFuseCollectedResult, readGatewayJson } from '../app/simulations/fuse-remote.ts';
import { createGateway } from '../scripts/simulations/gateway.mts';
import * as runtime from '../scripts/simulations/engine-service.mts';

// Both engine slots receive an in-memory mock. No test launches Julia, reads
// native scientific archives, uploads device data, or invokes publication.
const origin = 'https://fusiondigital.club';
const jobId = 'fuse-diiid-boundary-synthetic-fixture';
const completed = () => ({ schema: 'engine-job.v1' as const, id: jobId,
  state: 'succeeded', processStopped: true, exitCode: 0, elapsedSeconds: 1 });
type Work = (...args: unknown[]) => Promise<unknown>;
type Overrides = Partial<Record<'submit' | 'status' | 'cancel' | 'collect', Work>>;

async function harness(overrides: Overrides = {}) {
  const token = randomBytes(32).toString('hex');
  const calls: { name: string; args: unknown[] }[] = [];
  const resultFixture = { schema: 'fuse-job-result.v1',
    run: { id: jobId, authority: 'simulated', execution: 'succeeded', assessment: 'not-established' },
    physics: { runId: jobId, authority: 'simulated', derivation: 'SYNTHETIC protocol fixture, not scientific output' } };
  const implementations: Record<string, Work> = {
    submit: async () => ({ id: jobId, completion: Promise.resolve(completed()) }),
    status: async () => completed(),
    cancel: async () => ({ id: jobId, state: 'cancellation-requested' }),
    collect: async () => structuredClone(resultFixture),
    ...overrides,
  };
  const service = { ...runtime,
    ...Object.fromEntries(Object.entries(implementations).map(([name, work]) => [name, async (...args: unknown[]) => {
      calls.push({ name, args }); return work(...args);
    }])),
  };
  // Result fixtures deliberately cover routing, not the real native collector.
  const server = createGateway(token, origin,
    service as unknown as Parameters<typeof createGateway>[2],
    service as unknown as Parameters<typeof createGateway>[3]);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json',
    'Idempotency-Key': 'fuse-boundary-test-key-0001' };
  const send = (route: string, method = 'GET', body?: string, patch: Record<string, string> = {}) =>
    fetch(base + route, { method, headers: { ...headers, ...patch }, body, redirect: 'error' });
  const close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  return { token, base, headers, send, calls, close, resultFixture };
}

test('FUSE RunSpec rejects commands, paths, environment overrides and unbounded resources', () => {
  const valid = defaultRunSpec();
  assert.deepEqual(parseRunSpec(valid), valid);
  for (const extra of [{ command: 'cmd.exe' }, { script: 'run(`untrusted`)' }, { workspace: 'C:/private' },
    { inputPath: '../../private.json' }, { outputDirectory: 'C:/private' },
    { inputUrl: 'https://attacker.invalid/input.json' }, { environment: { JULIA_PROJECT: 'C:/private' } },
    { actor: 'ActorUserSupplied' }]) assert.throws(() => parseRunSpec({ ...valid, ...extra }), /INVALID_RUN_SPEC/);
  for (const value of [
    { ...valid, recipe: '../run.jl' }, { ...valid, model: 'TGLFNN; untrusted-command' },
    { ...valid, engineCommit: '0'.repeat(40) },
    { ...valid, resources: { ...valid.resources, threads: 9 } },
    { ...valid, resources: { ...valid.resources, threads: 1.5 } },
    { ...valid, resources: { ...valid.resources, timeoutSeconds: 7201 } },
    { ...valid, solver: { ...valid.solver, maxIterations: 301 } },
    { ...valid, solver: { ...valid.solver, xtol: Number.NaN } },
    { ...valid, solver: { ...valid.solver, stationaryThreshold: Number.POSITIVE_INFINITY } },
  ]) assert.throws(() => parseRunSpec(value), /INVALID_RUN_SPEC/);
  const injected = JSON.parse(JSON.stringify(valid).replace('"schema":', '"__proto__":{"polluted":true},"schema":'));
  assert.throws(() => parseRunSpec(injected), /INVALID_RUN_SPEC/);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('all FUSE operations require the bearer, not cookies or query-string credentials', async () => {
  const h = await harness();
  try {
    for (const [route, method] of [['/v1/catalog', 'GET'], [`/v1/jobs/${jobId}`, 'GET'],
      [`/v1/jobs/${jobId}/result`, 'GET'], [`/v1/jobs/${jobId}/cancel`, 'POST'], ['/v1/validate', 'POST'], ['/v1/jobs', 'POST']]) {
      assert.equal((await fetch(h.base + route, { method, headers: { Origin: origin, Cookie: `token=${h.token}` } })).status, 401);
    }
    assert.equal((await fetch(`${h.base}/v1/catalog?token=${h.token}`, { headers: { Origin: origin } })).status, 401);
    assert.equal((await h.send('/v1/catalog', 'GET', undefined, { Authorization: 'Bearer invalid' })).status, 401);
    assert.equal(h.calls.length, 0);
  } finally { await h.close(); }
});

test('hostile, null and lookalike origins and DNS-rebinding Hosts cannot access the gateway', async () => {
  const h = await harness();
  try {
    for (const hostile of ['null', 'https://attacker.invalid', `${origin}.attacker.invalid`, 'http://fusiondigital.club', 'https://www.fusiondigital.club']) {
      const response = await h.send(`/v1/jobs/${jobId}/result`, 'GET', undefined, { Origin: hostile });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(h.base + '/v1/catalog', { headers: { ...h.headers, Host: 'attacker.invalid:8791' } }, res => {
        res.resume(); resolve(res.statusCode);
      }); req.once('error', reject); req.end();
    });
    assert.equal(status, 403); assert.equal(h.calls.length, 0);
  } finally { await h.close(); }
});

test('preflight is exact-origin, credential-free and non-executing, not a browser LNA acceptance test', async () => {
  const h = await harness();
  try {
    const response = await fetch(h.base + '/v1/jobs', { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
      'Access-Control-Request-Private-Network': 'true',
    } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.match(response.headers.get('vary') ?? '', /Origin/i);
    assert.match(response.headers.get('access-control-allow-headers') ?? '', /Authorization/i);
    assert.equal(h.calls.length, 0);
  } finally { await h.close(); }
});

test('FUSE envelopes reject oversized bodies, invalid JSON, untyped input paths and executable additions', async () => {
  const h = await harness();
  try {
    const body = JSON.stringify({ spec: defaultRunSpec() });
    assert.equal((await h.send('/v1/jobs', 'POST', body, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await h.send('/v1/jobs', 'POST', ' '.repeat(130000))).status, 413);
    for (const value of [null, [], { spec: defaultRunSpec(), command: 'cmd.exe' },
      { spec: defaultRunSpec(), inputPath: '../../private.json' },
      { spec: defaultRunSpec(), inputUrl: 'https://attacker.invalid/data' },
      { spec: { ...defaultRunSpec(), environment: {} } }]) {
      assert.equal((await h.send('/v1/jobs', 'POST', JSON.stringify(value))).status, 400);
    }
    assert.equal((await h.send('/v1/jobs', 'POST', '{"spec":')).status, 400);
    assert.equal(h.calls.length, 0);
  } finally { await h.close(); }
});

test('FUSE retries are idempotent within the current session and conflicting bodies cannot execute', async () => {
  const h = await harness();
  try {
    const spec = defaultRunSpec(), body = JSON.stringify({ spec });
    const first = await h.send('/v1/jobs', 'POST', body);
    assert.equal(first.status, 202);
    const submitted = await first.json(); assert.equal(submitted.id, jobId); assert.equal(submitted.engineId, 'fuse');
    const retry = await h.send('/v1/jobs', 'POST', body);
    assert.equal(retry.status, 200); assert.equal((await retry.json()).id, jobId);
    assert.equal(h.calls.filter(c => c.name === 'submit').length, 1);
    assert.deepEqual(h.calls.find(c => c.name === 'submit')!.args[0], spec);
    assert.equal((await h.send('/v1/jobs', 'POST', JSON.stringify({ spec: { ...spec, model: 'GKNN' } }))).status, 409);
    assert.equal(h.calls.filter(c => c.name === 'submit').length, 1);
  } finally { await h.close(); }
});

test('FUSE validation does not launch work and both validate/submit reject unsupported uploaded data', async () => {
  const h = await harness();
  try {
    const checked = await h.send('/v1/validate', 'POST', JSON.stringify({ spec: defaultRunSpec() }));
    assert.equal(checked.status, 200); assert.equal((await checked.json()).valid, true);
    for (const route of ['/v1/validate', '/v1/jobs']) {
      const response = await h.send(route, 'POST', JSON.stringify({ spec: defaultRunSpec(),
        snapshot: { authority: 'observed', filename: '../../untrusted.json' } }));
      assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'FUSE_INPUT_NOT_SUPPORTED' });
    }
    assert.equal(h.calls.length, 0);
  } finally { await h.close(); }
});

test('concurrent FUSE submissions cannot create two attempts while the first submission is pending', async () => {
  let release!: () => void; let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const h = await harness({ submit: async () => { entered(); await blocked; return { id: jobId, completion: Promise.resolve(completed()) }; } });
  try {
    const body = JSON.stringify({ spec: defaultRunSpec() });
    const first = h.send('/v1/jobs', 'POST', body);
    assert.equal(await Promise.race([started.then(() => null), first]), null, 'FUSE must reach the injected service');
    assert.equal((await h.send('/v1/jobs', 'POST', body, { 'Idempotency-Key': 'fuse-boundary-test-key-0002' })).status, 409);
    assert.equal(h.calls.filter(c => c.name === 'submit').length, 1);
    release(); assert.equal((await first).status, 202);
  } finally { release(); await h.close(); }
});

test('unreconciled completion retains global capacity until descendant termination is established', async () => {
  const h = await harness({ submit: async () => ({ id: jobId, completion: Promise.resolve({
    ...completed(), state: 'reconciliation-required', processStopped: false, exitCode: null,
  }) }) });
  try {
    const body = JSON.stringify({ spec: defaultRunSpec() });
    assert.equal((await h.send('/v1/jobs', 'POST', body)).status, 202);
    assert.equal((await h.send('/v1/jobs', 'POST', body, { 'Idempotency-Key': 'fuse-boundary-test-key-0002' })).status, 409);
    assert.equal(h.calls.filter(c => c.name === 'submit').length, 1);
  } finally { await h.close(); }
});

test('gateway endpoint normalization rejects credentials, request paths and nonlocal plaintext', () => {
  assert.equal(normalizeFuseGatewayEndpoint(' http://127.0.0.1:8791/ '), 'http://127.0.0.1:8791');
  for (const value of ['file:///C:/private', 'http://192.168.1.2:8791', 'http://attacker.invalid:8791',
    'https://user:password@example.invalid', 'http://127.0.0.1:8791/v1/jobs',
    'http://127.0.0.1:8791?token=untrusted', 'http://127.0.0.1:8791#token']) {
    assert.throws(() => normalizeFuseGatewayEndpoint(value));
  }
});

test('oversized chunked responses cancel their stream rather than only releasing the reader', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('123456789')); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readGatewayJson(response, 8), /GATEWAY_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled, true);
});

test('oversized declared Content-Length cancels the unread response stream', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }),
    { headers: { 'Content-Length': '9' } });
  await assert.rejects(readGatewayJson(response, 8), /GATEWAY_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled, true);
});

test('FUSE result routing preserves identity and unestablished assessment without exposing a publish operation', async () => {
  const h = await harness();
  try {
    const response = await h.send(`/v1/jobs/${jobId}/result`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), h.resultFixture);
    assert.deepEqual(h.calls, [{ name: 'collect', args: [jobId] }]);
    for (const route of ['/v1/publish', `/v1/jobs/${jobId}/publish`, '/v1/upload-code']) {
      assert.equal((await h.send(route, 'POST', '{}')).status, 404);
    }
    assert.equal(h.calls.length, 1);
  } finally { await h.close(); }
});

test('FUSE cancellation stays cooperative and errors do not reveal private filesystem diagnostics', async () => {
  const h = await harness({ collect: async () => { throw new Error('C:/private/Fuse/run.log contains sensitive diagnostics'); } });
  try {
    assert.equal((await h.send(`/v1/jobs/${jobId}`)).status, 200);
    const cancelled = await h.send(`/v1/jobs/${jobId}/cancel`, 'POST');
    assert.equal(cancelled.status, 202); assert.deepEqual(await cancelled.json(), { id: jobId, state: 'cancellation-requested' });
    assert.equal((await h.send(`/v1/jobs/${jobId}/cancel`)).status, 404);
    const failed = await h.send(`/v1/jobs/${jobId}/result`);
    assert.equal(failed.status, 400); assert.deepEqual(await failed.json(), { error: 'REQUEST_FAILED' });
  } finally { await h.close(); }
});

test('real published projection fixtures reject cross-run mixing, missing bindings and invalid units', async () => {
  const bundles = JSON.parse(readFileSync(new URL('../app/simulations/data/physics-bundles.json', import.meta.url), 'utf8'));
  const bundle = bundles[0];
  const physics = JSON.parse(gunzipSync(readFileSync(new URL(`../public${bundle.path}`, import.meta.url))).toString());
  const runs = JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json', import.meta.url), 'utf8'));
  const run = runs.find((value: { id: string }) => value.id === bundle.runId);
  assert.ok(run);
  const runSpec = { ...defaultRunSpec(), recipe: 'diiid-default-stationary' as const };
  const runSpecSha256 = createHash('sha256').update(`${JSON.stringify(runSpec, null, 2)}\n`).digest('hex');
  run.source.artifacts.find((value: { name: string }) => value.name === 'run-spec.json').sha256 = runSpecSha256;
  // This wraps approved published fixtures in the gateway's metadata shape;
  // it does not assert that a real gateway collector ran during this test.
  const fixture = { schema: 'fuse-job-result.v1', runSpec, run, physics, verification: {
    authority: 'local-gateway-verified', manifestSha256: run.source.recordSha256,
    runSpecSha256,
    physicsSha256: run.source.artifacts.find((value: { name: string }) => value.name === 'physics.json').sha256,
    nativeSha256: run.source.artifacts.find((value: { name: string }) => value.name === 'dd-native.h5').sha256,
  } };
  assert.equal((await parseFuseCollectedResult(fixture)).run.id, bundle.runId);
  const wrongRun = structuredClone(fixture); wrongRun.physics.runId = 'another-fuse-run';
  await assert.rejects(parseFuseCollectedResult(wrongRun), /IDENTITY_MISMATCH/);
  const noBinding = structuredClone(fixture);
  noBinding.run.source.artifacts = noBinding.run.source.artifacts.filter((value: { name: string }) => value.name !== 'physics.json');
  await assert.rejects(parseFuseCollectedResult(noBinding), /PHYSICS_UNBOUND/);
  const wrongUnit = structuredClone(fixture); wrongUnit.physics.profiles[0].unit = 'unqualified';
  await assert.rejects(parseFuseCollectedResult(wrongUnit), /PHYSICS/);
  const wrongDigest = structuredClone(fixture); wrongDigest.verification.physicsSha256 = '0'.repeat(64);
  await assert.rejects(parseFuseCollectedResult(wrongDigest), /VERIFICATION_MISMATCH/);
  await assert.rejects(parseFuseCollectedResult({ ...fixture, privatePath: 'C:/private' }), /INVALID_FUSE_JOB_RESULT/);
});

test('anonymous web catalog remains read-only and does not import local execution code', () => {
  const source = readFileSync(new URL('../app/api/simulations/catalog/route.ts', import.meta.url), 'utf8');
  assert.match(source, /anonymousExecution:\s*false/);
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(source, /engine-service|fuse-service|local-runner|node:child_process/);
});
