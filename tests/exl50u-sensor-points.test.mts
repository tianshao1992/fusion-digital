import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import test from 'node:test';
import { Group, Mesh, Raycaster, Sprite, Vector3 } from 'three';
import {
  DEFAULT_EXL50U_SENSOR_FAMILY_COLORS,
  EXL50U_SENSOR_FAMILIES,
  normalizeExl50uSensorColorHex,
  normalizeExl50uSensorFamilyColors,
  normalizeExl50uSensorPointColorOverrides,
  resolveExl50uSensorPointColor,
} from '../app/components/device-viewer/exl50uSensorPointColors.ts';
import {
  EXL50U_SENSOR_ELEVATION_DATUM_MM,
  EXL50U_SENSOR_POINT_DATASET_URL,
  EXL50U_SENSOR_POINT_MANIFEST_URL,
  EXL50U_SENSOR_POINT_SCHEMA_VERSION,
  EXL50U_SENSOR_SOURCE_SHA256,
  exl50uSensorPointToWebMetres,
  parseExl50uSensorPointDataset,
  updateExl50uSensorPoint,
} from '../app/components/device-viewer/exl50uSensorPoints.ts';
import {
  createEhl2DiagnosticThreeOverlay,
  type Ehl2DiagnosticOverlayOptions,
} from '../app/components/device-viewer/Ehl2DiagnosticThreeOverlay.ts';

const packageDirectory = new URL('../public/models/exl50u-sensor-points-v1/', import.meta.url);
const datasetPath = new URL('sensor-points.json', packageDirectory);
const manifestPath = new URL('manifest.json', packageDirectory);
const appDirectory = new URL('../app/', import.meta.url);
const scriptsDirectory = new URL('../scripts/', import.meta.url);
const publicDirectory = new URL('../public/', import.meta.url);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function approximate(actual: readonly number[], expected: readonly number[], tolerance = 2e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance, `${value} != ${expected[index]} at axis ${index}`);
  });
}

async function loadRaw() {
  return JSON.parse(await readFile(datasetPath, 'utf8')) as Record<string, unknown>;
}

async function loadDataset() {
  return parseExl50uSensorPointDataset(await loadRaw());
}

async function listFiles(directory: URL): Promise<string[]> {
  const root = directory.pathname.startsWith('/') && /^[A-Za-z]:/.test(directory.pathname.slice(1))
    ? decodeURIComponent(directory.pathname.slice(1))
    : decodeURIComponent(directory.pathname);
  const visit = async (current: string): Promise<string[]> => {
    const entries = await readdir(current, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => {
      const path = join(current, entry.name);
      return entry.isDirectory() ? visit(path) : Promise.resolve([path]);
    }))).flat();
  };
  return visit(root);
}

