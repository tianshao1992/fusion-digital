import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
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
