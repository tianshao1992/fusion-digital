// Explicit, opt-in real-engine integration test. Requires the pinned TORAX runtime.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createGateway } from './gateway.mts';
import { defaultEngineSpec, parseTransportResult } from '../../app/simulations/platform/contracts.ts';
import { mkdir, writeFile, readFile, cp, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { attemptPath, project, json } from './engine-service.mts';
const token = randomBytes(32).toString('hex'); // Never logged or persisted.
const gateway = createGateway(token, 'http://localhost:3012');
await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function request(route: string, method = 'GET', body?: unknown, key?: string) {
  const response = await fetch(base + route, { method, headers: { ...headers, ...(key ? { 'Idempotency-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json(); assert.ok(response.ok, `${response.status}: ${JSON.stringify(value)}`); return value;
}
async function terminal(id: string) {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const job = await request(`/v1/jobs/${id}`);
    if (!['queued', 'starting', 'running'].includes(job.state)) return job;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await request(`/v1/jobs/${id}/cancel`, 'POST');
  throw new Error('INTEGRATION_TIMEOUT_CANCEL_REQUESTED');
}
try {
  const spec = defaultEngineSpec('basic'); spec.parameters.duration = .1; spec.resources.cpus = 2;
  const key = randomBytes(16).toString('hex');
  const created = await request('/v1/jobs', 'POST', { spec }, key);
  assert.equal((await request('/v1/jobs', 'POST', { spec }, key)).id, created.id);
  const success = await terminal(created.id); assert.equal(success.state, 'succeeded'); assert.equal(success.processStopped, true);
  const r = parseTransportResult(await request(`/v1/jobs/${created.id}/result`)); assert.equal(r.id, created.id); assert.equal(r.time.values.at(-1), .1);
  // Copy the immutable smoke attempt into a disposable fixture before tampering.
  await mkdir(path.join(project, 'tmp'), { recursive: true });
  const fixture = await mkdtemp(path.join(project, 'tmp/torax-integrity-'));
  const fixtureAttempt = path.join(fixture, 'local/platform-runs', created.id);
  await cp(attemptPath(created.id), fixtureAttempt, { recursive: true });
  const bytes = await readFile(path.join(fixtureAttempt, 'native.nc')); bytes[30] ^= 1;
  await writeFile(path.join(fixtureAttempt, 'native.nc'), bytes);
  let rejected = false;
  try { execFileSync(process.execPath, ['--import', 'tsx', 'scripts/simulations/engine-cli.mts', 'collect', created.id], { cwd: project, env: { ...process.env, TORAX_WORKSPACE: fixture }, stdio: 'pipe', windowsHide: true }); }
  catch (error) { rejected = String((error as { stderr: Buffer }).stderr).includes('MANIFEST_INTEGRITY'); }
  assert.equal(rejected, true);
  // Independent immutable attempt, cancellation through the same authenticated API.
  const cancelled = await request('/v1/jobs', 'POST', { spec: defaultEngineSpec('step-flat-top') }, randomBytes(16).toString('hex'));
  await request(`/v1/jobs/${cancelled.id}/cancel`, 'POST');
  const stopped = await terminal(cancelled.id); assert.equal(stopped.state, 'cancelled'); assert.equal(stopped.processStopped, true);
  const evidence = { schema: 'torax-integration-verification.v1', checkedAt: new Date().toISOString(), success, stopped, manifestTamperRejected: rejected, idempotentSubmission: true, resultContractPassed: true, nativeResultsPublished: false };
  await mkdir(path.join(project, 'output/simulations'), { recursive: true });
  await writeFile(path.join(project, 'output/simulations/torax-integration-verification.json'), json(evidence));
  console.log(json(evidence));
} finally { await new Promise<void>((resolve, reject) => gateway.close(e => e ? reject(e) : resolve())); }
