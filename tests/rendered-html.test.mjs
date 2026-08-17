import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
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

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, root);
    return entry.isDirectory() ? listFiles(url) : [url];
  }))).flat();
}

test('deployment surface contains no controlled CAD or engineering mesh', async () => {
  const publicFiles = await listFiles(new URL('../public/', import.meta.url));
  const protectedGeometry = publicFiles.filter((file) => /(?:exl|iter)[^/]*\.(?:glb|gltf|step|stp|iges|igs|stl|obj|fbx)$/i.test(decodeURIComponent(file.pathname)));
  const authorizedBrowserDerivatives = [
    new URL('../public/models/exl50u-interactive/exl50u-interactive-high.meshopt.glb', import.meta.url).href,
    new URL('../public/models/exl50u-interactive/exl50u-interactive.glb', import.meta.url).href,
  ];
  assert.deepEqual(new Set(protectedGeometry.map((file) => file.href)), new Set(authorizedBrowserDerivatives));

  const serverFiles = (await listFiles(new URL('../dist/server/', import.meta.url)))
    .filter((file) => /\.(?:js|mjs|json|html|css)$/i.test(file.pathname));
  for (const file of serverFiles) {
    const body = await readFile(file, 'utf8');
    assert.doesNotMatch(body, /iter-cad-private|exl50u-cad-private|[A-Z]:\\(?:Users|Downloads|work)\\/i, `private path leaked in ${file.pathname}`);
  }
});

