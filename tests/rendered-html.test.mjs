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
  assert.match(html, /href="\/ai"/);
  assert.match(html, /href="\/facilities"/);
  assert.match(html, /fusiondigital-mark\.png/);
  assert.match(html, /class="brandWordmark"/);
  assert.match(html, /class="brandFusion">Fusion/);
  assert.match(html, /class="brandDigital">Digital/);
  assert.match(html, /TOOLCHAINS/);
  assert.match(html, /fusion-twin-ai-native-overview\.png/);
  assert.match(html, /class="heroTitleValues">成本可控/);
  assert.match(html, /<figcaption class="srOnly">聚变、数字孪生与智能体关系图/);
  assert.match(html, /loading="lazy" decoding="async"/);
  assert.match(html, /权限、安全与物理约束门/);
  assert.match(html, /成本可控 · 高效运行 · 可靠可用 · 安全可证/);
  assert.match(html, /LIFECYCLE COST CONTROL · EFFICIENT OPERATION · RELIABLE AVAILABILITY · EVIDENCE-BASED SAFETY/);
  assert.match(html, /能量转化/);
  assert.match(html, /ENERGY CONVERSION/);
  assert.match(html, /包层热取出、一次\/二次回路/);
  assert.match(html, /辅机模拟/);
  assert.match(html, /人机交互/);
  assert.match(html, /总体集成/);
  assert.match(html, /WHOLE-PLANT INTEGRATION/);
  for (const figure of [
    'domain-physics-dark-image2.png',
    'domain-engineering-dark-image2.png',
    'domain-integrated-control-dark-image2.png',
    'domain-intelligent-diagnostics-dark-image2.png',
    'domain-energy-conversion-dark-image2.png',
    'domain-auxiliary-systems-dark-image2.png',
    'domain-human-machine-interaction-dark-image2.png',
    'domain-data-foundation-dark-image2.png',
    'domain-whole-plant-integration-dark-image2.png',
    'domain-ai-native-dark-image2.png',
  ]) assert.match(html, new RegExp(figure.replaceAll('.', '\\.')));
  assert.doesNotMatch(html, /发电系统|POWER SYSTEMS|本质安全/);
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
  assert.match(html, /phase1-engineering-twin-trust-chain\.png/);
  assert.match(html, /xjtu-engineering-digital-twin-phase1-brief\.docx/);
  assert.match(html, /target="_blank"/);
});

test('server-renders the device construction-status observatory', async () => {
  const html = await htmlFor('/facilities');
  assert.match(html, /EXL-50U/);
  assert.match(html, /EHL-2/);
  assert.match(html, /ITER/);
  assert.match(html, /SPARC/);
  assert.match(html, /BEST/);
  assert.match(html, /target="_blank"/);
});

test('server-renders the AI-native fusion digital twin research page', async () => {
  const html = await htmlFor('/ai');
  assert.match(html, /FusionMAE/);
  assert.match(html, /TokaMind/);
  assert.match(html, /AI AGENTS/);
  assert.match(html, /FUSION · TWIN · AGENT LOOP/);
  assert.match(html, /target="_blank"/);
});
