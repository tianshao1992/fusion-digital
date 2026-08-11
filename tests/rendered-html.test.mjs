import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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

test('ships non-empty reports and structured download assets', async () => {
  const assets = [
    '../public/fusion-physics-simulation-report.docx',
    '../public/fusion-physics-simulation-report.pdf',
    '../public/tokamak-engineering-simulation-report.docx',
    '../public/tokamak-engineering-simulation-report.pdf',
    '../public/fusion-ai-native-research-report.docx',
    '../public/fusion-ai-native-paper-code-index.csv',
    '../public/data/fusion-ai-native-landscape.json',
    '../public/fusion-integrated-control-research-report.docx',
    '../public/fusion-control-paper-code-index.csv',
    '../public/fusion-control-references.bib',
    '../public/data/fusion-control-landscape.json',
    '../public/data/fusion-control-device-profiles.json',
    '../public/models/paramak-tokamak-demo/paramak-tokamak-demo.step',
    '../public/models/paramak-tokamak-demo/paramak-tokamak-demo.glb',
    '../public/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png',
    '../public/models/paramak-tokamak-demo/PARAMAK-LICENSE.txt',
    '../public/models/paramak-tokamak-demo/model-manifest.json',
  ];
  for (const asset of assets) {
    const info = await stat(new URL(asset, import.meta.url));
    assert.ok(info.isFile(), `${asset} must be a file`);
    assert.ok(info.size > 0, `${asset} must not be empty`);
  }

  const landscape = JSON.parse(
    await readFile(new URL('../public/data/fusion-ai-native-landscape.json', import.meta.url), 'utf8'),
  );
  assert.ok(landscape.entries.length > 0);
  assert.equal(landscape.statistics.total, landscape.entries.length);

  const controlLandscape = JSON.parse(
    await readFile(new URL('../public/data/fusion-control-landscape.json', import.meta.url), 'utf8'),
  );
  const controlDevices = JSON.parse(
    await readFile(new URL('../public/data/fusion-control-device-profiles.json', import.meta.url), 'utf8'),
  );
  assert.ok(controlLandscape.entries.length >= 80);
  assert.equal(controlLandscape.statistics.total, controlLandscape.entries.length);
  assert.equal(new Set(controlLandscape.entries.map((item) => item.id)).size, controlLandscape.entries.length);
  assert.equal(new Set(controlLandscape.entries.map((item) => item.projectId)).size, controlLandscape.entries.length);
  assert.ok(controlLandscape.entries.every((item) => item.papers.length > 0));
  assert.ok(controlLandscape.entries.every((item) => item.papers.every((paper) => paper.year > 0)));
  assert.ok(controlLandscape.entries.every((item) => item.code.every((artifact) => artifact.status !== 'not-public' || artifact.url === null)));
  const byId = Object.fromEntries(controlLandscape.entries.map((item) => [item.id, item]));
  assert.equal(byId['CPT-010'].primaryTask, 'T4');
  assert.equal(byId['CPT-031'].primaryTask, 'T0');
  assert.equal(byId['CPT-043'].primaryTask, 'T0');
  assert.equal(byId['PCS-039'].primaryTask, 'T0');
  assert.equal(byId['PCS-039'].evidenceLevel, 'E4');
  assert.equal(byId['CPT-049'].evidenceLevel, 'E2');
  assert.deepEqual(controlLandscape.entries.filter((item) => item.deploymentLevel === 'D5').map((item) => item.id), ['CPT-045']);
  assert.ok(controlDevices.devices.length >= 16);
  assert.equal(controlDevices.statistics.total, controlDevices.devices.length);
  assert.ok(controlDevices.devices.every((device) => device.representativeWorks.length > 0));
  assert.ok(controlDevices.devices.every((device) => device.papers.every((paper) => paper.year > 0)));
  for (const name of ['DIII-D', 'TCV', 'EAST', 'ITER', 'EXL-50U', 'EHL-2']) {
    assert.ok(controlDevices.devices.some((device) => device.name.includes(name)), `missing device profile ${name}`);
  }

  const modelManifest = JSON.parse(
    await readFile(new URL('../public/models/paramak-tokamak-demo/model-manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(modelManifest.generator.name, 'Paramak');
  assert.equal(modelManifest.generator.version, '0.9.11');
  assert.equal(modelManifest.generator.license, 'MIT');
  assert.ok(modelManifest.webModel.triangles > 0);
  assert.equal(modelManifest.webModel.linearUnit, 'metre');
  assert.match(modelManifest.disclaimer, /not an engineering model of EXL-50U/);
});

test('server-renders the FusionDigital community portal', async () => {
  const html = await htmlFor('/');
  assert.match(html, /FusionDigital/);
  assert.match(html, /href="\/physics"/);
  assert.match(html, /href="\/engineering"/);
  assert.match(html, /href="\/control"/);
  assert.match(html, /href="\/ai"/);
  assert.match(html, /href="\/facilities"/);
  assert.match(html, /fusiondigital-mark\.png/);
  assert.match(html, /class="brandWordmark"/);
  assert.match(html, /class="brandFusion">Fusion/);
  assert.match(html, /class="brandDigital">Digital/);
  assert.match(html, /TOOLCHAINS/);
  assert.match(html, /data-three-viewer="paramak-tokamak-demo"/);
  assert.match(html, /id="device-3d"/);
  assert.match(html, /GENERIC PARAMAK TOKAMAK/);
  assert.match(html, /paramak-tokamak-demo-poster\.png/);
  assert.match(html, /href="\/models\/paramak-tokamak-demo\/paramak-tokamak-demo\.step"/);
  assert.match(html, /href="\/models\/paramak-tokamak-demo\/paramak-tokamak-demo\.glb"/);
  assert.match(html, /href="\/models\/paramak-tokamak-demo\/model-manifest\.json"/);
  assert.match(html, /PF COILS \/ CASES/);
  assert.match(html, /href="\/licenses\/THREE-LICENSE\.txt"/);
  assert.match(html, /Paramak 0\.9\.11/);
  assert.match(html, /它不是 EXL-50U、EHL-2 或其他在役装置的工程权威模型/);
  assert.match(html, /data-echart="fusion-twin-system-map"/);
  assert.match(html, /一个装置 · 一条数字主线 · 十项协同能力/);
  assert.match(html, /ONE ASSET · ONE DIGITAL THREAD · TEN COORDINATED CAPABILITIES/);
  for (const baseline of ['AS-DESIGNED', 'AS-BUILT', 'AS-COMMISSIONED', 'AS-OPERATED', 'AS-MAINTAINED', 'AS-DECOMMISSIONED']) {
    assert.match(html, new RegExp(baseline));
  }
  for (const domain of ['物理模拟', '工程仿真', '集成控制', '智能诊断', '能量转化', '辅机模拟', '人机交互', '数据基座', '总体集成', '智能原生']) {
    assert.match(html, new RegExp(domain));
  }
  assert.match(html, /class="fusionTwinModuleDock"/);
  assert.equal((html.match(/data-module-id=/g) ?? []).length, 10);
  assert.match(html, /NESTED CLOCKS/);
  assert.match(html, /μs—ms/);
  assert.match(html, /年—数十年/);
  assert.match(html, /安全与授权门/);
  assert.match(html, /AI 加速感知、代理建模、优化与知识协同/);
  assert.match(html, /人工智能不得直接连接装置执行器/);
  assert.doesNotMatch(html, /COMMUNITY THESIS|DIGITAL TWIN MAINLINE|一炮一链：聚变数字孪生的共同主线/);
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
  assert.match(html, /<b>04<\/b>已开放知识域/);
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

test('server-renders the integrated-control and PCS research atlas', async () => {
  const html = await htmlFor('/control');
  assert.match(html, /INTEGRATED CONTROL &amp; PCS ATLAS/);
  assert.match(html, /T0–T9/);
  assert.match(html, /状态估计与实时诊断/);
  assert.match(html, /PCS、脉冲编排与验证基础设施/);
  assert.match(html, /href="\/fusion-integrated-control-research-report\.docx"/);
  assert.match(html, /href="\/data\/fusion-control-landscape\.json"/);
  assert.match(html, /href="\/fusion-control-paper-code-index\.csv"/);
  assert.match(html, /href="\/fusion-control-references\.bib"/);
  assert.match(html, /type="search"/);
  assert.match(html, /value="official-direct"/);
  assert.match(html, /value="E4"/);
  assert.match(html, /value="D4"/);
  assert.match(html, /EXL-50U/);
  assert.match(html, /EHL-2/);
  assert.match(html, /control-closed-loop-architecture-nature\.png/);
  assert.match(html, /control-task-timescale-nature\.png/);
  assert.match(html, /control-verification-ladder-nature\.png/);
  assert.match(html, /control-digital-twin-roadmap-nature\.png/);
  assert.match(html, /data-echart="control-task-timescale"/);
  assert.match(html, /data-echart="control-evidence-deployment-matrix"/);
  assert.match(html, /target="_blank"/);
});

test('server-renders the physics simulation atlas', async () => {
  const html = await htmlFor('/physics');
  assert.match(html, /fusion-physics-simulation-report\.pdf/);
  assert.match(html, /integrated-twin-reference-architecture-nature\.png/);
  for (const chart of [
    'physics-decision-timescale',
    'physics-fidelity-latency',
    'physics-coupling-matrix',
    'integrated-framework-landscape',
    'integrated-framework-capability',
    'integrated-maturity-gap',
    'physics-digital-twin-roadmap',
  ]) assert.match(html, new RegExp(`data-echart="${chart}"`));
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
  for (const chart of [
    'engineering-domain-timescale',
    'engineering-tool-runtime-landscape',
    'engineering-digital-twin-roadmap',
  ]) assert.match(html, new RegExp(`data-echart="${chart}"`));
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
  assert.match(html, /href="\/fusion-ai-native-research-report\.docx"/);
  assert.match(html, /href="\/data\/fusion-ai-native-landscape\.json"/);
  assert.match(html, /href="\/fusion-ai-native-paper-code-index\.csv"/);
  assert.match(html, /type="search"/);
  assert.match(html, /value="commercial-enabling"/);
  assert.match(html, /value="E4"/);
  for (const domain of [
    'PHYSICS',
    'ENGINEERING',
    'INTEGRATED CONTROL',
    'INTELLIGENT DIAGNOSTICS',
    'ENERGY CONVERSION',
    'AUXILIARY SYSTEMS',
    'DATA FOUNDATION',
    'HUMAN–MACHINE',
    'WHOLE-PLANT',
  ]) assert.match(html, new RegExp(domain));
  assert.match(html, /FUSION · TWIN · AGENT LOOP/);
  assert.match(html, /target="_blank"/);
});