test('ships non-empty reports and structured download assets', async () => {
  const assets = [
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
    '../public/fusion-diagnostics-research-report.docx',
    '../public/fusion-diagnostics-paper-code-index.csv',
    '../public/fusion-diagnostics-references.bib',
    '../public/data/fusion-diagnostics-landscape.json',
    '../public/data/fusion-diagnostics-device-profiles.json',
    '../public/FusionDigital-technical-roadmap-2026-08-15.docx',
    '../public/models/paramak-tokamak-demo/paramak-tokamak-demo.step',
    '../public/models/paramak-tokamak-demo/paramak-tokamak-demo.glb',
    '../public/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png',
    '../public/models/paramak-tokamak-demo/PARAMAK-LICENSE.txt',
    '../public/models/paramak-tokamak-demo/model-manifest.json',
    '../public/models/paramak-full-device/paramak-full-device.step',
    '../public/models/paramak-full-device/paramak-full-device.glb',
    '../public/models/paramak-full-device/PARAMAK-LICENSE.txt',
    '../public/models/paramak-full-device/model-manifest.json',
    '../public/models/iter-public-simplified/model-manifest.json',
    '../public/licenses/ITER-PUBLIC-VISUALIZATION-DERIVATIVE.txt',
    '../public/models/device-catalog.json',
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

  const diagnosticsLandscape = JSON.parse(
    await readFile(new URL('../public/data/fusion-diagnostics-landscape.json', import.meta.url), 'utf8'),
  );
  const diagnosticsDevices = JSON.parse(
    await readFile(new URL('../public/data/fusion-diagnostics-device-profiles.json', import.meta.url), 'utf8'),
  );
  assert.ok(diagnosticsLandscape.entries.length >= 90);
  assert.equal(diagnosticsLandscape.statistics.total, diagnosticsLandscape.entries.length);
  assert.equal(new Set(diagnosticsLandscape.entries.map((item) => item.id)).size, diagnosticsLandscape.entries.length);
  assert.ok(diagnosticsLandscape.entries.every((item) => item.papers.length > 0));
  assert.ok(diagnosticsLandscape.entries.every((item) => item.papers.every((paper) => paper.year > 0)));
  assert.ok(diagnosticsLandscape.entries.every((item) => item.code.every((asset) => asset.status !== 'not-public' || asset.url === null)));
  assert.deepEqual(
    new Set(diagnosticsLandscape.entries.flatMap((item) => [item.primaryTask, ...item.relatedTasks])),
    new Set(['DG0', 'DG1', 'DG2', 'DG3', 'DG4', 'DG5', 'DG6', 'DG7', 'DG8', 'DG9', 'DG10', 'DG11']),
  );
  assert.equal(diagnosticsLandscape.statistics.uniquePapers, 167);
  assert.equal(diagnosticsLandscape.statistics.uniqueCodeAssets, 35);
  const diagnosticById = Object.fromEntries(diagnosticsLandscape.entries.map((item) => [item.id, item]));
  assert.match(diagnosticById['DSI-035'].title, /Tokamak Systems Monitor/);
  assert.equal(diagnosticById['DSI-035'].evidenceLevel, 'E2');
  assert.equal(diagnosticById['DSI-032'].deploymentLevel, 'D2');
  assert.equal(diagnosticsDevices.statistics.total, diagnosticsDevices.devices.length);
  assert.ok(diagnosticsDevices.devices.length >= 18);
  for (const name of ['DIII-D', 'TCV', 'EAST', 'ITER', 'EXL-50U', 'EHL-2']) {
    assert.ok(diagnosticsDevices.devices.some((device) => device.name.includes(name)), `missing diagnostics device profile ${name}`);
  }
  const exlDiagnostics = diagnosticsDevices.devices.find((device) => device.name.includes('EXL-50U'));
  assert.match(exlDiagnostics.type, /中心螺线管/);
  assert.doesNotMatch(exlDiagnostics.type, /^无中心螺线管/);

  const modelManifest = JSON.parse(
    await readFile(new URL('../public/models/paramak-tokamak-demo/model-manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(modelManifest.generator.name, 'Paramak');
  assert.equal(modelManifest.generator.version, '0.9.11');
  assert.equal(modelManifest.generator.license, 'MIT');
  assert.equal(modelManifest.schemaVersion, '1.1');
  assert.equal(modelManifest.access.classification, 'PUBLIC');
  assert.equal(modelManifest.devicePackage.authority, 'illustrative');
  assert.ok(modelManifest.systems.length >= 5);
  assert.ok(modelManifest.systems.flatMap((system) => system.parts).length >= 10);
  assert.ok(modelManifest.webModel.triangles > 0);
  assert.equal(modelManifest.webModel.linearUnit, 'metre');
  assert.match(modelManifest.disclaimer, /not an engineering model of EXL-50U/);
});

test('ships a closed, public DeviceManifest for the CAD viewer', async () => {
  const manifest = JSON.parse(await readFile(
    new URL('../public/models/paramak-tokamak-demo/model-manifest.json', import.meta.url),
    'utf8',
  ));
  const schema = JSON.parse(await readFile(
    new URL('../public/models/device-manifest.schema.json', import.meta.url),
    'utf8',
  ));
  assert.equal(manifest.schemaVersion, '1.1');
  assert.equal(manifest.access.classification, 'PUBLIC');
  assert.equal(manifest.access.redistributionAllowed, true);
  assert.deepEqual(schema.properties.schemaVersion.enum, ['1.1', '1.2', '1.3']);
  const parts = manifest.systems.flatMap((system) => system.parts);
  assert.equal(parts.length, 17);
  assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
  assert.equal(new Set(parts.map((part) => part.nodeName)).size, parts.length);
  assert.match(manifest.assets.webModel.sha256, /^[A-F0-9]{64}$/i);
  assert.ok(manifest.assets.webModel.bytes > 0);
});

test('server-renders the FusionDigital community portal', async () => {
  const html = await htmlFor('/');
  assert.match(html, /FusionDigital/);
  assert.match(html, /<link rel="canonical" href="https:\/\/fusiondigital\.club\/"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/fusiondigital\.club\/"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/fusiondigital\.club\/figures\/fusion-twin-ai-native-overview\.png"/);
  assert.doesNotMatch(html, /fusion-physics-atlas-2026\.tianyuanliu1992\.chatgpt\.site/);
  assert.match(html, /href="\/physics"/);
  assert.match(html, /href="\/engineering"/);
  assert.match(html, /href="\/control"/);
  assert.match(html, /href="\/diagnostics"/);
  assert.match(html, /href="\/diagnostics"[^>]*data-knowledge-module="diagnostics"[^>]*>[\s\S]*?<span>诊断感知<\/span><\/a>/);
  assert.match(html, /href="\/ai"/);
  assert.match(html, /href="\/facilities"/);
  assert.match(html, /href="\/#prototype-workspace"/);
  assert.equal((html.match(/class="siteKnowledgeHome[^\"]*"[^>]*href="\/knowledge-graph"|href="\/knowledge-graph"[^>]*class="siteKnowledgeHome[^\"]*"/g) ?? []).length, 2, 'desktop and mobile Knowledge menus must link to the graph home');
  assert.equal((html.match(/data-knowledge-module=/g) ?? []).length, 20, 'desktop and mobile Knowledge menus must expose all ten modules');
  assert.equal((html.match(/class="siteKnowledgeRoadmap[^"]*"[^>]*href="\/roadmap"|href="\/roadmap"[^>]*class="siteKnowledgeRoadmap[^"]*"/g) ?? []).length, 2, 'desktop and mobile Knowledge menus must expose the program roadmap');
  const primaryNavigation = [...html.matchAll(/data-primary-nav="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(primaryNavigation, [
    'facilities', 'prototype', 'resources', 'knowledge',
    'facilities', 'prototype', 'resources', 'knowledge',
  ], 'desktop and mobile navigation must expose the same four destinations with Knowledge last');
  assert.doesNotMatch(html, /知识智能/);
  assert.match(html, /fusiondigital-mark\.png/);
  assert.match(html, /class="brandWordmark"/);
  assert.match(html, /class="brandFusion">Fusion/);
  assert.match(html, /class="brandDigital">Digital/);
  assert.match(html, /TOOLCHAINS/);
  assert.equal((html.match(/id="prototype-workspace"/g) ?? []).length, 1);
  assert.match(html, /class="prototypePage prototypePage--embedded"/);
  assert.doesNotMatch(html, />三维与 EFIT 联动<\/a>/);
  assert.match(html, /data-three-viewer="paramak-full-device"/);
  assert.match(html, /装置、三维与 EFIT 联动/);
  assert.match(html, /EXL(?:‑|-)?50U 2026 升级版/);
  assert.match(html, /ITER 教育高精度模型/);
  assert.match(html, /搜索名称、ID 或工程标签/);
  assert.doesNotMatch(html, /class="tokamakCadTrust"|class="tokamakCadFootnotes"/);
  assert.match(html, /data-echart="fusion-twin-system-map"/);
  assert.match(html, /一个装置 · 一条数字主线 · 十项协同能力/);
  assert.match(html, /ONE ASSET · ONE DIGITAL THREAD · TEN COORDINATED CAPABILITIES/);
  for (const baseline of ['AS-DESIGNED', 'AS-BUILT', 'AS-COMMISSIONED', 'AS-OPERATED', 'AS-MAINTAINED', 'AS-DECOMMISSIONED']) {
    assert.match(html, new RegExp(baseline));
  }
  for (const domain of ['物理模拟', '工程仿真', '集成控制', '诊断感知', '能量转化', '辅机模拟', '人机交互', '数据基座', '总体集成', '智能原生']) {
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
  assert.match(html, /data-echart="phase-one-roadmap"/);
  assert.match(html, /一期先闭合一条可信数字线程/);
  assert.match(html, /EXL(?:‑|-)?50U 可验证窄域孪生/);
  assert.match(html, /R0 控制服务化到 R1 窄域数字影子之间/);
  assert.match(html, /现有基线/);
  assert.match(html, /一期建设/);
  assert.match(html, /一期后缺口/);
  assert.match(html, /G0—G2/);
  assert.match(html, /08 数据基座/);
  assert.match(html, /六个能力门表达依赖顺序与建设边界/);
  assert.equal((html.match(/data-roadmap-module-id=/g) ?? []).length, 10);
  assert.doesNotMatch(html, /roadmap-image2-v2\.png|class="roadmapCards"/);
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
  assert.match(html, /<b>05<\/b>已开放知识域/);
  assert.match(html, /DIAGNOSTICS &amp; SENSING/);
  assert.match(html, /诊断证据链/);
  assert.doesNotMatch(html, /智能诊断|INTELLIGENT DIAGNOSTICS/);
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

test('server-renders the EXL-50U to EHL-2 program roadmap', async () => {
  const html = await htmlFor('/roadmap');
  assert.match(html, /从 EXL(?:‑|-)?50U 最小闭环/);
  assert.match(html, /EHL(?:‑|-)?2 首等离子体虚拟实验/);
  assert.match(html, /12 周/);
  assert.match(html, /6 个月/);
  assert.match(html, /data-echart="fusion-twin-system-support-map"/);
  assert.match(html, /data-echart="phase-1-program-roadmap"/);
  assert.match(html, /data-echart="phase-2-program-roadmap"/);
  assert.match(html, /五大专业环节如何支撑两期目标/);
  assert.equal((html.match(/id="program-pillar-tab-/g) ?? []).length, 5);
  assert.equal((html.match(/aria-controls="program-pillar-detail"/g) ?? []).length, 5);
  assert.match(html, /id="program-pillar-detail"[^>]*role="region"|role="region"[^>]*id="program-pillar-detail"/);
  for (const pillar of ['位形与等离子体物理', '电磁、热与结构工程', '集成控制与虚拟调试', '诊断感知与状态重构', '数据、模型与证据基础设施']) assert.match(html, new RegExp(pillar));
  assert.match(html, /核心科学 \/ 工程问题/);
  assert.match(html, /不允许作出的结论/);
  assert.match(html, /关键路径/);
  assert.match(html, /条件式交付/);
  assert.match(html, /MDSplus \/ 权威档案 \/ 工程时序/);
  assert.match(html, /IMAS \+ 工程资产合同/);
  assert.match(html, /实际预电离源 \/ burn-through 模型/);
  assert.match(html, /问题专用线性响应/);
  assert.match(html, /17 MW NBI/);
  assert.match(html, /0 网页控机写通道/);
  assert.match(html, /展示成功 ≠ 科学验证/);
  assert.match(html, /数字孪生 ≠ 安全联锁/);
  assert.equal((html.match(/data-roadmap-module=/g) ?? []).length, 10);
  assert.match(html, /href="\/#domain-energy"/);
  assert.match(html, /href="\/#domain-auxiliary"/);
  assert.match(html, /href="\/#domain-hmi"/);
  assert.match(html, /href="\/#domain-data"/);
  assert.match(html, /href="\/#domain-integration"/);
  assert.match(html, /href="\/knowledge-graph"/);
  assert.match(html, /href="\/physics"/);
  assert.match(html, /href="\/engineering"/);
  assert.match(html, /href="\/control"/);
  assert.match(html, /href="\/diagnostics"/);
  assert.match(html, /href="\/ai"/);
  assert.doesNotMatch(html, /数字孪生替代|大模型直接控制/);
});

test('standalone knowledge-module pages return to the Knowledge graph', async () => {
  for (const route of ['/physics', '/engineering', '/control', '/diagnostics', '/ai']) {
    const html = await htmlFor(route);
    assert.match(html, /class="knowledgeBackLink"[^>]*href="\/knowledge-graph"|href="\/knowledge-graph"[^>]*class="knowledgeBackLink"/, `${route} must expose the Knowledge return link`);
  }
});

test('homepage owns the public full-device digital-prototype workspace', async () => {
  const html = await htmlFor('/');
  assert.equal((html.match(/id="prototype-workspace"/g) ?? []).length, 1);
  assert.ok(html.indexOf('id="prototype-workspace"') < html.indexOf('data-echart="fusion-twin-system-map"'),
    'the working interface must replace the former preview before the system map');
  assert.match(html, /装置、三维与 EFIT 联动/);
  assert.match(html, /data-three-viewer="paramak-full-device"/);
  assert.match(html, /Paramak/);
  assert.match(html, /EXL(?:‑|-)?50U 2026 升级版/);
  assert.match(html, /ITER 教育高精度模型/);
  assert.match(html, /简化派生实时三维/);
  assert.match(html, /高精度分片三维/);
  assert.match(html, /360°/);
  for (const removedWorkbenchCopy of [
    /MODEL COVERAGE/,
    /DIGITAL ASSET THREAD/,
    /CAE RESULT ENTRY/,
    /RESULT ADAPTER \/ PLANNED/,
    /叠加比较/,
    /DIVERTOR TOPOLOGY \/ VISUALIZATION-DERIVED/,
    /AXISYMMETRIC FLUX SURFACE \/ VISUALIZATION-DERIVED/,
    /PREVIEW SECURITY POLICY/,
    /科学与安全边界/,
    /预览交付与替换接口/,
  ]) assert.doesNotMatch(html, removedWorkbenchCopy);
  assert.match(html, /按需加载约 (?:<!-- -->)?2\.2(?:<!-- -->)? MB/);
  assert.doesNotMatch(html, /paramak-tokamak-demo-poster\.png/);
  assert.doesNotMatch(html, /iter-cad-private|127\.0\.0\.1/i);
  assert.doesNotMatch(html, /href=["'][^"']*\/models\/iter[^"']*\.glb/i,
    'the homepage must not expose the ITER GLB as a direct download link');

  const catalog = JSON.parse(await readFile(
    new URL('../public/models/device-catalog.json', import.meta.url),
    'utf8',
  ));
  assert.equal(catalog.devices.length, 3);
  assert.equal(catalog.schemaVersion, '2.0');
  assert.equal(catalog.securityPolicy.showDownloadActions, false);
  assert.equal(catalog.securityPolicy.sourceCadDelivered, false);
  assert.equal(catalog.devices.filter((device) => device.viewer.manifestEndpoint !== null).length, 3);
  const exl = catalog.devices.find((device) => device.id === 'exl-50u-2026-upgrade');
  assert.equal(exl.delivery, 'public-static');
  assert.equal(exl.viewer.mode, 'real-3d');
  assert.equal(exl.viewer.manifestEndpoint, '/device-assets/exl50u-interactive/model-manifest.json');
  assert.equal(exl.viewer.turntableManifestEndpoint, null);
  assert.equal(exl.viewer.overlayEligible, false);
  assert.equal(exl.physicsOverlays.length, 1);
  assert.equal(exl.physicsOverlays[0].kind, 'axisymmetric-equilibrium');
  assert.equal(exl.physicsOverlays[0].manifestEndpoint, '/device-data/exl50u-efit-v2/index.json');
  assert.equal(exl.physicsOverlays[0].defaultShot, 18303);
  assert.equal(exl.physicsOverlays[0].defaultTimeMs, 350);
  assert.ok(exl.facts.includes('12 个主要系统组件'));
  assert.ok(exl.facts.includes('10 炮 / 5,804 帧 EFIT · 18303 + 6 炮偏滤器拓扑'));
  assert.match(exl.copy, /12 个主要系统组件/);
  assert.match(exl.copy, /原始 CAD、STEP、完整磁通网格和工程权威模型不会由网站下发/);
  assert.match(exl.statement, /Browser-delivered geometry can be technically saved/);
  const iter = catalog.devices.find((device) => device.id === 'iter-educational-model');
  assert.equal(iter.delivery, 'public-static');
  assert.equal(iter.viewer.mode, 'real-3d');
  assert.equal(iter.viewer.manifestEndpoint, '/models/iter-public-simplified/model-manifest.json');
  assert.equal(iter.viewer.turntableManifestEndpoint, null);
  assert.equal(iter.viewer.overlayEligible, false);
  assert.equal(iter.physicsOverlays.length, 0);
  assert.ok(iter.facts.includes('18 个稳定部件'));
  assert.ok(iter.facts.includes('约 100 MB 分片高精度'));
  assert.match(iter.copy, /源 STEP、B-Rep、工程尺寸与工程权威模型不公开/);
  assert.match(iter.statement, /Project-owner-authorized public browser visualization derivative/);
  assert.match(iter.statement, /Browser-delivered geometry can be technically saved/);
  assert.match(iter.statement, /does not claim ITER Organization endorsement/);
  assert.ok(catalog.devices.filter((device) => device.id !== exl.id).every((device) => device.physicsOverlays.length === 0));
  assert.ok(catalog.devices.every((device) => !JSON.stringify(device).match(/iter-cad-private|127\.0\.0\.1|[A-Z]:\\/i)));
  assert.doesNotMatch(html, /下载 (?:STEP|GLB)/);

  const exlManifest = JSON.parse(await readFile(
    new URL('../public/models/exl50u-interactive/model-manifest.json', import.meta.url),
    'utf8',
  ));
  assert.equal(exlManifest.devicePackage.kind, 'public-simplified-derivative');
  assert.equal(exlManifest.devicePackage.authority, 'illustrative');
  assert.equal(exlManifest.access.classification, 'PUBLIC');
  assert.equal(exlManifest.access.redistributionAllowed, true);
  assert.equal(exlManifest.access.engineeringUseAllowed, false);
  assert.equal(exlManifest.assets.sourceCad, undefined);
  assert.equal(exlManifest.systems.length, 12);
  assert.equal(exlManifest.systems.flatMap((system) => system.parts).length, 12);
  assert.equal(new Set(exlManifest.systems.flatMap((system) => system.parts.map((part) => part.nodeName))).size, 12);

  const iterManifest = JSON.parse(await readFile(
    new URL('../public/models/iter-public-simplified/model-manifest.json', import.meta.url),
    'utf8',
  ));
  assert.equal(iterManifest.devicePackage.kind, 'public-simplified-derivative');
  assert.equal(iterManifest.devicePackage.authority, 'illustrative');
  assert.equal(iterManifest.access.classification, 'PUBLIC');
  assert.equal(iterManifest.access.redistributionAllowed, true);
  assert.equal(iterManifest.access.engineeringUseAllowed, false);
  assert.equal(iterManifest.schemaVersion, '1.3');
  assert.equal(iterManifest.assets.sourceCad, undefined);
  assert.equal(iterManifest.assets.webModels, undefined);
  assert.equal(iterManifest.assets.componentBundles?.[0]?.components.length, 18);
  assert.equal(iterManifest.visualizations?.analyticPlasma?.isEfit, false);
  assert.equal(iterManifest.visualizations?.analyticPlasma?.hasXPoint, false);
  assert.equal(iterManifest.assets.webModel, undefined);
  const iterParts = iterManifest.systems.flatMap((system) => system.parts);
  assert.equal(iterParts.length, 18);
  assert.equal(new Set(iterParts.map((part) => part.id)).size, 18);
  assert.equal(new Set(iterParts.map((part) => part.nodeName)).size, 18);
  assert.ok(iterParts.every((part) => /^ITER_PART__[a-z0-9-]+$/.test(part.nodeName)));
  assert.match(iterManifest.disclaimer, /(?:non-engineering|not an engineering|非工程)/i);

  const manifest = JSON.parse(await readFile(
    new URL('../public/models/paramak-full-device/model-manifest.json', import.meta.url),
    'utf8',
  ));
  assert.equal(manifest.schemaVersion, '1.1');
  assert.equal(manifest.access.classification, 'PUBLIC');
  assert.equal(manifest.access.redistributionAllowed, true);
  assert.equal(manifest.devicePackage.authority, 'illustrative');
  assert.equal(manifest.generator.script.path, 'research/3d/generate_paramak_full_device.py');
  assert.match(manifest.generator.script.sha256, /^[A-F0-9]{64}$/);
  const generatorScript = await readFile(
    new URL('../research/3d/generate_paramak_full_device.py', import.meta.url),
  );
  assert.equal(createHash('sha256').update(generatorScript).digest('hex').toUpperCase(), manifest.generator.script.sha256);
  assert.equal(manifest.generator.conversion.converterVersion, '0.1.0');
  assert.equal(manifest.systems.flatMap((system) => system.parts).length, 17);
  assert.equal(manifest.assets.webModel.bytes, 2169812);
  assert.match(manifest.assets.webModel.sha256, /^[A-F0-9]{64}$/);
  assert.ok(manifest.coverage.notIncluded.includes('central solenoid'));
  assert.match(manifest.disclaimer, /not an engineering model of ITER, EXL-50U/);
});

test('legacy digital-prototype route redirects to the homepage workspace anchor', async () => {
  const response = await render('/digital-prototype');
  assert.ok([307, 308].includes(response.status));
  assert.match(response.headers.get('location') ?? '', /\/#prototype-workspace$/);
});

test('server-renders the consolidated platform architecture and technical roadmap', async () => {
  const html = await htmlFor('/platform');
  assert.match(html, /PLATFORM ARCHITECTURE \/ 2026/);
  assert.match(html, /公开投影面/);
  assert.match(html, /内网科学平台面/);
  assert.match(html, /实验实时面/);
  for (const contract of ['DeviceRevision', 'Shot / Signal', 'ArtifactManifest', 'SimulationRun', 'ResultManifest', 'AgentRun', 'Release']) {
    assert.match(html, new RegExp(contract.replace('/', '\\/')));
  }
  assert.match(html, /MDSplus/);
  assert.match(html, /PostgreSQL/);
  assert.match(html, /Kubernetes Jobs/);
  assert.match(html, /NATS JetStream/);
  assert.match(html, /href="\/FusionDigital-technical-roadmap-2026-08-15\.docx"/);
  assert.match(html, /href="\/platform"/);
  assert.doesNotMatch(html, /浏览器[^<]{0,80}(?:直接访问|直连)[^<]{0,40}PCS/);
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
  assert.match(html, /href="\/platform#contracts"/);
  assert.doesNotMatch(html, /07 \/ COLLABORATE|网页条目用于技术交流/);
});

test('server-renders the diagnostics and sensing research atlas', async () => {
  const html = await htmlFor('/diagnostics');
  assert.match(html, /诊断感知/);
  assert.match(html, /DIAGNOSTICS &amp; SENSING/);
  assert.match(html, /DG0/);
  assert.match(html, /DG11/);
  assert.match(html, /href="\/fusion-diagnostics-research-report\.docx"/);
  assert.match(html, /href="\/data\/fusion-diagnostics-landscape\.json"/);
  assert.match(html, /href="\/fusion-diagnostics-paper-code-index\.csv"/);
  assert.match(html, /href="\/fusion-diagnostics-references\.bib"/);
  assert.match(html, /href="\/data\/fusion-diagnostics-device-profiles\.json"/);
  assert.match(html, /type="search"/);
  assert.match(html, /EXL-50U/);
  assert.match(html, /EHL-2/);
  assert.match(html, /diagnostics-measurement-chain-nature\.png/);
  assert.match(html, /diagnostics-synthetic-loop-nature\.png/);
  assert.match(html, /diagnostics-digital-twin-architecture-nature\.png/);
  assert.match(html, /aria-label="按 DG0 到 DG11 筛选诊断目录"/);
  assert.match(html, /aria-label="按科学证据与部署责任筛选诊断目录"/);
  assert.match(html, /href="\/diagnostics\?task=DG0#catalog"/);
  assert.match(html, /href="\/diagnostics\?evidence=E4&amp;deployment=D4#catalog"/);
  assert.match(html, /诊断工作科学证据与部署责任矩阵/);
  assert.doesNotMatch(html, /fallbackAlt="聚变诊断实时治理与验证静态图"/);
  for (const chart of [
    'diagnostics-observation-model-decision-loop',
    'diagnostics-task-coverage',
    'diagnostics-evidence-deployment-matrix',
    'diagnostics-nested-timescales',
    'diagnostics-device-task-coverage',
    'diagnostics-digital-twin-roadmap',
  ]) assert.match(html, new RegExp(`data-echart="${chart}"`));
  assert.match(html, /href="\/diagnostics"[^>]*data-knowledge-module="diagnostics"[^>]*class="active"[^>]*>[\s\S]*?<span>诊断感知<\/span><\/a>/);
  assert.match(html, /target="_blank"/);
  assert.doesNotMatch(html, /METHOD &amp; LIMITS|如何严谨地使用本知识域/);
});

test('server-renders and validates diagnostics catalog URL filters', async () => {
  const filtered = await htmlFor('/diagnostics?task=DG1&evidence=E4&technique=MAGNETIC&device=DIII-D&code=official-direct&page=2&query=rtEFIT');
  assert.match(filtered, /class="active" aria-pressed="true" title="磁平衡、电流与位形">DG1/);
  assert.match(filtered, /value="MAGNETIC" selected=""/);
  assert.match(filtered, /value="DIII-D" selected=""/);
  assert.match(filtered, /value="E4" selected=""/);
  assert.match(filtered, /value="official-direct" selected=""/);
  assert.match(filtered, /type="search"[^>]*value="rtEFIT"|value="rtEFIT"[^>]*type="search"/);

  const invalid = await htmlFor('/diagnostics?task=INVALID&evidence=E9&technique=NOPE&device=NoSuchDevice&code=oops&page=-5&query=Tokamak');
  assert.match(invalid, /class="active" aria-pressed="true">全部/);
  assert.doesNotMatch(invalid, /value="NoSuchDevice" selected/);
  assert.match(invalid, /type="search"[^>]*value="Tokamak"|value="Tokamak"[^>]*type="search"/);
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
  assert.doesNotMatch(html, /不构成求解器排名|不代表官方评级|不是成熟度认证/);
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
  assert.doesNotMatch(html, /不构成性能承诺|不构成项目进度承诺/);
});

test('server-renders the device construction-status observatory', async () => {
  const html = await htmlFor('/facilities');
  assert.match(html, /EXL-50U/);
  assert.match(html, /EHL-2/);
  assert.match(html, /ITER/);
  assert.match(html, /SPARC/);
  assert.match(html, /BEST/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /href="\/platform#architecture"/);
  assert.doesNotMatch(html, /STATUS METHOD|纳入与核验规则/);
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
    'DIAGNOSTICS &amp; SENSING',
    'ENERGY CONVERSION',
    'AUXILIARY SYSTEMS',
    'DATA FOUNDATION',
    'HUMAN–MACHINE',
    'WHOLE-PLANT',
  ]) assert.match(html, new RegExp(domain));
  assert.match(html, /FUSION · TWIN · AGENT LOOP/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /href="\/platform#architecture"/);
  assert.doesNotMatch(html, /METHOD &amp; LIMITS|如何使用这份图谱/);
});

test('ships and server-renders the evidence-first knowledge graph', async () => {
  const snapshot = JSON.parse(await readFile(
    new URL('../public/data/fusion-knowledge-graph.json', import.meta.url),
    'utf8',
  ));
  assert.equal(snapshot.schemaVersion, '1.0');
  assert.equal(snapshot.statistics.nodes, snapshot.nodes.length);
  assert.equal(snapshot.statistics.edges, snapshot.edges.length);
  assert.ok(snapshot.nodes.length >= 1200);
  assert.ok(snapshot.edges.length >= 2000);
  assert.equal(new Set(snapshot.nodes.map((node) => node.id)).size, snapshot.nodes.length);
  assert.equal(new Set(snapshot.edges.map((edge) => edge.id)).size, snapshot.edges.length);
  assert.ok(snapshot.edges.every((edge) => snapshot.nodes.some((node) => node.id === edge.source)));
  assert.ok(snapshot.edges.every((edge) => snapshot.nodes.some((node) => node.id === edge.target)));
  for (const type of ['research', 'paper', 'code', 'device', 'tool', 'task', 'organization']) {
    assert.ok(snapshot.statistics.byType[type] > 0, `missing graph node type ${type}`);
  }
  for (const name of ['ITER', 'DIII-D', 'EXL-50U', 'EHL-2']) {
    assert.ok(snapshot.nodes.some((node) => node.type === 'device' && node.label === name), `missing graph device ${name}`);
  }
  assert.ok(snapshot.nodes.some((node) => node.type === 'tool' && node.label === 'DINA'));
  assert.ok(snapshot.nodes.some((node) => node.type === 'tool' && node.label.includes('CATIA')));
  assert.ok(snapshot.edges.some((edge) => edge.relation === 'SUPPORTED_BY' && edge.evidenceUrl));

  const html = await htmlFor('/knowledge-graph');
  assert.match(html, /FUSION KNOWLEDGE GRAPH/);
  assert.match(html, /data-echart="fusion-knowledge-graph"/);
  assert.match(html, /论文、代码与装置证据/);
  assert.match(html, /href="\/data\/fusion-knowledge-graph\.json"/);
  assert.match(html, /节点上限/);
  assert.match(html, /1 跳 · 直接关系/);
  assert.match(html, /围绕图谱持续提问/);
  assert.match(html, /多轮上下文保存在本设备/);
  assert.match(html, /aria-label="FusionDigital 对话记录"/);
  assert.match(html, /href="\/platform#contracts"/);
  assert.doesNotMatch(html, /04 \/ GOVERNANCE|图谱是证据索引/);
});

test('ships and server-renders evidence-grounded knowledge search', async () => {
  const snapshot = JSON.parse(await readFile(
    new URL('../public/data/fusion-knowledge-index.json', import.meta.url),
    'utf8',
  ));
  assert.equal(snapshot.schemaVersion, '1.0.0');
  assert.equal(snapshot.statistics.total, snapshot.entries.length);
  assert.ok(snapshot.entries.length >= 1300);
  assert.ok(snapshot.statistics.byType.paper >= 400);
  assert.ok(snapshot.statistics.byType.code >= 300);
  assert.ok(snapshot.entries.some((entry) => entry.title === 'EXL-50U'));

  const html = await htmlFor('/search');
  assert.match(html, /AI-NATIVE KNOWLEDGE/);
  assert.match(html, /确定性检索/);
  assert.match(html, /检索后继续追问/);
  assert.match(html, /证据对话/);
  assert.match(html, /发送问题/);
  assert.match(html, /证据不足则拒答/);
  assert.match(html, /href="\/platform#contracts"/);
  assert.doesNotMatch(html, /03 \/ TRUST BOUNDARY|当前能力边界/);
});

test('server-renders the identity-aware account entry without exposing credentials', async () => {
  const html = await htmlFor('/account');
  assert.match(html, /ACCOUNT &amp; ACCESS/);
  assert.match(html, /REGISTER &amp; SIGN IN/);
  assert.match(html, /href="\/signin-with-chatgpt\?return_to=%2Faccount"/);
  assert.match(html, /使用 ChatGPT 注册 \/ 登录/);
  assert.match(html, /模型密钥始终保留在服务端/);
  assert.match(html, /href="\/account"[^>]*aria-label="账户中心"/);
  assert.match(html, /href="\/platform#architecture"/);
  assert.doesNotMatch(html, /02 \/ SECURITY BOUNDARY/);
  assert.doesNotMatch(html, /(?:OPENAI|ANTHROPIC|DEEPSEEK|MOONSHOT)_API_KEY|sk-[A-Za-z0-9_-]{16,}/);
});

test('server-renders the signed-out research review boundary without D1 access', async () => {
  const html = await htmlFor('/research-review');
  assert.match(html, /GOVERNED RESEARCH AGENT/);
  assert.match(html, /智能体负责发现/);
  assert.match(html, /href="\/signin-with-chatgpt\?return_to=%2Fresearch-review"/);
  assert.match(html, /“接受”不等于“发布”|接受.*不等于.*发布/);
  assert.doesNotMatch(html, /(?:OPENAI|ANTHROPIC|DEEPSEEK|MOONSHOT)_API_KEY|sk-[A-Za-z0-9_-]{16,}/);
});
