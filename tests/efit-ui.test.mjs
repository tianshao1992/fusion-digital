import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createEfitBinaryDataSource } from '../app/components/efit/data-source.ts';
import { deriveReviewedDivertorRegion } from '../app/components/efit/divertor-region.ts';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  assert.ok(matches.length, `missing CSS rule ${selector}`);
  return matches.map((match) => match[1]).join(';');
}

async function localEfitFetch(input, init = {}) {
  const pathname = new URL(String(input), 'http://localhost').pathname;
  const filename = pathname.replace('/device-data/exl50u-efit/', '');
  const approved = new Set(['index.json', 'shot-18303.bin', 'shot-18303-topology.bin']);
  if (!approved.has(filename)) return new Response('Not found', { status: 404 });
  const payload = await readFile(new URL(`../public/data/exl50u-efit/${filename}`, import.meta.url));
  const range = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init.headers).get('range') ?? '');
  if (!range) return new Response(payload, { status: 200 });
  const start = Number(range[1]);
  const end = Math.min(payload.length - 1, Number(range[2]));
  return new Response(payload.subarray(start, end + 1), {
    status: 206,
    headers: { 'Content-Range': `bytes ${start}-${end}/${payload.length}` },
  });
}

test('EXL device package declares a typed EFIT physics overlay', async () => {
  const catalog = JSON.parse(await source('public/models/device-catalog.json'));
  const exl = catalog.devices.find((device) => device.id === 'exl-50u-2026-upgrade');
  assert.ok(exl);
  assert.deepEqual(exl.physicsOverlays.map((overlay) => overlay.id), ['efit-equilibrium']);
  assert.equal(exl.physicsOverlays[0].kind, 'axisymmetric-equilibrium');
  assert.equal(exl.physicsOverlays[0].manifestEndpoint, '/device-data/exl50u-efit-v2/index.json');
  assert.equal(exl.physicsOverlays[0].defaultShot, 18303);
  assert.equal(exl.physicsOverlays[0].defaultTimeMs, 350);
  assert.equal(exl.physicsOverlays[0].authority, 'visualization-derived');
  assert.ok(exl.facts.includes('10 炮 / 5,804 帧 EFIT · 18303 + 6 炮偏滤器拓扑'));
  assert.match(exl.copy, /未经审查的开放区域只显示线框，不生成 SOL 或偏滤器体积/);
  assert.ok(catalog.devices.filter((device) => device.id !== exl.id).every((device) => device.physicsOverlays.length === 0));
});

