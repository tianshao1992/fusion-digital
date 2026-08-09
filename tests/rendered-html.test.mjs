import assert from 'node:assert/strict';
import test from 'node:test';

async function render(pathname = '/') {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('test', `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: 'text/html' } }),
    { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function htmlFor(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
  return response.text();
}

test('server-renders the FusionDigital community portal', async () => {
  const html = await htmlFor('/');
  assert.match(html, /FusionDigital/);
  assert.match(html, /href="\/physics"/);
  assert.match(html, /href="\/engineering"/);
  assert.match(html, /href="\/facilities"/);
  assert.match(html, /fusiondigital-mark\.png/);
});

test('server-renders the physics simulation atlas', async () => {
  const html = await htmlFor('/physics');
  assert.match(html, /fusion-physics-simulation-report\.pdf/);
  assert.match(html, /integrated-twin-reference-architecture-nature\.png/);
  assert.match(html, /href="\/engineering"/);
});

test('server-renders the Tokamak engineering atlas with external tool links', async () => {
  const html = await htmlFor('/engineering');
  assert.match(html, /Tokamak/);
  assert.match(html, /55/);
  assert.match(html, /tokamak-engineering-simulation-report\.pdf/);
  assert.match(html, /engineering-twin-architecture-nature\.png/);
  assert.match(html, /target="_blank"/);
});

test('server-renders the device construction-status observatory', async () => {
  const html = await htmlFor('/facilities');
  assert.match(html, /ITER/);
  assert.match(html, /SPARC/);
  assert.match(html, /BEST/);
  assert.match(html, /target="_blank"/);
});
