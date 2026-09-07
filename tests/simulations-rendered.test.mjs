import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
async function render(locale, query = '') {
  const { default: worker } = await import('../dist/server/index.js');
  return worker.fetch(new Request('http://localhost/simulations' + query, { headers: { accept: 'text/html', cookie: `fusiondigital_locale=${locale}` } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}
test('simulation route renders genuine result values and navigation in Chinese', async () => {
  const response = await render('zh-CN'); assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /仿真引擎/); assert.match(html, /FPP/); assert.match(html, /DIII-D/); assert.match(html, /SIMULATED/);
  const first=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8'))[0];
  const n=first.metrics[0].value;
  const displayed=Math.abs(n)>=1e6?n.toExponential(3):new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n);
  assert.ok(html.includes(displayed));
  assert.equal((html.match(/aria-current="page"[^>]*data-primary-nav="simulations"/g) ?? []).length, 2);
  assert.match(html, /导入结果/); assert.match(html, /计算引擎/); assert.match(html, /未验证/);
  assert.doesNotMatch(html, /D:\\Code\\Fuse|extracted-summary.*Stacktrace/);
});
test('TORAX route exposes real catalog metrics, all recipe groups and English localization', async () => {
  for (const locale of ['zh-CN', 'en']) {
    const response = await render(locale, '?engine=torax'); assert.equal(response.status, 200);
    const html = await response.text();
    const presentation = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '');
    assert.match(presentation, /TORAX/); assert.match(presentation, /STEP/); assert.match(presentation, /SIMULATED/); assert.match(presentation, /8\/8/);
    const entry = JSON.parse(readFileSync(new URL('../app/simulations/data/transport-runs.json', import.meta.url), 'utf8')).find(e => e.recipe === 'iter-hybrid');
    const metric = entry.metrics.find(m => m.id === 'fusion_power');
    assert.ok(presentation.includes(new Intl.NumberFormat('en-US', { maximumSignificantDigits: 5 }).format(metric.value * 1e-6)));
    if (locale === 'en') assert.doesNotMatch(presentation, /\p{Script=Han}/u);
  }
});
test('engine collaboration explains actual transferred fields and future coupling boundary', async () => {
  const response = await render('en', '?engine=workflow'); assert.equal(response.status, 200);
  const html = await response.text(); assert.match(html, /Te, Ti and ne/); assert.match(html, /not a self-consistent/); assert.match(html, /future runtime/);
});
test('English simulation surface has no source-language presentation leakage', async () => {
  const response = await render('en'); assert.equal(response.status, 200);
  const html = await response.text();
  const presentation = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '');
  assert.doesNotMatch(presentation, /\p{Script=Han}/u); assert.doesNotMatch(presentation, /Technical annotation/);
  assert.match(presentation, /Simulation Engines/); assert.match(presentation, /Configure &amp; run/); assert.match(presentation, /Not validated/);
});
