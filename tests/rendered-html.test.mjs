import assert from 'node:assert/strict';
import test from 'node:test';

async function render(pathname='/') {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('test', `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: 'text/html' } }),
    { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test('server-renders the physics atlas and engineering navigation', async () => {
  const response = await render('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /聚变模拟图谱/);
  assert.match(html, /href="\/engineering"/);
  assert.match(html, /fusion-physics-simulation-report\.pdf/);
});

test('server-renders the Tokamak engineering simulation page', async () => {
  const response = await render('/engineering');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Tokamak 工程仿真图谱/);
  assert.match(html, /55 个工具与平台组/);
  assert.match(html, /tokamak-engineering-simulation-report\.pdf/);
  assert.match(html, /engineering-twin-architecture-nature\.png/);
});
