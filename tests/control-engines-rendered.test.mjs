import assert from 'node:assert/strict';
import test from 'node:test';

for (const engine of ['dina', 'fge']) for (const locale of ['zh-CN', 'en']) test(`${engine} ${locale}: independent engine route, cloud boundary and blocked TORAX interface`, async () => {
  const { default: worker } = await import('../dist/server/index.js');
  const response = await worker.fetch(new Request(`http://localhost/simulations?engine=${engine}`, { headers: { accept: 'text/html', cookie: `fusiondigital_locale=${locale}` } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200); const html = await response.text();
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '');
  assert.match(text, new RegExp(engine.toUpperCase())); assert.match(text, /SIMULATED/); assert.match(text, /TORAX/); assert.match(text, /BLOCKED/);
  assert.match(text, /HISTORICAL REPLAY/);
  assert.match(text, engine === 'dina' ? /16 ms/ : /100 ms/);
  if (engine === 'fge') assert.match(text, locale === 'en' ? /native unit \(unverified\)/ : /原生单位（未核实）/);
  assert.match(html, /type="password"/); assert.doesNotMatch(html, /D:\\Code|docker\.sock|GATEWAY_TOKEN/);
  if (locale === 'en') { assert.doesNotMatch(text, /\p{Script=Han}/u); assert.match(text, /No public cloud run has passed/); assert.match(text, /zero-voltage baseline/); }
  else assert.match(text, /本版尚无通过新合同校验/);
});
