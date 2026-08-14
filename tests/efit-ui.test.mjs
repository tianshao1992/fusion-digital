import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`(?:^|})\\s*${escaped}\\{([^}]*)\\}`, 'g'))];
  assert.ok(matches.length, `missing CSS rule ${selector}`);
  return matches.map((match) => match[1]).join(';');
}

test('EXL device package declares a typed EFIT physics overlay', async () => {
  const catalog = JSON.parse(await source('public/models/device-catalog.json'));
  const exl = catalog.devices.find((device) => device.id === 'exl-50u-2026-upgrade');
  assert.ok(exl);
  assert.deepEqual(exl.physicsOverlays.map((overlay) => overlay.id), ['efit-equilibrium']);
  assert.equal(exl.physicsOverlays[0].kind, 'axisymmetric-equilibrium');
  assert.equal(exl.physicsOverlays[0].manifestEndpoint, '/device-data/exl50u-efit/index.json');
  assert.equal(exl.physicsOverlays[0].defaultShot, 18301);
  assert.equal(exl.physicsOverlays[0].authority, 'visualization-derived');
  assert.ok(catalog.devices.filter((device) => device.id !== exl.id).every((device) => device.physicsOverlays.length === 0));
});

test('EFIT controls, store and Three overlay share one external frame state', async () => {
  const workspace = await source('app/digital-prototype/MultiDeviceWorkspace.tsx');
  const viewer = await source('app/components/TokamakCadViewer.tsx');
  const store = await source('app/components/efit/store.ts');
  const dataSource = await source('app/components/efit/data-source.ts');
  const overlay = await source('app/components/device-viewer/EfitThreeOverlay.ts');

  assert.match(workspace, /createEfitStore\(createEfitBinaryDataSource/);
  assert.match(workspace, /<EfitPanel store=\{store\}/);
  assert.match(workspace, /efitStore=\{efitStore\}/);
  assert.match(workspace, /onShowSurfaceChange/);
  assert.match(viewer, /return efitStore\.subscribe\(sync\)/);
  assert.match(viewer, /EFIT OVERLAY/);
  assert.match(store, /1000 \/ 30/);
  assert.match(store, /closestFrameIndex/);
  assert.match(dataSource, /Range: `bytes=\$\{start\}-\$\{start \+ length - 1\}`/);
  assert.match(dataSource, /maxCachedFrames/);
  assert.match(overlay, /EFIT_LCFS_REVOLVED_SURFACE/);
  assert.match(overlay, /ePhiPositiveAtPhi0Web/);
  assert.match(overlay, /alignment basis must be orthonormal and right-handed/);
});

test('digital-prototype split layout exposes an accessible and persistent resize contract', async () => {
  const workspace = await source('app/digital-prototype/MultiDeviceWorkspace.tsx');

  assert.match(workspace, /const WORKBENCH_PREFERENCE_KEY = 'fusion-digital:prototype-efit-width:v1'/);
  assert.match(workspace, /const DEFAULT_PHYSICS_SHARE = 0\.36/);
  assert.match(workspace, /useState\(DEFAULT_PHYSICS_SHARE\)/);
  assert.match(workspace, /savedPreference !== null/);
  assert.match(workspace, /Number\.isFinite\(saved\)/, 'invalid persisted values must leave the 36% default intact');
  assert.match(workspace, /localStorage\.setItem\(WORKBENCH_PREFERENCE_KEY, physicsShare\.toFixed\(4\)\)/);
  assert.match(workspace, /data-layout="split-resizable"/);
  assert.match(workspace, /className="devicePaneSeparator"[\s\S]*?role="separator"/);
  assert.match(workspace, /aria-label="调整三维装置与 EFIT 分析面板的宽度"/);
  assert.match(workspace, /aria-orientation="vertical"/);
  assert.match(workspace, /aria-valuemin=\{Math\.round\(MIN_PHYSICS_SHARE \* 100\)\}/);
  assert.match(workspace, /aria-valuemax=\{Math\.round\(MAX_PHYSICS_SHARE \* 100\)\}/);
  assert.match(workspace, /aria-valuenow=\{Math\.round\(physicsPercent\)\}/);
  assert.match(workspace, /tabIndex=\{0\}/);
  assert.match(workspace, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(workspace, /event\.currentTarget\.releasePointerCapture\(event\.pointerId\)/);
  assert.match(workspace, /onPointerMove=/);
  assert.match(workspace, /onPointerUp=\{finishResize\}/);
  assert.match(workspace, /onPointerCancel=\{finishResize\}/);
  assert.match(workspace, /event\.key === 'ArrowLeft'/);
  assert.match(workspace, /event\.key === 'ArrowRight'/);
  assert.match(workspace, /event\.key === 'Home'/);
  assert.match(workspace, /event\.key === 'End'/);
  assert.match(workspace, /event\.preventDefault\(\)/);
});

test('digital-prototype workspace is full-width, aligned and safely stacks below 1180px', async () => {
  const workspace = await source('app/digital-prototype/MultiDeviceWorkspace.tsx');
  const css = await source('app/digital-prototype/prototype.css');

  assert.match(cssRule(css, '.multiDeviceSection'), /padding:56px clamp\(14px,1\.5vw,30px\) 72px/);
  for (const selector of ['.multiDeviceIntro', '.deviceSelector', '.deviceStage']) {
    const declarations = cssRule(css, selector);
    assert.match(declarations, /width:100%/, `${selector} must fill the available page width`);
    assert.doesNotMatch(declarations, /max-width:/, `${selector} must not retain the former 1600px ceiling`);
  }
  assert.match(cssRule(css, '.deviceStage'), /grid-template-columns:clamp\(170px,11vw,215px\) minmax\(0,1fr\)/);
  assert.match(cssRule(css, '.deviceAuthority'), /padding:22px 16px/);

  const layout = cssRule(css, '.deviceExperienceLayout');
  assert.match(layout, /--device-physics-width:36%/);
  assert.match(layout, /--device-workbench-height:/);
  assert.match(layout, /grid-template-columns:minmax\(0,calc\(100% - var\(--device-physics-width\) - 10px\)\) 10px minmax\(0,var\(--device-physics-width\)\)/);
  assert.match(cssRule(css, '.deviceViewport .tokamakCadShell'), /height:var\(--device-workbench-height\)/);
  assert.match(cssRule(css, '.devicePaneSeparator'), /height:var\(--device-workbench-height\)/);
  assert.match(cssRule(css, '.devicePhysicsPanel'), /height:var\(--device-workbench-height\)/);
  assert.match(css, /\.devicePhysicsPanel\{container-name:physics-panel;container-type:inline-size\}/);
  assert.match(css, /@container physics-panel \(min-width:540px\)\{/);
  assert.match(css, /\.devicePhysicsPanel \.efitChartGrid\{grid-template-columns:minmax\(0,1\.04fr\) minmax\(0,\.96fr\)\}/);

  const compactStart = css.indexOf('@media(max-width:1180px){');
  const compactEnd = css.indexOf('@media(max-width:1100px){', compactStart);
  assert.ok(compactStart >= 0 && compactEnd > compactStart, 'missing 1180px stacked-layout breakpoint');
  const compact = css.slice(compactStart, compactEnd);
  assert.match(compact, /\.deviceExperienceLayout\{display:block\}/);
  assert.match(compact, /\.devicePaneSeparator\{display:none\}/);
  assert.match(compact, /\.deviceViewport \.tokamakCadShell\{height:auto;min-height:0\}/);
  assert.match(compact, /\.devicePhysicsPanel\{height:auto;max-height:none;overflow:visible/);
  assert.match(compact, /\.tokamakCadFootnotes\{display:grid\}/, 'the original governance footnotes must return in stacked mode');

  assert.match(workspace, /function DeviceGovernanceNote/);
  assert.match(workspace, /className="deviceGovernanceNote" role="note"/);
  assert.match(workspace, /科学与安全边界/);
  assert.match(workspace, /预览交付与替换接口/);
  assert.match(workspace, /<DeviceGovernanceNote device=\{current\} \/>/);
  assert.match(cssRule(css, '.deviceGovernanceNote'), /display:grid/);
  assert.doesNotMatch(
    cssRule(css, '.deviceViewport .tokamakCadFootnotes'),
    /display:none/,
    'the base footnote rule must remain available outside the aligned desktop split',
  );
});

test('EFIT panel exposes shot selection, real time scrubbing, playback and quality boundaries', async () => {
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const transport = await source('app/components/efit/EfitTimelineControls.tsx');
  const equilibrium = await source('app/components/efit/EfitEquilibriumChart.tsx');
  assert.match(panel, /放电炮号/);
  assert.match(panel, /质量/);
  assert.match(panel, /数据间隙/);
  assert.match(transport, /真实 EFIT 时间轴/);
  assert.match(transport, /上一帧/);
  assert.match(transport, /循环播放/);
  assert.match(equilibrium, /R–Z 平衡位形/);
  assert.match(equilibrium, /LCFS/);
  assert.match(equilibrium, /磁轴/);
});

test('EFIT plasma colour field is a contour-constrained psiN display in both 2D and 3D', async () => {
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const equilibrium = await source('app/components/efit/EfitEquilibriumChart.tsx');
  const runtime = await source('app/components/efit/echarts-canvas-runtime.ts');
  const palette = await source('app/components/efit/psi-n-palette.ts');
  const overlay = await source('app/components/device-viewer/EfitThreeOverlay.ts');
  const viewer = await source('app/components/TokamakCadViewer.tsx');

  assert.match(panel, /R–Z 磁通分带云图/);
  assert.match(panel, /归一化极向磁通 ψN/);
  assert.match(panel, /非温度\/密度/);
  assert.match(equilibrium, /type: 'custom'/);
  assert.match(equilibrium, /bandPsiN/);
  assert.match(equilibrium, /不代表温度或密度/);
  assert.match(runtime, /CustomChart/);
  assert.match(runtime, /VisualMapComponent/);
  assert.match(palette, /colorForPsiN/);
  assert.match(overlay, /EFIT_PSI_N_BANDED_SECTION/);
  assert.match(overlay, /EFIT_PSI_N_BANDED_SECTION_OPPOSITE/);
  assert.match(overlay, /publishedContours/);
  assert.match(overlay, /bandPsiN/);
  assert.match(viewer, /ψN 分带剖面/);
});

test('EFIT component runtime stays lazy and does not expose raw-data URLs', async () => {
  const viewer = await source('app/components/TokamakCadViewer.tsx');
  const chart = await source('app/components/efit/EfitCanvasChart.tsx');
  const allUi = await Promise.all([
    'app/digital-prototype/MultiDeviceWorkspace.tsx',
    'app/components/TokamakCadViewer.tsx',
    'app/components/efit/data-source.ts',
  ].map(source));
  assert.match(viewer, /import\('\.\/device-viewer\/EfitThreeOverlay'\)/);
  assert.match(viewer, /import type \{[\s\S]*?\} from ['"]\.\/device-viewer\/EfitThreeOverlay['"];?/);
  assert.match(chart, /import\('\.\/echarts-canvas-runtime'\)/);
  assert.doesNotMatch(allUi.join('\n'), /D:\\Downloads|EFIT数据\.zip|\/data\/exl50u-efit\/shot-/i);
});