test('the manifest binds the exact 76-record dataset bytes, hash and family counts', async () => {
  const datasetBytes = await readFile(datasetPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const dataset = parseExl50uSensorPointDataset(JSON.parse(datasetBytes.toString('utf8')));

  assert.equal(EXL50U_SENSOR_POINT_DATASET_URL, '/models/exl50u-sensor-points-v1/sensor-points.json');
  assert.equal(EXL50U_SENSOR_POINT_MANIFEST_URL, '/models/exl50u-sensor-points-v1/manifest.json');
  assert.equal(dataset.schemaVersion, EXL50U_SENSOR_POINT_SCHEMA_VERSION);
  assert.equal(dataset.source.sha256, EXL50U_SENSOR_SOURCE_SHA256);
  assert.equal(dataset.recordCount, 76);
  assert.equal(dataset.records.length, 76);
  assert.deepEqual(dataset.familyCounts, { LD: 42, PF: 7, TF: 14, TF_V: 12, SMOKE: 1 });
  assert.deepEqual(
    dataset.records.reduce<Record<string, number>>((counts, point) => {
      counts[point.family] = (counts[point.family] ?? 0) + 1;
      return counts;
    }, {}),
    dataset.familyCounts,
  );
  assert.equal(manifest.dataset.path, EXL50U_SENSOR_POINT_DATASET_URL);
  assert.equal(manifest.dataset.schemaVersion, EXL50U_SENSOR_POINT_SCHEMA_VERSION);
  assert.equal(manifest.dataset.bytes, datasetBytes.length);
  assert.equal(manifest.dataset.sha256, createHash('sha256').update(datasetBytes).digest('hex').toUpperCase());
  assert.equal(manifest.dataset.recordCount, 76);
  assert.deepEqual(manifest.dataset.familyCounts, dataset.familyCounts);
});

test('the reviewed cylindrical tuple uses the 4805 mm datum and one strict web-frame transform', async () => {
  const dataset = await loadDataset();
  assert.equal(EXL50U_SENSOR_ELEVATION_DATUM_MM, 4_805);
  assert.deepEqual(dataset.coordinateSystem.sourceTuple, ['elevation_mm', 'radius_mm', 'toroidal_deg']);
  assert.deepEqual(dataset.coordinateSystem.sourceUnits, ['millimetre', 'millimetre', 'degree']);
  assert.equal(dataset.coordinateSystem.elevationDatumMm, 4_805);
  assert.match(dataset.coordinateSystem.sourceToWebPoint, /H-4805/);
  approximate(exl50uSensorPointToWebMetres({ hMm: 4_805, rMm: 1_000, phiDeg: 0 }), [1, 0, 0]);
  approximate(exl50uSensorPointToWebMetres({ hMm: 5_805, rMm: 1_000, phiDeg: 90 }), [0, 1, -1]);
  for (const point of dataset.records) {
    approximate(point.webMetres, exl50uSensorPointToWebMetres(point.sourceTuple));
  }
});

test('the parser fails closed on datum, transform, ordering, identity and coordinate drift', async () => {
  const raw = await loadRaw();
  type MutableDataset = {
    coordinateSystem: { elevationDatumMm: number; sourceToWebPoint: string };
    runtimeGeometry: { geometryAssets: string[]; redundantObjOrStlLoaded: boolean };
    records: Array<{
      id: string;
      sourceKey: string;
      sourceTuple: { hMm: number; rMm: number; phiDeg: number };
      webMetres: number[];
    }>;
  };
  const mutations: Array<(value: MutableDataset) => void> = [
    (value) => { value.coordinateSystem.elevationDatumMm = 0; },
    (value) => { value.coordinateSystem.sourceToWebPoint = '[H,R,phi] -> unknown'; },
    (value) => { value.records[0].webMetres[1] += 0.01; },
    (value) => { value.records[0].id = value.records[1].id; },
    (value) => { value.records[0].sourceKey = value.records[1].sourceKey; },
    (value) => { value.records.reverse(); },
    (value) => { value.runtimeGeometry.geometryAssets.push('/duplicate.obj'); },
    (value) => { value.runtimeGeometry.redundantObjOrStlLoaded = true; },
  ];
  for (const mutate of mutations) {
    const candidate = clone(raw) as MutableDataset;
    mutate(candidate);
    assert.throws(() => parseExl50uSensorPointDataset(candidate));
  }
});

test('stable generated ids keep TF01/TF1 and TF02/TF2 distinct', async () => {
  const dataset = await loadDataset();
  assert.equal(new Set(dataset.records.map((point) => point.id)).size, 76);
  assert.equal(new Set(dataset.records.map((point) => point.sourceKey)).size, 76);
  assert.deepEqual(dataset.records.map((point) => point.id), Array.from(
    { length: 76 },
    (_, index) => `EXL50U-SP-${String(index + 1).padStart(3, '0')}`,
  ));

  const bySourceKey = new Map(dataset.records.map((point) => [point.sourceKey, point]));
  for (const [padded, compact] of [['TF01', 'TF1'], ['TF02', 'TF2']] as const) {
    const paddedPoint = bySourceKey.get(padded);
    const compactPoint = bySourceKey.get(compact);
    assert.ok(paddedPoint, `missing ${padded}`);
    assert.ok(compactPoint, `missing ${compact}`);
    assert.notEqual(paddedPoint.id, compactPoint.id);
    assert.equal(Number(padded.slice(2)), Number(compact.slice(2)), 'fixture must exercise a normalized-label collision');
  }
});

test('all 76 nominal points stay inside the reviewed CAD package bounds', async () => {
  const dataset = await loadDataset();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const [minX, minY, minZ] = manifest.coordinateReview.cadBoundsMillimetres.min as [number, number, number];
  const [maxX, maxY, maxZ] = manifest.coordinateReview.cadBoundsMillimetres.max as [number, number, number];
  assert.equal(manifest.coordinateReview.pointCountInsideCadBounds, 76);
  for (const point of dataset.records) {
    const [webX, webY, webZ] = point.webMetres;
    assert.ok(webX * 1_000 >= minX && webX * 1_000 <= maxX, `${point.id} X leaves CAD bounds`);
    assert.ok(webY * 1_000 >= minZ && webY * 1_000 <= maxZ, `${point.id} Y leaves CAD bounds`);
    assert.ok(-webZ * 1_000 >= minY && -webZ * 1_000 <= maxY, `${point.id} Z leaves CAD bounds`);
  }
});

test('runtime delivery is marker-only on the existing model and contains no OBJ or STL payload', async () => {
  const dataset = await loadDataset();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(dataset.runtimeGeometry, {
    mode: 'marker-layer-on-existing-exl50u-model',
    geometryAssets: [],
    redundantObjOrStlLoaded: false,
  });
  assert.deepEqual(manifest.delivery, {
    existingDeviceModelOnly: true,
    markerLayerOnly: true,
    objIncluded: false,
    stlIncluded: false,
  });
  assert.deepEqual((await readdir(packageDirectory)).sort(), ['manifest.json', 'sensor-points.json']);
});

test('the marker palette is high-contrast, theme-stable and strictly configurable', async () => {
  assert.deepEqual(EXL50U_SENSOR_FAMILIES, ['LD', 'PF', 'TF', 'TF_V', 'SMOKE']);
  assert.deepEqual(DEFAULT_EXL50U_SENSOR_FAMILY_COLORS, {
    LD: '#E40046',
    PF: '#FFD600',
    TF: '#0057B8',
    TF_V: '#008A3B',
    SMOKE: '#F7F7F7',
  });
  assert.equal(normalizeExl50uSensorColorHex('#e40046'), '#E40046');
  for (const invalid of ['E40046', '#FFF', '#GG0046', '#E4004600', 'orange', '', null]) {
    assert.equal(normalizeExl50uSensorColorHex(invalid), null);
  }
  assert.deepEqual(normalizeExl50uSensorFamilyColors(DEFAULT_EXL50U_SENSOR_FAMILY_COLORS), DEFAULT_EXL50U_SENSOR_FAMILY_COLORS);
  assert.equal(normalizeExl50uSensorFamilyColors({ ...DEFAULT_EXL50U_SENSOR_FAMILY_COLORS, EXTRA: '#FFFFFF' }), null);

  const dataset = await loadDataset();
  const point = dataset.records[0];
  const overrides = normalizeExl50uSensorPointColorOverrides({ [point.id]: '#112233' }, new Set(dataset.records.map((item) => item.id)));
  assert.ok(overrides);
  assert.equal(resolveExl50uSensorPointColor(point, DEFAULT_EXL50U_SENSOR_FAMILY_COLORS, overrides), '#112233');
  assert.equal(normalizeExl50uSensorPointColorOverrides({ UNKNOWN: '#112233' }, new Set(dataset.records.map((item) => item.id))), null);
});

test('device point markers are pickable while reviewed port markers remain non-interactive', () => {
  const physicalRoot = new Group();
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot: physicalRoot });
  overlay.setOptions({
    kind: 'device-point-markers',
    labelLocale: 'en',
    depthMode: 'xray',
    pointMarkers: {
      layerId: 'exl50u-test-points',
      markerKind: 'exl50u-host-sensor-point',
      authority: 'test-nominal-point',
      coordinateFrame: 'EXL50U_CYLINDRICAL_H_R_PHI_V1',
      labelDetail: 'TEST POINT',
      interactive: true,
      selectedId: 'EXL50U-SP-001',
      selectedColor: 0x00ff00,
      outlineDarkColor: 0x0b0f14,
      outlineLightColor: 0xf8fafc,
      pointsWebMetres: [{ id: 'EXL50U-SP-001', positionWebMetres: [0, 0, 0], label: 'LD001', color: 0xe40046 }],
    },
  });
  physicalRoot.updateMatrixWorld(true);
  const centreRay = new Raycaster(new Vector3(0, 0, 2), new Vector3(0, 0, -1), 0, 5);
  assert.equal(overlay.pickPointMarker(centreRay), 'EXL50U-SP-001');
  const editableMarkers: Mesh[] = [];
  physicalRoot.traverse((node) => {
    if (node.userData.pointMarkerId === 'EXL50U-SP-001') editableMarkers.push(node as Mesh);
  });
  assert.equal(editableMarkers.length, 1);
  const editableMarker = editableMarkers[0];
  assert.ok(editableMarker.isMesh);
  assert.equal((editableMarker.material as unknown as { color: { getHex(): number } }).color.getHex(), 0xe40046, 'selection must preserve the custom fill colour');
  const contrastOutlines: Sprite[] = [];
  physicalRoot.traverse((node) => {
    if (node.userData.kind === 'point-marker-contrast-outline') contrastOutlines.push(node as Sprite);
  });
  assert.equal(contrastOutlines.length, 1);
  assert.ok(contrastOutlines[0].isSprite);
  assert.ok((contrastOutlines[0].material as { map?: unknown }).map, 'the marker must carry a black/white contrast-ring texture');

  overlay.setOptions({
    kind: 'device-point-markers',
    labelLocale: 'en',
    depthMode: 'xray',
    pointMarkers: {
      layerId: 'off-axis-point',
      markerKind: 'exl50u-host-sensor-point',
      authority: 'test-nominal-point',
      coordinateFrame: 'EXL50U_CYLINDRICAL_H_R_PHI_V1',
      labelDetail: 'TEST POINT',
      interactive: true,
      pointsWebMetres: [{ id: 'EXL50U-SP-002', positionWebMetres: [2, 0, 0] }],
    },
    portMarkers: {
      selectedId: 'S1@0',
      pointsWebMetres: [{ id: 'S1@0', positionWebMetres: [0, 0, 0], normalWeb: [0, 1, 0] }],
    },
  } as unknown as Ehl2DiagnosticOverlayOptions);
  physicalRoot.updateMatrixWorld(true);
  assert.equal(overlay.pickPointMarker(centreRay), null, 'reviewed port centres must not become editable sensor picks');
  overlay.dispose();
});

