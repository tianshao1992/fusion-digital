// Opt-in real HTTP + uploaded-profile + WSL/TORAX integration. No secrets are logged.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createGateway } from './gateway.mts';
import { createFuseSnapshot, json } from './engine-service.mts';
import { defaultEngineSpec } from '../../app/simulations/platform/contracts.ts';
import { matchResult, parseJob, parseSubmission, requestCompute, snapshotDigest } from '../../app/simulations/platform/compute-client.ts';
import { parseTransportGeometry, crossSectionCells } from '../../app/simulations/platform/geometry.ts';

const token = randomBytes(32).toString('hex');
let gateway = createGateway(token, ['http://localhost:3012', 'https://fusiondigital.club']);
const start = async () => { await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`; };
let endpoint = await start();
const request = (route: string, options: Parameters<typeof requestCompute>[3] = {}) => requestCompute(endpoint, token, route, options);
try {
  const snapshot = await createFuseSnapshot();
  const spec = defaultEngineSpec('fuse-profile-handoff', { profileSnapshotSha256: await snapshotDigest(snapshot) });
  spec.parameters.duration = .1; spec.resources.cpus = 2; spec.resources.timeoutSeconds = 120;
  const body = JSON.stringify({ spec, snapshot }), key = randomBytes(16).toString('hex');
  await request('/v1/validate', { method: 'POST', body });
  const id = parseSubmission(await request('/v1/jobs', { method: 'POST', body, key }));
  assert.equal(parseSubmission(await request('/v1/jobs', { method: 'POST', body, key })), id);
  const deadline = Date.now() + 150_000;
  let job;
  while (Date.now() < deadline) {
    job = parseJob(await request(`/v1/jobs/${id}`), id);
    if (!['queued', 'starting', 'running'].includes(job.state)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!job?.processStopped) { await request(`/v1/jobs/${id}/cancel`, { method: 'POST' }); throw new Error('SMOKE_TIMEOUT_CANCEL_REQUESTED'); }
  assert.equal(job.state, 'succeeded');
  const result = matchResult(await request(`/v1/jobs/${id}/result`), id, spec);
  const geometry = parseTransportGeometry(await request(`/v1/jobs/${id}/geometry`));
  assert.equal(geometry.sourceNativeSha256, result.provenance.nativeSha256);
  assert.ok(crossSectionCells(geometry, result, 'te', result.execution.steps).length > 0);
  assert.equal(result.time.values.at(-1), .1);
  assert.equal(result.referenceProfiles?.source.runId, snapshot.source.runId);
  // Recreate the HTTP service: stored job/result recovery must survive its restart.
  await new Promise<void>(resolve => gateway.close(() => resolve()));
  gateway = createGateway(token, 'https://fusiondigital.club'); endpoint = await start();
  assert.equal(parseJob(await request(`/v1/jobs/${id}`), id).state, 'succeeded');
  assert.equal(matchResult(await request(`/v1/jobs/${id}/result`), id, spec).id, id);
  const evidence = { checkedAt: new Date().toISOString(), id, uploadedProfiles: true, idempotentSubmission: true, serviceRestartRecovery: true, resultMatchesSpec: true, geometry: geometry.kind, profileSource: snapshot.source.runId, steps: result.execution.steps, elapsedSeconds: job.elapsedSeconds, browserInteractionTested: false };
  await mkdir('output/simulations', { recursive: true });
  await writeFile('output/simulations/torax-remote-verification.json', json(evidence));
  console.log(json(evidence));
} finally { await new Promise<void>(resolve => gateway.close(() => resolve())); }