test('EFIT controls, store and Three overlay share one external frame state', async () => {
  const workspace = await source('app/digital-prototype/MultiDeviceWorkspace.tsx');
  const viewer = await source('app/components/TokamakCadViewer.tsx');
  const store = await source('app/components/efit/store.ts');
  const dataSource = await source('app/components/efit/data-source.ts');
  const overlay = await source('app/components/device-viewer/EfitThreeOverlay.ts');

  assert.match(workspace, /createEfitStore\(createEfitHybridDataSource/);
  assert.match(workspace, /createEfitHybridDataSource\(\{ indexUrl: endpoint \}\)/);
  assert.match(workspace, /<EfitPanel[\s\S]*?store=\{store\}/);
  assert.match(workspace, /efitStore=\{efitStore\}/);
  assert.match(workspace, /onShowSurfaceChange/);
  assert.match(viewer, /return efitStore\.subscribe\(sync\)/);
  assert.match(viewer, /efitFrameIdentity/);
  assert.match(viewer, /if \(identity === renderedIdentity\) return/,
    'loading and other non-frame state emissions must not rebuild the same 3D EFIT frame');
  assert.match(viewer, /EFIT OVERLAY/);
  assert.match(store, /frameAtOrBeforeIndex/);
  assert.match(store, /EFIT_PLAYBACK_PRESENTATION_INTERVAL_MS = 1000 \/ 30/);
  assert.match(store, /prefetchPlaybackWindow/);
  assert.doesNotMatch(store, /playbackAnchorTimeMs = frame\.timeMs/,
    'network latency must not stretch every 1 ms source frame into a display frame');
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
  assert.match(workspace, /aria-label=\{t\('workspace\.resize'\)\}/);
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
  const viewer = await source('app/components/TokamakCadViewer.tsx');
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

  assert.match(viewer, /showFootnotes\?: boolean/);
  assert.match(viewer, /\{showFootnotes && <div className="tokamakCadFootnotes">/);
  assert.match(workspace, /showFootnotes=\{false\}/);
  assert.doesNotMatch(workspace, /DeviceGovernanceNote|deviceGovernanceNote|devicePreviewPolicy|devicePhysicsBoundary/);
  assert.doesNotMatch(workspace, /PREVIEW SECURITY POLICY|AXISYMMETRIC FLUX SURFACE/);
});

test('EFIT panel exposes shot selection, real time scrubbing, playback and quality boundaries', async () => {
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const transport = await source('app/components/efit/EfitTimelineControls.tsx');
  const equilibrium = await source('app/components/efit/EfitEquilibriumChart.tsx');
  const messages = await source('app/i18n/messages.ts');
  assert.match(panel, /t\('efit\.shot'\)/);
  assert.match(panel, /t\('efit\.quality'\)/);
  assert.match(panel, /t\('efit\.dataGap'/);
  assert.match(transport, /t\('efit\.realTimeline'\)/);
  assert.match(transport, /t\('efit\.previous'\)/);
  assert.match(transport, /t\('efit\.loop'\)/);
  assert.match(equilibrium, /t\('efit\.chart\.equilibrium'\)/);
  assert.match(messages, /'efit\.shot': '放电炮号'/);
  assert.match(equilibrium, /LCFS/);
  assert.match(equilibrium, /t\('efit\.chart\.magneticAxis'\)/);
});

test('EFIT sidebar keeps operational evidence compact and uses designed tabular numerals', async () => {
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const shotGeometry = await source('app/components/efit/shot-geometry.ts');
  const css = await source('app/components/efit/efit-panel.css');

  assert.match(panel, /EXL-50U · EFIT/);
  assert.doesNotMatch(panel, /<p>\{t\('efit\.description'\)\}<\/p>/,
    'the sidebar header should not spend vertical space on governance copy');
  assert.doesNotMatch(panel, /quality\?\.messages\.map/,
    'frame-quality diagnostics belong in the compact quality tooltip, not the primary visual rail');
  assert.match(panel, /title=\{qualityDetail\}/);
  assert.match(panel, /title=\{topologyDetail\}/);
  assert.match(panel, /\{topologyLabel\} · X\{topologyXCount\}/);
  assert.match(panel, /t\('efit\.missingFrames'/);
  assert.match(shotGeometry, /return `#\$\{shot\.shot\} · \$\{formatFrames\(displayableFrames\)\}`/,
    'shot options should contain only the shot identifier and usable frame count');

  assert.match(cssRule(css, '.efitPanel'), /--efit-numeric-font:/);
  for (const selector of ['.efitMetricStrip strong', '.efitScrubberLabels']) {
    const declarations = cssRule(css, selector);
    assert.match(declarations, /font-(?:family|variant-numeric):[^;]*(?:var\(--efit-numeric-font\)|tabular-nums)/,
      `${selector} must use the EFIT numeric typography contract`);
  }
  assert.match(css, /\.efitTimeReadout strong,\s*\.efitTimeReadout span\s*\{[^}]*font-family:\s*var\(--efit-numeric-font\)/s);
  const lightPanel = cssRule(css, ":root[data-theme='light'] .efitPanel");
  assert.match(lightPanel, /background:/);
  assert.match(lightPanel, /var\(--color-surface-raised\)/);
  assert.match(cssRule(css, ":root[data-theme='light'] .efitMetricStrip"), /var\(--color-surface-raised\)/);
  assert.match(cssRule(css, ":root[data-theme='light'] .efitTransport"), /var\(--color-surface-raised\)/);
});

test('EFIT signal groups keep Ip/R/Z as default and expose reviewed G-file scalars without bridging gaps', async () => {
  const signals = await source('app/components/efit/EfitSignalsChart.tsx');
  const canvas = await source('app/components/efit/EfitCanvasChart.tsx');
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const messages = await source('app/i18n/messages.ts');
  const css = await source('app/components/efit/efit-panel.css');
  assert.match(signals, /useState<EfitSignalGroupId>\('axis'\)/);
  assert.match(signals, /signals: \[ip, \{ name: 'Raxis'/);
  assert.match(signals, /name: 'Zaxis'/);
  assert.match(signals, /name: 'Rmin'.*?frame\.lcfsRMinM/s);
  assert.match(signals, /name: 'Rmax'.*?frame\.lcfsRMaxM/s);
  assert.match(signals, /name: 'B₀'.*?frame\.bcentrT/s);
  assert.match(signals, /name: 'q95'.*?frame\.q95/s);
  assert.match(signals, /<select[\s\S]*?value=\{signalGroupId\}/);
  assert.match(signals, /activeGroup\.signals\.map/);
  assert.match(signals, /legend:\s*\{\s*show:\s*false\s*\}/);
  assert.match(signals, /className="efitSignalToolbar"[\s\S]*className="efitSignalLegend"[\s\S]*className="efitSignalPicker"/);
  assert.match(signals, /backgroundColor:\s*signalColors\[index\]/);
  assert.match(signals, /connectNulls:\s*false/);
  const staticOption = signals.slice(signals.indexOf('const option = useMemo'), signals.indexOf('const cursorOption = useMemo'));
  assert.doesNotMatch(staticOption, /currentTimeMs/,
    'playback time must not rebuild the full signal-series option');
  assert.match(signals, /const cursorOption = useMemo<EChartsCoreOption>/);
  assert.match(signals, /id:\s*EFIT_SIGNAL_CURSOR_SERIES_ID[\s\S]*?markLine:/);
  assert.match(signals, /incrementalOption=\{cursorOption\}/);
  assert.match(canvas, /incrementalOption\?: EChartsCoreOption/);
  assert.match(canvas, /setOption\(incrementalOption, \{ notMerge: false, lazyUpdate: true \}\)/,
    'cursor-only updates must use ECharts merge semantics');
  assert.match(signals, /EFIT_SIGNAL_WINDOW_MS = Object\.freeze\(\{ min: 0, max: 1000 \}\)/);
  assert.match(signals, /min: EFIT_SIGNAL_WINDOW_MS\.min/);
  assert.match(signals, /max: EFIT_SIGNAL_WINDOW_MS\.max/);
  assert.match(signals, /interval: 200/);
  assert.doesNotMatch(signals, /dataZoom:/, 'the reviewed 0–1.0 s window must not be silently zoomed to another range');
  assert.match(messages, /'efit\.signalGroupLcfs': 'LCFS Rmin \/ Rmax'/);
  assert.match(messages, /'efit\.signalGroupField': '中心磁场 B₀'/);
  assert.doesNotMatch(panel, /className="efitChartCard efitSignalsCard"\s+title=/);
  assert.match(panel, /className="efitChartCard efitSignalsCard"\s+aria-label=/);
  assert.match(cssRule(css, '.efitSignalToolbar'), /grid-template-columns:\s*minmax\(150px, 1fr\) auto/);
  assert.match(cssRule(css, '.efitSignalLegend'), /display:\s*flex/);
  assert.match(cssRule(css, '.efitSignalPicker select'), /border:\s*1px solid var\(--efit-line\)/);
  assert.match(cssRule(css, ":root[data-theme='light'] .efitSignalPicker select"), /var\(--color-surface-raised\)/);
  assert.match(css, /@container\s*\(max-width:\s*420px\)[\s\S]*\.efitSignalToolbar\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});

test('EFIT plasma colour field is a contour-constrained psiN display in both 2D and 3D', async () => {
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const equilibrium = await source('app/components/efit/EfitEquilibriumChart.tsx');
  const runtime = await source('app/components/efit/echarts-canvas-runtime.ts');
  const palette = await source('app/components/efit/psi-n-palette.ts');
  const overlay = await source('app/components/device-viewer/EfitThreeOverlay.ts');
  const viewer = await source('app/components/TokamakCadViewer.tsx');
  const messages = await source('app/i18n/messages.ts');

  assert.match(panel, /t\('efit\.equilibriumCard'\)/);
  assert.match(panel, /t\('efit\.equilibriumCardCopy'\)/);
  assert.match(messages, /R–Z 磁通分带云图与偏滤器拓扑/);
  assert.match(messages, /非温度\/密度/);
  assert.match(equilibrium, /type: 'custom'/);
  assert.match(equilibrium, /bandPsiN/);
  assert.match(equilibrium, /t\('efit\.chart\.frameAria'/);
  assert.match(equilibrium, /orient: 'vertical'/);
  assert.match(equilibrium, /right: 4/);
  assert.match(equilibrium, /top: 'middle'/);
  assert.match(equilibrium, /const PSI_N_COLORBAR_SHORT_PX = 7/);
  assert.match(equilibrium, /const PSI_N_COLORBAR_LONG_PX = 104/);
  assert.match(equilibrium, /itemWidth: PSI_N_COLORBAR_SHORT_PX/);
  assert.match(equilibrium, /itemHeight: PSI_N_COLORBAR_LONG_PX/);
  assert.match(equilibrium, /grid: \{ left: 56, right: 64, top: 24, bottom: 48/);
  assert.match(runtime, /CustomChart/);
  assert.match(runtime, /VisualMapComponent/);
  assert.match(palette, /colorForPsiN/);
  assert.match(overlay, /EFIT_PSI_N_BANDED_SECTION/);
  assert.match(overlay, /EFIT_PSI_N_BANDED_SECTION_OPPOSITE/);
  assert.match(overlay, /publishedContours/);
  assert.match(overlay, /bandPsiN/);
  assert.match(viewer, /t\('viewer\.psiSection'\)/);
});

test('optional divertor topology renders as open scientific overlays without contaminating psiN fill bands', async () => {
  const types = await source('app/components/efit/types.ts');
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const equilibrium = await source('app/components/efit/EfitEquilibriumChart.tsx');
  const css = await source('app/components/efit/efit-panel.css');
  const overlay = await source('app/components/device-viewer/EfitThreeOverlay.ts');

  assert.match(types, /'near-double-null'/);
  assert.match(types, /role\?: 'primary' \| 'secondary'/);
  assert.match(types, /topology\?: EfitTopology/);
  assert.match(types, /separatrixLegs: readonly EfitSeparatrixLeg\[\]/);

  assert.match(equilibrium, /const separatrixData =/);
  assert.match(equilibrium, /vectorPairs\(leg\.rM, leg\.zM, leg\.validPoints, false\)/,
    'divertor legs must remain open');
  assert.match(equilibrium, /const nestedContours = contourData/,
    'only reviewed closed contourData may enter the flux-band polygons');
  assert.doesNotMatch(equilibrium, /nestedContours\s*=\s*separatrixData/);
  assert.match(equilibrium, /name: t\('efit\.chart\.xPoint'\)/);
  assert.match(equilibrium, /name: t\('efit\.chart\.limiterIntersection'\)/);
  assert.match(panel, /t\('efit\.nearDoubleHelp'\)/);
  assert.match(equilibrium, /activityRole === 'secondary'/);
  assert.match(equilibrium, /topologyGraph\?\.edges/);
  assert.match(equilibrium, /near-boundary/);

  assert.match(panel, /t\('efit\.nearDoubleHelp'\)/);
  assert.doesNotMatch(panel, /DIVERTOR TOPOLOGY \/ VISUALIZATION-DERIVED|efitTopologyBoundary/);
  assert.doesNotMatch(css, /\.efitTopologyBoundary/);
  assert.match(css, /\.efitStatusPill\.topology-near-double-null/);

  assert.match(overlay, /EFIT_SEPARATRIX_LEGS_RZ/);
  assert.match(overlay, /EFIT_PRIMARY_X_POINT_MARKERS_AND_LINES/);
  assert.match(overlay, /EFIT_SECONDARY_X_POINT_MARKERS_AND_LINES/);
  assert.match(overlay, /EFIT_NEAR_BOUNDARY_X_POINT_EVIDENCE_MARKERS/);
  assert.match(overlay, /EFIT_LIMITER_INTERSECTION_MARKERS_AND_RINGS/);
  assert.match(overlay, /const sectionPhis = \[phi, phi \+ Math\.PI\]/,
    'topology must appear on both sides of the axisymmetric section');
  assert.match(overlay, /frame\.topologyGraphPayload\?\.topologyGraph/,
    'the Three overlay must render arbitrary v2 graph nodes and edges directly');
  assert.match(overlay, /Never[\s\S]*?synthesize a divertor volume from graph edges/,
    'unreviewed v2 open regions must remain wireframe-only');
  assert.match(overlay, /hideTopology\(\);[\s\S]*?frameUsable/,
    'every frame update must clear stale topology before validating the next frame');
  const clippingBlock = overlay.slice(overlay.indexOf('const applyClipping'), overlay.indexOf('setLineResolution(context.renderer'));
  assert.match(clippingBlock, /material\.clippingPlanes/);
  for (const material of ['separatrixMaterial', 'primaryXMaterial', 'secondaryXMaterial', 'candidateXMaterial', 'strikeMaterial']) {
    assert.match(clippingBlock, new RegExp(material));
    assert.match(overlay, new RegExp(`${material}\\.dispose\\(\\)`));
  }
  assert.match(overlay, /evidenceRole:\s*node\.role/);
  assert.match(overlay, /point\.evidenceRole\s*===\s*'near-boundary'/);
  assert.match(overlay, /markerRole\s*=\s*efitXPointMarkerRole\(point\)/);
  assert.match(overlay, /showTopologyRings\s*&&\s*!candidate/,
    'only active boundary X points may receive a toroidal activity ring');
});

test('reviewed divertor region closes only through one unambiguous published limiter arc', () => {
  const limiter = {
    rM: [0, 2, 2, 0, 0],
    zM: [-2, -2, 2, 2, -2],
    validPoints: 5,
  };
  const topology = {
    kind: 'lower-single-null',
    xPoints: [{ rM: 1, zM: 0, role: 'primary' }],
    strikePoints: [
      { rM: 0.5, zM: -2, wallSegment: 0 },
      { rM: 1.5, zM: -2, wallSegment: 0 },
    ],
    separatrixLegs: [
      { rM: [1, 0.8, 0.5], zM: [0, -1, -2], validPoints: 3, xPointIndex: 0, strikePointIndex: 0, closed: false },
      { rM: [1, 1.2, 1.5], zM: [0, -1, -2], validPoints: 3, xPointIndex: 0, strikePointIndex: 1, closed: false },
    ],
  };

  const reviewed = deriveReviewedDivertorRegion(topology, limiter, { rM: 1, zM: 1 });
  assert.equal(reviewed.state, 'filled');
  assert.equal(reviewed.code, 'closed-reviewed-boundary');
  assert.deepEqual(reviewed.limiterArc, [[0.5, -2], [1.5, -2]], 'must use the actual limiter segment, not an invented strike chord');
  assert.ok(reviewed.polygon.length >= 5);

  const ambiguous = deriveReviewedDivertorRegion(topology, limiter);
  assert.equal(ambiguous.state, 'wireframe');
  assert.equal(ambiguous.code, 'ambiguous-limiter-arc');

  const selfIntersecting = deriveReviewedDivertorRegion({
    ...topology,
    separatrixLegs: [
      { ...topology.separatrixLegs[0], rM: [1, 1.4, 0.5] },
      { ...topology.separatrixLegs[1], rM: [1, 0.6, 1.5] },
    ],
  }, limiter, { rM: 1, zM: 1 });
  assert.equal(selfIntersecting.state, 'wireframe');
  assert.equal(selfIntersecting.code, 'invalid-closed-boundary');
});

test('published shot 18303 fills complete divertor boundaries and rejects incomplete legs', async () => {
  const dataSource = createEfitBinaryDataSource({ fetch: localEfitFetch });
  const manifest = await dataSource.loadManifest();
  const shot = manifest.shots.find((candidate) => candidate.shot === 18303);
  assert.ok(shot);
  const completeIndex = shot.frames.findIndex((frame) => frame.timeMs === 350);
  const incompleteIndex = shot.frames.findIndex((frame) => frame.timeMs === 346);
  assert.ok(completeIndex >= 0 && incompleteIndex >= 0);

  const complete = await dataSource.loadFrame(18303, completeIndex);
  const completeRegion = deriveReviewedDivertorRegion(
    complete.topology,
    manifest.geometry.limiterRzM,
    { rM: complete.rAxisM, zM: complete.zAxisM },
  );
  assert.equal(complete.topology?.kind, 'upper-single-null');
  assert.equal(completeRegion.state, 'filled');
  assert.equal(completeRegion.code, 'closed-reviewed-boundary');
  assert.ok(completeRegion.limiterArc.length > 2, 'the published multi-segment limiter arc must be preserved between strike points');

  const incomplete = await dataSource.loadFrame(18303, incompleteIndex);
  const incompleteRegion = deriveReviewedDivertorRegion(
    incomplete.topology,
    manifest.geometry.limiterRzM,
    { rM: incomplete.rAxisM, zM: incomplete.zAxisM },
  );
  assert.equal(incompleteRegion.state, 'wireframe');
  assert.equal(incompleteRegion.code, 'separatrix-leg-count');
});

test('divertor region has independent honest 2D and 3D rendering lifecycles', async () => {
  const panel = await source('app/components/efit/EfitPanel.tsx');
  const equilibrium = await source('app/components/efit/EfitEquilibriumChart.tsx');
  const overlay = await source('app/components/device-viewer/EfitThreeOverlay.ts');
  const viewer = await source('app/components/TokamakCadViewer.tsx');

  assert.match(equilibrium, /deriveReviewedDivertorRegion/);
  assert.match(equilibrium, /name: t\('efit\.chart\.divertorRegion'\)/);
  assert.match(equilibrium, /rgba\(255, 132, 55, \.28\)/);
  assert.match(panel, /t\('efit\.boundaryRegion'\)/);
  assert.match(panel, /t\('efit\.reviewedClosed'\)/);
  assert.match(panel, /t\('efit\.wireframeOnly'\)/);
  assert.match(panel, /t\('efit\.equilibriumCardCopy'\)/);
  assert.match(overlay, /EFIT_DIVERTOR_TOPOLOGY_SECTION_REGION/);
  assert.match(overlay, /EFIT_DIVERTOR_TOPOLOGY_REVOLVED_REGION/);
  assert.match(overlay, /ShapeUtils\.triangulateShape/);
  assert.match(overlay, /region\.state === 'filled'/);
  assert.match(overlay, /divertorSectionRegion\.visible = false/);
  assert.match(overlay, /divertorRevolvedRegion\.visible = false/);
  const clipping = overlay.slice(overlay.indexOf('const applyClipping'), overlay.indexOf('setLineResolution(context.renderer'));
  for (const material of ['divertorSectionMaterial', 'divertorRevolvedMaterial']) {
    assert.match(clipping, new RegExp(material));
    assert.match(overlay, new RegExp(`${material}\\.dispose\\(\\)`));
  }
  assert.match(viewer, /resolveShotGeometry\(snapshot\.manifest, shotId\)\?\.limiterRzM/);
  assert.match(viewer, /return limiterRzM \? \{ \.\.\.frame, limiterRzM \} : frame/);
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