test('the EXL-50U UI exposes three analysis modes and versioned local point management', async () => {
  const workspace = await readFile(new URL('../app/digital-prototype/MultiDeviceWorkspace.tsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../app/digital-prototype/Exl50uSensorPointPanel.tsx', import.meta.url), 'utf8');
  for (const label of ['EFIT 平衡', '诊断可视化', '主机测点']) assert.match(workspace, new RegExp(label));
  for (const label of ['浏览定位', '单点编辑', '批量管理']) assert.match(panel, new RegExp(label));
  assert.match(panel, /fusiondigital\.exl50u\.sensor-draft\.v2/);
  assert.match(panel, /fusion-digital:exl50u-sensor-draft:v2:/);
  assert.match(panel, /fusion-digital:exl50u-sensor-draft:v1:/);
  assert.match(panel, /window\.localStorage\.setItem\(DRAFT_KEY/);
  assert.match(panel, /familyColors/);
  assert.match(panel, /pointColorOverrides/);
  assert.match(panel, /type="color"/);
  assert.match(panel, /跟随类别颜色/);
  assert.match(panel, /恢复默认色/);
  assert.match(panel, /统一该类颜色/);
  assert.match(panel, /'color_hex', 'color_source'/);
  assert.match(panel, /updateExl50uSensorPoint\(selectedPoint/);
  assert.match(panel, /value\.trim\(\) === ''/);
  assert.match(panel, /type="number" required/);
  assert.match(panel, /导出 JSON/);
  assert.match(panel, /导出 CSV/);
  assert.match(panel, /恢复公共基线/);
  assert.match(panel, /新增整机网格[\s\S]*?<dd>0<\/dd>/);

  const dataset = await loadDataset();
  const original = dataset.records[0];
  const updated = updateExl50uSensorPoint(original, {
    displayName: 'LD001 review',
    sourceTuple: { ...original.sourceTuple, phiDeg: 0 },
  });
  assert.equal(updated.id, original.id);
  assert.equal(updated.sourceKey, original.sourceKey);
  assert.equal(updated.displayName, 'LD001 review');
  approximate(updated.webMetres, exl50uSensorPointToWebMetres(updated.sourceTuple));
});

test('application source and public assets never reference or ship the two duplicate full-CAD files', async () => {
  const forbiddenBase = ['EXL-50U_', '\u4f20\u611f\u56681'].join('');
  const forbiddenFileNames = [`${forbiddenBase}.obj`, `${forbiddenBase}.stl`];
  const forbiddenSourceFolder = ['EXL50U', '_all'].join('');
  const roots = [appDirectory, scriptsDirectory, publicDirectory];
  const files = (await Promise.all(roots.map(listFiles))).flat();
  const normalizedPaths = files.map((path) => path.replaceAll('\\', '/'));
  for (const forbidden of forbiddenFileNames) {
    assert.ok(!normalizedPaths.some((path) => path.endsWith(`/${forbidden}`)), `${forbidden} must not be shipped`);
  }
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt']);
  for (const path of files.filter((file) => textExtensions.has(extname(file).toLowerCase()))) {
    const text = await readFile(path, 'utf8');
    assert.ok(!text.includes(forbiddenSourceFolder), `${path} references the source CAD folder`);
    for (const forbidden of forbiddenFileNames) {
      assert.ok(!text.includes(forbidden), `${path} references ${forbidden}`);
    }
  }
});
