import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGateway } from '../scripts/simulations/gateway.mts';
import * as runtime from '../scripts/simulations/engine-service.mts';
import { defaultEngineSpec } from '../app/simulations/platform/contracts.ts';

test('gateway enforces auth, origin, bounded schema, idempotency and read-only public boundary', async () => {
  const token = randomBytes(32).toString('hex'); let submits = 0;
  const server = createGateway(token, 'http://localhost:3012', { ...runtime, submit: async () => {
    submits++; return { id: 'torax-test-run', completion: Promise.resolve({ schema: 'engine-job.v1', id: 'torax-test-run', state: 'succeeded', processStopped: true, exitCode: 0, elapsedSeconds: 1 }) };
  } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: `Bearer ${token}`, Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'Idempotency-Key': 'platform-test-key-0001' };
  try {
    assert.equal((await fetch(base + '/v1/catalog')).status, 401);
    assert.equal((await fetch(base + '/v1/catalog', { headers: { ...headers, Origin: 'https://attacker.invalid' } })).status, 403);
    const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base + '/v1/catalog', { headers: { ...headers, Host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end();
    });
    assert.equal(hostileHost, 403);
    const catalog = await fetch(base + '/v1/catalog', { headers }); assert.equal(catalog.status, 200);
    assert.deepEqual((await catalog.json()).executionEngineIds, ['fuse', 'torax']);
    assert.equal((await fetch(base + '/v1/jobs', { method: 'POST', headers, body: JSON.stringify({ spec: { ...defaultEngineSpec(), command: 'shell' } }) })).status, 400);
    const body = JSON.stringify({ spec: defaultEngineSpec() });
    assert.equal((await fetch(base + '/v1/jobs', { method: 'POST', headers, body })).status, 202);
    assert.equal((await fetch(base + '/v1/jobs', { method: 'POST', headers, body })).status, 200);
    assert.equal(submits, 1);
    assert.equal((await fetch(base + '/v1/jobs', { method: 'POST', headers, body: JSON.stringify({ spec: defaultEngineSpec('basic') }) })).status, 409);
    assert.equal((await fetch(base + '/v1/jobs', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'platform-test-key-0002' }, body: ' '.repeat(130000) })).status, 413);
    assert.equal((await fetch(base + '/v1/jobs/bad/../../secrets', { headers })).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
