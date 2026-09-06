import assert from 'node:assert/strict';
import test from 'node:test';
async function render(locale) {
  const { default: worker } = await import('../dist/server/index.js');
  return worker.fetch(new Request('http://localhost/simulations', { headers: { accept: 'text/html', cookie: `fusiondigital_locale=${locale}` } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}
test('simulation route renders genuine result values and navigation in Chinese', async () => {
  const response = await render('zh-CN'); assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /仿真模拟/); assert.match(html, /FPP/); assert.match(html, /449\.326/); assert.match(html, /SIMULATED/);
  assert.equal((html.match(/aria-current="page"[^>]*data-primary-nav="simulations"/g) ?? []).length, 2);
  assert.match(html, /导入结果/); assert.match(html, /工况配置/); assert.match(html, /未验证/);
  assert.doesNotMatch(html, /D:\\Code\\Fuse|extracted-summary.*Stacktrace/);
});
test('English simulation surface has no source-language presentation leakage', async () => {
  const response = await render('en'); assert.equal(response.status, 200);
  const html = await response.text();
  const presentation = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '');
  assert.doesNotMatch(presentation, /\p{Script=Han}/u); assert.doesNotMatch(presentation, /Technical annotation/);
  assert.match(presentation, /Simulations/); assert.match(presentation, /Configure study/); assert.match(presentation, /Not validated/);
});
