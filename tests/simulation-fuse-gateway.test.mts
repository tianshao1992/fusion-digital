import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { defaultRunSpec } from '../app/simulations/run-spec.ts';
import * as transportRuntime from '../scripts/simulations/engine-service.mts';
import * as fuseRuntime from '../scripts/simulations/fuse-engine-service.mts';
import { createGateway } from '../scripts/simulations/gateway.mts';

test('FUSE jobs use the unified gateway and unresolved descendants retain the global lease', async () => {
  const token = randomBytes(32).toString('hex');
  let finish!: (status: fuseRuntime.FuseJobStatus) => void;
  const completion = new Promise<fuseRuntime.FuseJobStatus>(resolve => { finish = resolve; });
  const fuseService = {
    ...fuseRuntime,
    submit: async () => ({ id: 'fuse-diiid-gateway-test', completion }),
    status: async () => ({ schema: 'engine-job.v1' as const, id: 'fuse-diiid-gateway-test', engineId: 'fuse' as const, state: 'running', processStopped: false, exitCode: null, elapsedSeconds: 1 }),
    cancel: async () => ({ id: 'fuse-diiid-gateway-test', engineId: 'fuse' as const, state: 'cancellation-requested' as const }),
    collect: async () => ({ schema: 'fuse-job-result.v1' as const, run: {}, physics: {}, coordinateMap: {}, verification: { authority: 'local-gateway-verified' as const } }),
  };
  const server = createGateway(token, 'https://fusiondigital.example', transportRuntime, fuseService as unknown as typeof fuseRuntime);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: `Bearer ${token}`, Origin: 'https://fusiondigital.example', 'Content-Type': 'application/json' };
  const submit = (key: string) => fetch(`${base}/v1/jobs`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify({ spec: defaultRunSpec() }) });
  try {
    const catalog = await (await fetch(`${base}/v1/catalog`, { headers })).json();
    assert.deepEqual(catalog.executionEngineIds, ['fuse', 'torax']);
    assert.equal((await fetch(`${base}/v1/catalog?unexpected=1`, { headers })).status, 400);
    assert.equal((await submit('fuse-gateway-key-0001')).status, 202);
    assert.equal((await fetch(`${base}/v1/jobs/fuse-diiid-gateway-test`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/v1/jobs/fuse-diiid-gateway-test/cancel`, { method: 'POST', headers })).status, 202);
    assert.equal((await fetch(`${base}/v1/jobs/fuse-diiid-gateway-test/result`, { headers })).status, 200);
    assert.equal((await submit('fuse-gateway-key-0002')).status, 409);
    finish(fuseRuntime.reconciledStatus('fuse-diiid-gateway-test'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await submit('fuse-gateway-key-0003')).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('an explicitly configured reverse-proxy Host is exact and does not change loopback binding', async () => {
  const token = randomBytes(32).toString('hex');
  assert.throws(() => createGateway(token, 'https://fusiondigital.example', transportRuntime, fuseRuntime, 'compute.example/path'));
  assert.throws(() => createGateway(token, 'http://compute.example', transportRuntime, fuseRuntime));
  const server = createGateway(token, 'https://fusiondigital.example', transportRuntime, fuseRuntime, 'compute.example:443');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: address.port, path: '/v1/catalog', headers: { Host: 'compute.example:443', Origin: 'https://fusiondigital.example', Authorization: `Bearer ${token}` } }, response => {
        response.resume(); resolve(response.statusCode);
      });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 200);
    assert.equal(address.address, '127.0.0.1');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
