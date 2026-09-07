import assert from 'node:assert/strict';
import test from 'node:test';
test('diagnostic route resolves to its own bilingual case selector and retains simulation authority', async () => {
  const { default: worker } = await import('../dist/server/index.js');
  for (const locale of ['zh-CN', 'en']) {
    const response = await worker.fetch(new Request('http://localhost/simulations?engine=diagnostics', { headers: { accept: 'text/html', cookie: `fusiondigital_locale=${locale}` } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    const html = await response.text();
    const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '');
    assert.match(text, /CHERAB 1.5.0/); assert.match(text, /SYNTHETIC/);
    assert.match(text, /DIII-D-derived/); assert.match(text, /ITER hybrid/);
    assert.doesNotMatch(text, /D:\\Code|\.venv-wsl/);
    assert.match(text, locale === 'en' ? /Physics–diagnostic loop/ : /物理—诊断闭环/);
    if (locale === 'en') assert.doesNotMatch(text, /\p{Script=Han}/u);
    assert.match(html, /aria-pressed="true"[^>]*>[^<]*CHERAB–Raysect/);
  }
});
