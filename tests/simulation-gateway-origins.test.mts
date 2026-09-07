import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createGateway, parseGatewayOrigins } from '../scripts/simulations/gateway.mts';
import * as runtime from '../scripts/simulations/engine-service.mts';
import * as fuseRuntime from '../scripts/simulations/fuse-engine-service.mts';
import releaseContract from '../deploy/formal-release-contract.json' with { type: 'json' };

const productionOrigin = 'https://fusiondigital.club';
const productionWwwOrigin = 'https://www.fusiondigital.club';
const sitesFixtureOrigin = releaseContract.sites.platformUrl;
const localOrigin = 'http://localhost:5177';

test('gateway origin configuration is an explicit bounded allowlist', () => {
  assert.deepEqual(
    parseGatewayOrigins(`${localOrigin}, ${productionOrigin},${productionWwwOrigin},${sitesFixtureOrigin}`),
    [localOrigin, productionOrigin, productionWwwOrigin, sitesFixtureOrigin],
  );
  assert.deepEqual(parseGatewayOrigins(productionOrigin), [productionOrigin]);

  for (const invalid of [
    '',
    `${productionOrigin},`,
    `${productionOrigin},${productionOrigin}`,
    'http://fusiondigital.club',
    'https://fusiondigital.club/path',
    'https://fusiondigital.club?query=1',
    'https://fusiondigital.club/#fragment',
    'https://user@fusiondigital.club',
    'https://*.chatgpt.site',
  ]) assert.throws(() => parseGatewayOrigins(invalid));

  assert.throws(() => parseGatewayOrigins(
    Array.from({ length: 17 }, (_, index) => `https://origin-${index}.example`),
  ), /between 1 and 16/);
});

test('gateway echoes only the requesting allowlisted origin and rejects every other origin', async () => {
  const token = randomBytes(32).toString('hex');
  const allowedOrigins = [localOrigin, productionOrigin, productionWwwOrigin, sitesFixtureOrigin];
  const server = createGateway(token, allowedOrigins, runtime, fuseRuntime);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    for (const origin of allowedOrigins) {
      const response = await fetch(`${base}/v1/catalog`, {
        headers: { Authorization: `Bearer ${token}`, Origin: origin },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.match(response.headers.get('vary') ?? '', /Origin/u);
    }

    const preflight = await fetch(`${base}/v1/jobs`, {
      method: 'OPTIONS',
      headers: {
        Origin: sitesFixtureOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), sitesFixtureOrigin);

    const hostile = await fetch(`${base}/v1/catalog`, {
      headers: { Authorization: `Bearer ${token}`, Origin: 'https://attacker.invalid' },
    });
    assert.equal(hostile.status, 403);
    assert.equal(hostile.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await hostile.json(), { error: 'ORIGIN_REJECTED' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
