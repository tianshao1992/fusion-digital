import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Group, type BufferGeometry, type Material, type Object3D } from 'three';

import {
  DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT,
  EHL2_DIAGNOSTIC_SCENARIOS,
  EHL2_DIAGVIEW2_SOURCE,
  buildEhl2DiagnosticScenarioGeometry,
  diagView2PointToEhl2Web,
  normalizeEhl2DiagnosticOverlayOptions,
  scenarioForId,
  scenarioIdsForMode,
  type Ehl2DiagnosticOverlayOptions,
  type Vec3Tuple,
} from '../app/components/device-viewer/ehl2DiagView2.ts';
import { parseDeviceCatalog } from '../app/digital-prototype/deviceCatalog.ts';
import { createEhl2DiagnosticThreeOverlay } from '../app/components/device-viewer/Ehl2DiagnosticThreeOverlay.ts';
import {
  buildDiagView2PreviewRays,
  createDiagView2RayResult,
  createDefaultDiagView2Design,
  resolveDiagView2Pose,
  type DiagView2DiagnosticDesign,
} from '../app/components/device-viewer/ehl2DiagView2Core.ts';

const EXPECTED_SCENARIOS = [
  {
    id: 'vs3-270', diagnosticId: 'VS3', azimuthDeg: 270,
    spectralBands: ['infrared', 'visible'], equipmentSets: 2,
    sourceSlides: [1, 6, 7], elevationReferenceAvailable: true,
    includedInCompositeAssessment: true,
  },
  {
    id: 'vs3-135', diagnosticId: 'VS3', azimuthDeg: 135,
    spectralBands: ['infrared', 'visible'], equipmentSets: 2,
    sourceSlides: [2, 6, 7], elevationReferenceAvailable: true,
    includedInCompositeAssessment: true,
  },
  {
    id: 'vs2-0', diagnosticId: 'VS2', azimuthDeg: 0,
    spectralBands: ['visible'], equipmentSets: 1,
    sourceSlides: [3, 6, 7], elevationReferenceAvailable: true,
    includedInCompositeAssessment: true,
  },
  {
    id: 'vs2-225', diagnosticId: 'VS2', azimuthDeg: 225,
    spectralBands: ['visible'], equipmentSets: 1,
    sourceSlides: [4, 6, 7], elevationReferenceAvailable: true,
    includedInCompositeAssessment: true,
  },
  {
    id: 'vs4-112-5', diagnosticId: 'VS4', azimuthDeg: 112.5,
    spectralBands: [], equipmentSets: null,
    sourceSlides: [5], elevationReferenceAvailable: false,
    includedInCompositeAssessment: false,
  },
] as const;

function approximate(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) <= 1e-9,
    message ?? `expected ${actual} to be within 1e-9 of ${expected}`);
}

function approximateVector(actual: Vec3Tuple, expected: Vec3Tuple, message?: string) {
  actual.forEach((coordinate, axis) => approximate(
    coordinate,
    expected[axis],
    `${message ?? 'vector'} axis ${axis}: expected ${coordinate} to equal ${expected[axis]}`,
  ));
}

function approximateFloat32Vector(actual: Vec3Tuple, expected: Vec3Tuple, message?: string) {
  actual.forEach((coordinate, axis) => assert.ok(
    Math.abs(coordinate - expected[axis]) <= 1e-6,
    `${message ?? 'float32 vector'} axis ${axis}: expected ${coordinate} to equal ${expected[axis]}`,
  ));
}

function subtract(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(vector: Vec3Tuple) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: Vec3Tuple, factor: number): Vec3Tuple {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3Tuple, b: Vec3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(vector: Vec3Tuple): Vec3Tuple {
  return scale(vector, 1 / length(vector));
}

function rotateAroundAxis(vector: Vec3Tuple, axis: Vec3Tuple, angleDeg: number): Vec3Tuple {
  const unit = normalize(axis);
  const angle = angleDeg * Math.PI / 180;
  return add(
    add(scale(vector, Math.cos(angle)), scale(cross(unit, vector), Math.sin(angle))),
    scale(unit, dot(unit, vector) * (1 - Math.cos(angle))),
  );
}

function expectedDiagView2Endpoint(
  azimuthDeg: number,
  horizontalDeg: number,
  verticalDeg: number,
  yawDeg: number,
  pitchDeg: number,
  lengthMetres: number,
) {
  const phi = azimuthDeg * Math.PI / 180;
  const eR: Vec3Tuple = [Math.cos(phi), Math.sin(phi), 0];
  const origin: Vec3Tuple = scale(eR, 2.55);
  const inward = scale(eR, -1);
  const horizontalAxis = normalize(cross([0, 0, 1], eR));
  const verticalAxis = normalize(cross(inward, horizontalAxis));
  let direction = normalize(add(
    add(inward, scale(horizontalAxis, Math.tan(horizontalDeg * Math.PI / 180))),
    scale(verticalAxis, Math.tan(verticalDeg * Math.PI / 180)),
  ));
  // DiagView2 column-vector composition: yaw first around v, then pitch around u.
  direction = rotateAroundAxis(direction, verticalAxis, yawDeg);
  direction = rotateAroundAxis(direction, horizontalAxis, pitchDeg);
  return diagView2PointToEhl2Web(add(origin, scale(normalize(direction), lengthMetres)));
}

test('EHL-2 DiagView2 preserves all five PPT scenarios while the composite uses only the reviewed four', () => {
  assert.equal(EHL2_DIAGNOSTIC_SCENARIOS.length, 5);
  assert.equal(new Set(EHL2_DIAGNOSTIC_SCENARIOS.map((scenario) => scenario.id)).size, 5);

  for (const expected of EXPECTED_SCENARIOS) {
    const scenario = scenarioForId(expected.id);
    assert.equal(scenario.id, expected.id);
    assert.equal(scenario.diagnosticId, expected.diagnosticId);
    assert.equal(scenario.azimuthDeg, expected.azimuthDeg);
    assert.equal(scenario.sourceFovLabel, '±50');
    assert.deepEqual(scenario.spectralBands, expected.spectralBands);
    assert.equal(scenario.equipmentSets, expected.equipmentSets);
    assert.deepEqual(scenario.sourceSlides, expected.sourceSlides);
    assert.equal(scenario.elevationReferenceAvailable, expected.elevationReferenceAvailable);
    assert.equal(scenario.includedInCompositeAssessment, expected.includedInCompositeAssessment);
  }

  assert.deepEqual(
    scenarioIdsForMode(DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS),
    ['vs3-270', 'vs3-135', 'vs2-0', 'vs2-225'],
  );
  assert.ok(!scenarioIdsForMode(DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS).includes('vs4-112-5'));
  assert.equal(
    EHL2_DIAGNOSTIC_SCENARIOS.reduce((total, scenario) => total + (scenario.equipmentSets ?? 0), 0),
    6,
    'the PPT declares six equipment sets, not six reviewed individual lines of sight',
  );
});

test('EHL-2 DiagView2 blind-zone summary exactly matches slides 6 and 7', () => {
  assert.deepEqual(EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.sourceSlides, [6, 7]);
  assert.deepEqual(EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.diagnosticWindowAzimuthsDeg, [202.5, 292.5]);
  assert.equal(EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.centerPost, 'none');
  assert.equal(EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.lowerDivertor, 'none');
  assert.deepEqual(EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.upperDivertor, {
    status: 'partial', nearAzimuthDeg: 270,
  });
});

test('the ambiguous PPT ±50 label is never promoted to a reviewed vertical FOV', () => {
  assert.equal(DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.horizontalHalfAngleDeg, 50);
  assert.equal(DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.verticalHalfAngleDeg, 0);

  const scenario = scenarioForId('vs3-270');
  const reviewed = buildEhl2DiagnosticScenarioGeometry(
    scenario,
    DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
  );
  assert.equal(reviewed.authority, 'ppt-planar-reference');
  assert.equal(reviewed.frustumCornersWebMetres, null);

  const coverageWithUnreviewedVerticalInput = buildEhl2DiagnosticScenarioGeometry(scenario, {
    ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
    verticalHalfAngleDeg: 25,
  });
  assert.equal(coverageWithUnreviewedVerticalInput.authority, 'ppt-planar-reference');
  assert.equal(coverageWithUnreviewedVerticalInput.frustumCornersWebMetres, null,
    'coverage mode must remain the planar PPT reference even if stale UI state contains a vertical value');

  const explicitUserAssumption = buildEhl2DiagnosticScenarioGeometry(scenario, {
    ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
    mode: 'inspect',
    activeScenarioId: scenario.id,
    verticalHalfAngleDeg: 25,
  });
  assert.equal(explicitUserAssumption.authority, 'user-assumption');
  assert.equal(explicitUserAssumption.frustumCornersWebMetres?.length, 4);

  for (const changedGeometry of [
    { horizontalHalfAngleDeg: 42 },
    { lengthMetres: 2.8 },
  ]) {
    const geometry = buildEhl2DiagnosticScenarioGeometry(scenario, {
      ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
      mode: 'inspect',
      activeScenarioId: scenario.id,
      ...changedGeometry,
    });
    assert.equal(
      geometry.authority,
      'user-assumption',
      'every editable geometric deviation must be labelled as a user assumption',
    );
  }
});

test('DiagView2 scientific coordinates map into the EHL-2 right-handed Y-up web frame', () => {
  const eX = diagView2PointToEhl2Web([1, 0, 0]);
  const eY = diagView2PointToEhl2Web([0, 1, 0]);
  const eZ = diagView2PointToEhl2Web([0, 0, 1]);
  assert.deepEqual(eX, [1, 0, -0]);
  assert.deepEqual(eY, [0, 0, -1]);
  assert.deepEqual(eZ, [0, 1, -0]);
  approximateVector(cross(eX, eY), eZ, 'right-handed mapped basis');

  for (const point of [[2, -3, 4], [-0.25, 1.5, 8]] as const) {
    approximate(length(diagView2PointToEhl2Web(point)), length(point), 'mapping must be a rigid rotation');
  }

  const zeroDegree = buildEhl2DiagnosticScenarioGeometry(
    scenarioForId('vs2-0'),
    DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
  );
  approximateVector(zeroDegree.originWebMetres, [2.55, 0, -0]);
  approximateVector(zeroDegree.opticalAxisEndWebMetres, [-0.65, 0, -0]);

  const twoHundredSeventy = buildEhl2DiagnosticScenarioGeometry(
    scenarioForId('vs3-270'),
    DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
  );
  approximateVector(twoHundredSeventy.originWebMetres, [0, 0, 2.55], '270-degree port origin');
  approximateVector(twoHundredSeventy.opticalAxisEndWebMetres, [0, 0, -0.65], '270-degree inward optical axis');

  for (const scenario of EHL2_DIAGNOSTIC_SCENARIOS) {
    const geometry = buildEhl2DiagnosticScenarioGeometry(
      scenario,
      DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
    );
    for (const endpoint of [geometry.opticalAxisEndWebMetres, ...geometry.planarBoundaryEndsWebMetres]) {
      assert.ok(endpoint.every(Number.isFinite), `${scenario.id} must produce finite web coordinates`);
      approximate(length(subtract(endpoint, geometry.originWebMetres)), 3.2,
        `${scenario.id} endpoints must retain the reviewed ray length`);
    }
  }
});

test('inspection geometry follows the DiagView2 yaw-then-pitch column-vector rotation formula', () => {
  const scenario = scenarioForId('vs3-135');
  const options: Ehl2DiagnosticOverlayOptions = {
    ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
    mode: 'inspect',
    activeScenarioId: scenario.id,
    horizontalHalfAngleDeg: 37,
    verticalHalfAngleDeg: 12,
    yawDeg: -11,
    pitchDeg: 7,
    lengthMetres: 2.4,
  };
  const geometry = buildEhl2DiagnosticScenarioGeometry(scenario, options);
  approximateVector(
    geometry.opticalAxisEndWebMetres,
    expectedDiagView2Endpoint(scenario.azimuthDeg, 0, 0, options.yawDeg, options.pitchDeg, options.lengthMetres),
    'optical axis',
  );
  approximateVector(
    geometry.planarBoundaryEndsWebMetres[0],
    expectedDiagView2Endpoint(
      scenario.azimuthDeg, -options.horizontalHalfAngleDeg, 0,
      options.yawDeg, options.pitchDeg, options.lengthMetres,
    ),
    'negative planar boundary',
  );
  approximateVector(
    geometry.planarBoundaryEndsWebMetres[1],
    expectedDiagView2Endpoint(
      scenario.azimuthDeg, options.horizontalHalfAngleDeg, 0,
      options.yawDeg, options.pitchDeg, options.lengthMetres,
    ),
    'positive planar boundary',
  );
  assert.ok(geometry.frustumCornersWebMetres);
  const expectedCornerAngles = [
    [-options.horizontalHalfAngleDeg, -options.verticalHalfAngleDeg],
    [options.horizontalHalfAngleDeg, -options.verticalHalfAngleDeg],
    [options.horizontalHalfAngleDeg, options.verticalHalfAngleDeg],
    [-options.horizontalHalfAngleDeg, options.verticalHalfAngleDeg],
  ] as const;
  geometry.frustumCornersWebMetres.forEach((corner, index) => approximateVector(
    corner,
    expectedDiagView2Endpoint(
      scenario.azimuthDeg,
      expectedCornerAngles[index][0],
      expectedCornerAngles[index][1],
      options.yawDeg,
      options.pitchDeg,
      options.lengthMetres,
    ),
    `frustum corner ${index}`,
  ));
});

test('DiagView2 option normalization fails closed and comparison never invents scenario ids', () => {
  const normalized = normalizeEhl2DiagnosticOverlayOptions({
    mode: 'invalid' as Ehl2DiagnosticOverlayOptions['mode'],
    activeScenarioId: 'invalid' as Ehl2DiagnosticOverlayOptions['activeScenarioId'],
    compareScenarioIds: ['vs3-270', 'vs3-270', 'invalid' as never, 'vs4-112-5'],
    horizontalHalfAngleDeg: Number.POSITIVE_INFINITY,
    verticalHalfAngleDeg: -4,
    pitchDeg: 99,
    yawDeg: -99,
    lengthMetres: Number.NaN,
  });
  assert.equal(normalized.mode, 'coverage');
  assert.equal(normalized.activeScenarioId, 'vs3-270');
  assert.deepEqual(normalized.compareScenarioIds, ['vs3-270', 'vs4-112-5']);
  assert.equal(normalized.horizontalHalfAngleDeg, 1);
  assert.equal(normalized.verticalHalfAngleDeg, 0);
  assert.equal(normalized.pitchDeg, 35);
  assert.equal(normalized.yawDeg, -35);
  assert.equal(normalized.lengthMetres, 0.5);
});

test('the reviewed DiagView2 contract contains no remote or workstation-local asset path', async () => {
  for (const pathname of [
    '../app/components/device-viewer/ehl2DiagView2.ts',
    '../app/components/device-viewer/Ehl2DiagnosticThreeOverlay.ts',
    '../app/digital-prototype/Ehl2DiagnosticExperience.tsx',
  ]) {
    const source = await readFile(new URL(pathname, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /https?:\/\//i, pathname);
    assert.doesNotMatch(source, /\bfile:/i, pathname);
    assert.doesNotMatch(source, /(?:^|["'`\s])[A-Z]:[\\/]/m, pathname);
    assert.doesNotMatch(source, /\\\\[^\\\s]+\\/, pathname);
    assert.doesNotMatch(source, /\/(?:Users|home|tmp)\//, pathname);
  }
});

test('the flange absolute-centre editor preserves source provenance while solving world offsets', async () => {
  const placement = {
    mode: 'flange',
    flange: {
      kind: 'side_flange', section: 'S2', angleDeg: 90,
      radiusMm: 2_000, zMm: 500, thetaDeg: 180,
    },
  } as const;
  const design = {
    ...createDefaultDiagView2Design('CAMERA', 'absolute-centre-source-parity'),
    placement,
    localOffsetMm: [-500, 100, 200],
    worldOffsetMm: [10, 20, 30],
  } satisfies DiagView2DiagnosticDesign;
  const targetMm = [-80, 1_510, 330] as const;
  const baseWithLocal = resolveDiagView2Pose({ ...design, worldOffsetMm: [0, 0, 0] });
  const edited = {
    ...design,
    worldOffsetMm: [
      targetMm[0] - baseWithLocal.positionM[0] * 1_000,
      targetMm[1] - baseWithLocal.positionM[1] * 1_000,
      targetMm[2] - baseWithLocal.positionM[2] * 1_000,
    ],
  } satisfies DiagView2DiagnosticDesign;

  assert.equal(edited.placement, placement,
    'editing an absolute optical centre must retain the selected flange object and its provenance');
  approximateVector(resolveDiagView2Pose(edited).positionM, [targetMm[0] / 1_000, targetMm[1] / 1_000, targetMm[2] / 1_000]);

  const component = await readFile(
    new URL('../app/digital-prototype/Ehl2DiagnosticExperience.tsx', import.meta.url),
    'utf8',
  );
  const helperStart = component.indexOf('function applyFlangeAbsoluteOpticalCentreMm(');
  const helperEnd = component.indexOf('\n}\n\nfunction downloadBlob', helperStart) + 2;
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'unable to locate the flange absolute-centre solver');
  const helper = component.slice(helperStart, helperEnd);
  assert.match(helper, /if \(design\.placement\.mode !== 'flange'\) return design;/,
    'explicit placements must keep their existing direct-position editor semantics');
  assert.match(helper, /resolveDiagView2Pose\(\{ \.\.\.design, worldOffsetMm: \[0, 0, 0\] \}\)/,
    'the solver must use the same flange plus local-offset frame as ray generation');
  assert.match(helper, /targetMm\[0\] - baseWithLocal\.positionM\[0\] \* 1_000/,
    'world offsets must be target minus the source-compatible flange/local position');
  assert.match(helper, /return \{ \.\.\.design, worldOffsetMm \};/);
  assert.doesNotMatch(helper, /placement\s*:/,
    'absolute-centre editing must not silently convert the design to an explicit placement');

  const controlStart = component.indexOf("<Details title={ui('世界微调与绝对位姿', 'World offsets and explicit pose')}");
  const controlEnd = component.indexOf("<Details title={ui('局部姿态', 'Local orientation')}", controlStart);
  assert.ok(controlStart >= 0 && controlEnd > controlStart, 'unable to locate the placement editor');
  const control = component.slice(controlStart, controlEnd);
  assert.match(control, /open=\{design\.placement\.mode === 'flange'\}/,
    'the absolute-centre editor must remain exposed while a flange is selected');
  assert.match(control, /flangeAbsoluteCentreMm[\s\S]*?<Vector labels=\{\['X', 'Y', 'Z'\]\} unit="mm"[\s\S]*?applyFlangeAbsoluteOpticalCentreMm/);
  assert.match(control, /法兰编号与角度来源保持不变/);
  assert.match(control, /flange identity and angular provenance remain unchanged/);
  assert.match(control, /design\.placement\.mode === 'explicit'[\s\S]*?<Vector labels=\{\['X', 'Y', 'Z'\]\} unit="m"/,
    'explicit mode must retain its existing direct metre-position editor');
});

test('the Three overlay localizes canvas labels without changing reviewed geometry', () => {
  const drawnText: string[] = [];
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvasContext = {
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText(value: string) { drawnText.push(value); },
    measureText(value: string) { return { width: value.length * 12 }; },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tagName: string) {
        assert.equal(tagName, 'canvas');
        return { width: 0, height: 0, getContext: () => canvasContext };
      },
    },
  });

  try {
    const root = new Group();
    const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot: root }, {
      ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
      labelLocale: 'en',
      mode: 'inspect',
      activeScenarioId: 'vs3-270',
      showBlindZones: true,
    });
    const englishText = drawnText.join(' ');
    assert.match(englishText, /VS3 · TOROIDAL 270°/);
    assert.match(englishText, /PLANAR HALF-FOV ±50°/);
    assert.match(englishText, /PPT PLANAR REFERENCE/);
    assert.match(englishText, /ASSESSMENT WINDOW · TOROIDAL 202\.5°/);
    assert.match(englishText, /UPPER DIVERTOR LOCAL BLIND ZONE/);
    assert.doesNotMatch(englishText, /\p{Script=Han}/u);

    drawnText.length = 0;
    overlay.setOptions({
      ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
      labelLocale: 'zh-CN',
      mode: 'inspect',
      activeScenarioId: 'vs3-270',
      showBlindZones: true,
    });
    const chineseText = drawnText.join(' ');
    assert.match(chineseText, /VS3 · 环向角 270°/);
    assert.match(chineseText, /平面半视场 ±50°/);
    assert.match(chineseText, /PPT平面参考/);
    assert.match(chineseText, /评估窗口 · 环向角 292\.5°/);
    assert.match(chineseText, /上偏滤器局部盲区/);
    overlay.dispose();
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete (globalThis as { document?: unknown }).document;
  }
});

test('the EHL-2 workbench exposes the complete bilingual DiagView2 workflow with accessible fallbacks', async () => {
  const component = await readFile(
    new URL('../app/digital-prototype/Ehl2DiagnosticExperience.tsx', import.meta.url),
    'utf8',
  );
  const forwardWorker = await readFile(
    new URL('../app/components/device-viewer/ehl2DiagView2Forward.worker.ts', import.meta.url),
    'utf8',
  );
  const viewer = await readFile(
    new URL('../app/components/TokamakCadViewer.tsx', import.meta.url),
    'utf8',
  );
  const styles = await readFile(
    new URL('../app/digital-prototype/Ehl2DiagnosticExperience.module.css', import.meta.url),
    'utf8',
  );
  const workspace = await readFile(
    new URL('../app/digital-prototype/MultiDeviceWorkspace.tsx', import.meta.url),
    'utf8',
  );

  for (const [chinese, english] of [
    ['完整诊断视角分析', 'Full diagnostic-view analysis'],
    ['端口与光心位姿', 'Port and optical-centre pose'],
    ['诊断几何与显示', 'Diagnostic geometry and display'],
    ['CAD 首交与显示剖切', 'CAD first-hit and render slicing'],
    ['几何项目、快照与报告', 'Geometry project, snapshot and report'],
    ['虚拟正向模型', 'Virtual forward model'],
    ['来源、PPT 预设与能力边界', 'Source, PPT presets and capability boundary'],
    ['计算射线最近交点', 'Calculate nearest ray hits'],
    ['下载 v3 JSON', 'Download v3 JSON'],
    ['复位诊断工作区', 'Reset diagnostic workspace'],
    ['载入 GEQDSK', 'Load GEQDSK'],
    ['全部 41 个设计法兰', 'All 41 design flanges'],
    ['源前端显示与场景光照', 'Source display and scene lighting'],
    ['三维诊断信息面板', '3D diagnostic information panel'],
    ['环境光强度', 'Environment intensity'],
    ['环境映射', 'Environment map'],
    ['启用实时阴影', 'Cast real-time shadows'],
    ['下载工作区 v4', 'Download workspace v4'],
    ['公开 CAD 部件显隐与透明度', 'Published CAD part visibility and opacity'],
    ['三维 CAD 运行时已卸载', 'The 3D CAD runtime was unloaded'],
    ['软件模型 · 非实验测量', 'SOFTWARE MODEL · NOT AN EXPERIMENTAL MEASUREMENT'],
  ] as const) {
    assert.ok(component.includes(chinese), `missing Chinese workbench copy: ${chinese}`);
    assert.ok(component.includes(english), `missing English workbench copy: ${english}`);
  }

  assert.match(component, /<aside className=\{styles\.workbench\} aria-labelledby="ehl2-diagview-title">/);
  assert.match(component, /className=\{styles\.boundaryBanner\} role="note"/);
  assert.match(component, /className=\{styles\.contractError\} role="alert"/);
  assert.match(component, /className=\{styles\.levelTabs\} role="tablist" aria-label=/);
  assert.match(component, /role="tab" aria-selected=\{tab === id\} aria-controls=\{`ehl2-diagview-panel-\$\{id\}`\} tabIndex=\{tab === id \? 0 : -1\}/);
  assert.match(component, /onKeyDown=\{\(event\) => moveTabFocus\(event, index\)\}/);
  assert.match(component, /role="tabpanel" id=\{`ehl2-diagview-panel-\$\{tab\}`\} aria-labelledby=\{`ehl2-diagview-tab-\$\{tab\}`\} tabIndex=\{0\}/);
  assert.match(component, /className=\{styles\.statusLine\} data-state=\{geometry\.error \? 'error' : analysisState\} role=\{geometry\.error \|\| analysisState === 'error' \? 'alert' : 'status'\} aria-live="polite"/);
  assert.match(component, /className=\{styles\.tableWrap\} tabIndex=\{0\}/);
  assert.match(component, /export function Ehl2DiagnosticNoScriptSummary\(\)/);
  assert.match(component, /className=\{styles\.noScriptSummary\}/);
  assert.match(component, /JavaScript is unavailable\. Interactive geometry, CAD BVH and the virtual forward model remain off/);
  assert.match(component, /当前未启用 JavaScript，交互几何、CAD BVH 与虚拟正向模型保持关闭/);

  for (const contractToken of [
    'parseEhl2DiagView2PortDataset',
    'buildDiagView2PreviewRays',
    'buildDiagView2TraceRays',
    'serializeDiagView2DesignFile',
    'reportToCsv',
    'reportToHtml',
    'onDiagnosticRuntimeReady={handleDiagnosticRuntimeReady}',
    'runtime.traceRays',
    "kind: 'camera-six-plane'",
    'runtime.capturePng()',
    'runtime.captureDiagnosticViewPng',
    'localStorage.setItem',
    "new Worker(new URL('../components/device-viewer/ehl2DiagView2Forward.worker.ts'",
    'updateDisplay',
    'setShowPptComposite',
    'loadPptScenario',
    'startNewDiagnostic',
    'backgroundLayers',
    'analysisBundle',
    "respectClipping: requestTraceMode === 'render-state'",
    "respectVisibility: requestTraceMode === 'render-state'",
    "if (traced.status === 'failed')",
    'disabled={!reportExportReady}',
    'forwardResultToCsv',
    'forwardResultToJson',
    'buildDiagView2ForwardFigureData',
    'diagView2ForwardFigureToMatlab',
    'diagView2ForwardFigureToSvg',
    'projectReportsToHtml',
    'createDefaultDiagView2PhysicsSettings',
    'resolveDiagView2PhysicsExecutionPlan',
    'buildDiagView2SpectralRelativeWeights',
    'serializeDiagView2PhysicsSettings',
    'diagnosticViewerSettings={{ ...viewerAppearance, partOpacities: viewerState.partOpacities }}',
    'diagnosticViewerState={viewerState}',
    'onDiagnosticViewerStateChange={acceptViewerState}',
    'viewportOverlay={portDisplay.showInfoPanel && pose ?',
    'plasmaContexts, portMarkers',
  ]) assert.ok(component.includes(contractToken), `missing complete-workflow token: ${contractToken}`);
  assert.match(component, /const englishRef = useRef\(english\);\s*useEffect\(\(\) => \{ englishRef\.current = english; \}, \[english\]\);\s*const runtimeUi = useCallback\(\(zh: string, en: string\) => englishRef\.current \? en : zh, \[\]\)/,
    'runtime lifecycle messages must read the current locale without changing the runtime callback identity');
  assert.match(component, /\}, \[commitAppliedSlice, runtimeUi\]\);/,
    'a locale change must not tear down and recreate the diagnostic runtime');
  assert.doesNotMatch(component, /buildDiagView2Report\(design, results\.length \? results : undefined/,
    'not-run CAD analysis must not be serialized as a completed all-miss report');
  assert.match(component, /const reportReady = analysisAvailable && completedTraceMode === 'source-cad'/);
  assert.match(component, /if \(!reportReady\) throw new Error\('A source-CAD analysis has not completed for the current diagnostic\.'\)/);
  assert.match(component, /const invalid = traced\.results\.find\(\(item\) => item\.state === 'invalid' \|\| item\.state === 'error'\)/);
  assert.match(component, /item\.state !== 'hit' && item\.state !== 'miss'/);
  assert.match(component, /const analysisStatus: DiagView2ProjectReportEntry\['analysisStatus'\] = item\.diagnosticType === 'LASER'[\s\S]{0,180}\? \(sourceCad \? 'completed' : 'exploratory-completed'\)[\s\S]{0,60}: 'not-run'/);
  assert.match(component, /const laserGeometryReport = item\.diagnosticType === 'LASER'[\s\S]{0,40}\? buildDiagView2Report\(item, \[\]/);
  assert.match(component, /report: laserGeometryReport \?\? \(saved\?\.results\.length && sourceCad[\s\S]{0,80}\? buildDiagView2Report\(item, saved\.results,[\s\S]{0,260}intersectionMode: 'source-cad',[\s\S]{0,180}poloidalReferenceMajorRadiusM: forwardSnapshot\.plasma\.r0M[\s\S]{0,80}: null\)/);

  assert.match(component, /const \[projectResults, setProjectResults\] = useState<Record<string, StoredAnalysis>>\(\{\}\)/);
  assert.match(component, /const id = `EHL2-\$\{design\.diagnosticType\}-\$\{crypto\.randomUUID\(\)\.slice\(0, 8\)\}`/);
  assert.match(component, /setProject\(\(current\) => upsertDesign\(current, design\)\)/);
  assert.match(component, /const saved = storedAnalysisMatchesContext\(stored, next, runtime, viewerState, appliedSliceRef\.current\) \? stored : null/);
  assert.match(component, /setResults\(saved \? \[\.\.\.saved\.results\] : \[\]\); setCompletedTraceMode\(saved\?\.traceMode \?\? null\); setAnalysisState\(saved\?\.results\.length \? 'ready' : 'idle'\)/);
  assert.match(component, /project\.filter\(\(item\) => item\.id !== design\.id && item\.display\?\.visible !== false\)/);

  assert.match(component, /resolveDiagView2RotatedFrame\(activeDesign\)\.u/);
  assert.match(component, /\[-Math\.sin\(angle\), Math\.cos\(angle\), 0\]/);
  assert.match(component, /sliceKind === 'rotated-xz' && <NumberField label=\{ui\('XZ 旋转角', 'XZ rotation'\)\}/);
  assert.match(component, /const planes = cameraPlanes\(boundCamera\)[\s\S]{0,220}spec: \{ kind: 'camera-six-plane', planes \}/);
  assert.match(component, /function cameraCaptureFrame\(design: DiagView2DiagnosticDesign\)[\s\S]{0,260}designId: design\.id/,
    'an optical-centre capture must bind its temporary overlay suppression to the active CAMERA identity');

  assert.match(component, /const runInput = \{[\s\S]{0,220}caseName: gfile\.caseName,[\s\S]{0,220}physicsSettings: checkedSettings,[\s\S]{0,120}executionKernel: executionPlan\.kernel/);
  assert.match(component, /setOutput\(\{ \.\.\.message\.result, runInput, figureData \}\)/);
  assert.match(component, /const \[plasmaContexts, setPlasmaContexts\] = useState<readonly Ehl2DiagnosticPlasmaContext\[\]>\(\[\]\)/);
  assert.match(component, /backgroundLayers, plasmaContexts, plasmaClippingPlanesWebMetres, portMarkers \}/,
    'both clipped plasma layers and reviewed ports must reach the Three overlay');
  assert.match(component, /const fluxSurfacesRZMetres = buildEhl2GeqdskFluxSurfaceContours\(gfile\)/,
    'the GEQDSK front-end must recreate the source multi-surface context rather than showing LCFS alone');
  assert.match(component, /这些仅为虚拟显示上下文/,
    'plasma layers must be disclosed as virtual display context, not physical or calibrated output');
  assert.match(component, /const markerPorts = portDisplay\.scope === 'all' \? dataset\.records : port \? \[port\] : \[\]/);
  assert.match(component, /pointsWebMetres: markerPorts\.map\(\(item\) => \(\{[\s\S]{0,180}positionWebMetres: item\.webMetres,[\s\S]{0,100}normalWeb: item\.webNormal/,
    'the source front-end port display must expose all 41 reviewed records, not only the selected flange');
  assert.match(component, /selectedId: port\?\.id/,
    'the selected flange must remain distinguishable within the complete marker set');
  assert.match(component, /const \[plasmaSettings, setPlasmaSettings\] = useState<PlasmaPanelSettings>/);
  assert.match(component, /plasmaSettings\.r0M \+ plasmaSettings\.aM \* Math\.cos\(theta \+ plasmaSettings\.delta \* Math\.sin\(theta\)\)/,
    'the parametric plasma must retain the source-shaped R0/a/kappa/delta boundary rather than a generic circle');
  assert.match(component, /plasmaSettings\.kappa \* plasmaSettings\.aM \* Math\.sin\(theta\)/);
  assert.match(component, /Array\.from\(\{ length: 120 \}/,
    'the parametric plasma boundary must be deterministic and bounded for the Three overlay');
  assert.match(component, /contexts\.push\(\{ id: 'parametric-plasma',[\s\S]{0,180}sourceKind: 'parametric'/);
  assert.match(component, /contexts\.push\(\{ id: 'geqdsk-lcfs',[\s\S]{0,180}sourceKind: 'geqdsk'/);
  assert.match(component, /setGfile\(parseDiagView2Geqdsk\(await file\.text\(\)\)\);\s*setPlasmaSettings\(\(current\) => \(\{ \.\.\.current, geqdskVisible: true \}\)\);/,
    'loading an equilibrium must reveal its independent GEQDSK layer without hiding the parametric layer');
  assert.match(component, /onPlasmaContextsChange\(contexts\)/);
  assert.match(component, /viewportOverlay=\{portDisplay\.showInfoPanel && pose \? <section className=\{styles\.viewerInfoPanel\} aria-label=\{ui\('三维诊断信息面板', '3D diagnostic information panel'\)\}>/,
    'the diagnostic information panel must be passed into the real Three viewport for fullscreen parity');
  assert.match(viewer, /viewportOverlay\?: ReactNode/);
  const viewportShellStart = viewer.indexOf('<div className="tokamakCadViewportShell">');
  const viewportShellEnd = viewer.indexOf('<aside className="tokamakCadProperties"', viewportShellStart);
  const viewportOverlayIndex = viewer.indexOf('{viewportOverlay}', viewportShellStart);
  assert.ok(
    viewportShellStart >= 0 && viewportOverlayIndex > viewportShellStart && viewportOverlayIndex < viewportShellEnd,
    'viewportOverlay must render inside the fullscreen-capable viewport shell rather than beside the viewer',
  );
  assert.match(component, /<fieldset className=\{styles\.displayControls\}>\s*<legend>\{ui\('三维等离子体上下文', '3D plasma context'\)\}<\/legend>/);
  for (const label of ['参数化 R0 / a / κ / δ', '已载入 GEQDSK 的约 10 层磁通面与磁轴', '参数化 Plasma α', 'GEQDSK / EFIT α']) {
    assert.ok(component.includes(label), `missing 3D plasma control: ${label}`);
  }
  assert.match(component, /<figure className=\{styles\.forwardFigure\}><img src=\{figureDataUrl\}/,
    'full radial and R-Z forward figure must be presented as an accessible scientific graphic');
  for (const download of ['field-data.json', 'virtual-forward.m', 'virtual-forward.svg']) {
    assert.ok(component.includes(download), `missing forward scientific export: ${download}`);
  }
  assert.match(component, /下载多诊断 HTML/, 'project export must expose the combined multi-diagnostic report');
  assert.match(component, /key=\{`\$\{physicsResetRevision\}:\$\{design\.id\}`\}/,
    'workspace reset or switching an independent diagnostic must unmount the old forward worker');
  assert.match(component, /if \(previousGeometryKey\.current === geometryKey\) return;[\s\S]{0,300}workerRef\.current\?\.terminate\(\);[\s\S]{0,260}setOutput\(null\);/,
    'geometry edits must abort stale work and clear output without discarding the loaded equilibrium or physics settings');
  assert.match(component, /const neProfile = buildDiagView2MathProfile\(gfile, checkedSettings\.plasma\.ne\.model,[\s\S]{0,260}Float64Array\.from\(neProfile\.values, \(value\) => value \* 1e19\)/,
    'manual spectral weights must reuse the main-LCFS polygon mask before converting ne into SI density');
  assert.match(component, /output\.rays\.forEach\(\(ray, index\) => rows\.push/);
  assert.match(component, /channels: output\.rays\.map\(\(ray, index\) => \(\{/);
  assert.match(component, /\[\.\.\.output\.normalizedSignals\]\.map\(\(value, index\) => <i/);
  assert.match(forwardWorker, /runDiagView2VirtualForwardModel/);
  assert.match(forwardWorker, /type: 'progress'/);
  assert.match(forwardWorker, /type: 'result'/);
  assert.match(forwardWorker, /signals\.buffer, normalizedSignals\.buffer/);
  for (const diagnosticType of ['CAMERA', 'ARRAY', 'LASER']) {
    assert.ok(component.includes(`'${diagnosticType}'`), `missing ${diagnosticType} workflow`);
  }
  assert.doesNotMatch(component, /Technical annotation/i);

  assert.match(styles, /\.levelTabs button:hover,\.levelTabs button:focus-visible/);
  assert.match(styles, /\.resultTable,\.tableWrap\{overflow:auto/);
  assert.match(styles, /\.primaryButton,\.secondaryButton[^\n]*min-height:44px/);
  assert.match(styles, /\.viewerInfoPanel\{[^\n]*position:absolute[^\n]*pointer-events:none/,
    'the in-viewport information panel must remain readable without intercepting orbit controls');
  assert.match(styles, /@media\(max-width:1180px\)\{\.root\{display:block\}/);
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*?\.vectorEditor\{grid-template-columns:1fr\}/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);

  assert.match(workspace, /if \(device\.diagnosticWorkspace\?\.kind === 'ehl2-diagview2'\) \{\s*return <Ehl2DiagnosticExperience device=\{device\} \/>;\s*\}/);
  assert.match(workspace, /return <StandardDeviceExperience device=\{device\} \/>;/);
  assert.match(workspace, /<noscript><Ehl2DiagnosticNoScriptSummary \/><\/noscript>/,
    'the EHL-2 evidence table must remain reachable in homepage SSR without selecting a client-only tab');
});

test('analysis results stay bound to geometry and trace context while invalid geometry fails inside the workbench', async () => {
  const component = await readFile(
    new URL('../app/digital-prototype/Ehl2DiagnosticExperience.tsx', import.meta.url),
    'utf8',
  );

  const storedAnalysisType = component.slice(
    component.indexOf('type StoredAnalysis = {'),
    component.indexOf('type WorkspaceSettings = {'),
  );
  for (const field of [
    'designId: string',
    'geometryKey: string',
    'traceMode: TraceMode',
    "authority: 'render-cad-bvh-derived'",
    'cad: Ehl2DiagnosticRuntimeProvenance',
    'results: readonly DiagView2RayResult[]',
    'verifiedInSession: boolean',
    'renderContext?: {',
    'viewerState: Ehl2DiagnosticViewerState',
    "slice: WorkspaceSettings['slice']",
  ]) assert.ok(storedAnalysisType.includes(field), `stored analysis misses ${field}`);
  assert.match(component, /const diagnosticGeometryKey = \(design: DiagView2DiagnosticDesign\) => JSON\.stringify\(\{[\s\S]*?placement: design\.placement,[\s\S]*?rotationDeg: design\.rotationDeg,[\s\S]*?camera: design\.camera,[\s\S]*?array: design\.array,[\s\S]*?laser: design\.laser,[\s\S]*?\}\)/);
  assert.match(component, /const stored = current\[next\.id\]; if \(!stored \|\| stored\.geometryKey === diagnosticGeometryKey\(next\)\) return current;[\s\S]{0,120}delete copy\[next\.id\]/,
    'editing a saved id must evict results whose geometry fingerprint no longer matches');
  assert.match(component, /const saved = storedAnalysisMatchesContext\(stored, next, runtime, viewerState, appliedSliceRef\.current\) \? stored : null/,
    'selecting a snapshot must restore results only for exact geometry, CAD and render context');
  assert.match(component, /const stored = item\.id === design\.id \? currentAnalysis : projectResults\[item\.id\]/,
    'the active diagnostic must not fall back to a stale project result');
  assert.match(component, /const saved = storedAnalysisMatchesContext\(stored \?\? undefined, item, runtime, viewerState, appliedSliceRef\.current\) \? stored : null/);
  assert.match(component, /const reportReady = analysisAvailable && completedTraceMode === 'source-cad'/,
    'only a trace against all source CAD may become a formal report');
  assert.match(component, /report: laserGeometryReport \?\? \(saved\?\.results\.length && sourceCad[\s\S]{0,50}\? buildDiagView2Report/);
  assert.match(component, /exploratoryResults: saved\?\.results\.length && !sourceCad \? saved\.results : null/,
    'render-state results must remain explicitly exploratory and outside the formal report contract');
  assert.match(component, /if \(next !== traceMode\) \{ traceAbort\.current\?\.abort\(\); traceAbort\.current = null; inFlightTraceMode\.current = null; revision\.current \+= 1; setTraceMode\(next\); setResults\(\[\]\); setCompletedTraceMode\(null\); setAnalysisState\('idle'\);[\s\S]{0,180}delete copy\[design\.id\]/,
    'switching CAD target semantics must abort in-flight work and invalidate the completed result');
  assert.match(component, /const invalidateRenderTrace = useCallback\(\(statusMessage\?: string\) => \{[\s\S]{0,900}inFlightTraceMode\.current === 'render-state'[\s\S]{0,500}traceAbort\.current\?\.abort\(\);[\s\S]{0,500}revision\.current \+= 1;[\s\S]{0,500}delete copy\[design\.id\]/,
    'render-state invalidation must cover selected, completed and in-flight exploratory traces');
  assert.match(component, /function clearDiagnosticSlice\(\) \{\s*invalidateRenderTrace\(\);\s*runtime\?\.clearDiagnosticSlice\(\);[\s\S]{0,260}commitAppliedSlice\(DEFAULT_SLICE\)/,
    'clearing a render slice must invalidate exploratory results and commit the actually applied empty slice');
  assert.match(component, /onClick=\{clearDiagnosticSlice\}/);
  assert.match(component, /const \[appliedSlice, setAppliedSlice\] = useState<WorkspaceSettings\['slice'\]>/,
    'workspace state must distinguish applied slicing from uncommitted form controls');
  assert.match(component, /const appliedSliceRef = useRef<WorkspaceSettings\['slice'\]>/);
  assert.match(component, /const commitAppliedSlice = useCallback\(\(next: WorkspaceSettings\['slice'\]\) => \{\s*const canonical = \{ \.\.\.next \};\s*appliedSliceRef\.current = canonical;\s*setAppliedSlice\(canonical\)/);
  assert.match(component, /function applySlice\(\) \{[\s\S]{0,900}invalidateRenderTrace\(\); const resolvedSlice = applyStoredDiagnosticSlice\(runtime, design, nextSlice, allDesigns\); commitAppliedSlice\(resolvedSlice\)/,
    'a slice edit must invalidate exploratory work and become persistent only after runtime application succeeds');
  assert.match(component, /cameraDesignId: string \| null/,
    'a finite-frustum slice must persist the identity of its source CAMERA diagnostic');
  assert.match(component, /const boundCamera = slice\.cameraDesignId[\s\S]{0,420}activeDesign\.camera[\s\S]{0,220}\[\.\.\.designs\]\.reverse\(\)\.find\(\(candidate\) => candidate\.camera\)/,
    'source-compatible frustum slicing must prefer the explicit binding, then active CAMERA, then the most recent frozen CAMERA');
  assert.match(component, /slice: \{ \.\.\.slice, cameraDesignId: boundCamera\.id \}/,
    'camera identity must be canonicalized before the slice is saved');
  assert.match(component, /restoredSettings = \{ \.\.\.restoredSettings, slice: resolveDiagnosticSlice\(first, restoredSettings\.slice, store\.diagnostics\)\.slice \}/,
    'workspace restore must resolve legacy camera slices before committing any render state');
  assert.match(component, /restoredSettings = \{ \.\.\.restoredSettings, traceMode: 'source-cad', slice: \{ \.\.\.DEFAULT_SLICE \} \}/,
    'a missing or non-CAMERA explicit binding must fail safe to a clear source-CAD slice');
  assert.match(component, /const requestTraceMode = traceMode; inFlightTraceMode\.current = requestTraceMode/);
  assert.match(component, /setProjectResults\(\(current\) => \{ const copy = \{ \.\.\.current \}; delete copy\[design\.id\]; return copy; \}\);\s*try \{ setResults\(\[\]\)/,
    'starting a new trace must evict the previous active snapshot before the restore effect can resurrect it');
  assert.match(component, /respectClipping: requestTraceMode === 'render-state', respectVisibility: requestTraceMode === 'render-state'/);
  assert.match(component, /controller\.signal\.aborted \|\| traced\.status === 'aborted' \|\| requestRevision !== revision\.current/,
    'an invalidated asynchronous trace must never commit stale results');
  assert.match(component, /createStoredAnalysis\(design, requestTraceMode, converted, runtime, viewerState, appliedSliceRef\.current\)/,
    'completed exploratory results must capture the exact viewer and applied-slice context used by the trace');
  assert.match(component, /if \(hadState\) invalidateRenderTrace\(/,
    'free-camera, visibility, clipping and opacity changes must invalidate render-state results');
  assert.match(component, /function cancelTrace\(\) \{[\s\S]{0,700}traceAbort\.current\?\.abort\(\);[\s\S]{0,400}delete copy\[design\.id\][\s\S]{0,300}setResults\(\[\]\)/,
    'cancel must evict the active stored snapshot rather than letting the restore effect revive it');
  assert.match(component, /onClick=\{cancelTrace\}/);
  assert.match(component, /if \(!nextRuntime\) \{[\s\S]{0,700}traceAbort\.current\?\.abort\(\);[\s\S]{0,400}revision\.current \+= 1;[\s\S]{0,400}setResults\(\[\]\);[\s\S]{0,300}setCompletedTraceMode\(null\)/,
    'runtime teardown must make prior results inert while retaining only the stored snapshot');
  assert.match(component, /const activeAnalysisContextValid = Boolean\(runtime[\s\S]{0,320}storedAnalysisMatchesContext\(activeStoredAnalysis, design, runtime, viewerState, appliedSlice\)\)/,
    'display and report readiness must require a live runtime and matching CAD provenance');

  assert.match(component, /const resolveSafeGeometry = \(design: DiagView2DiagnosticDesign\) => \{\s*try \{[\s\S]*?buildDiagView2PreviewRays\(design\)[\s\S]*?buildDiagView2TraceRays\(design\)[\s\S]*?\} catch \(error\) \{[\s\S]*?pose: null,[\s\S]*?preview: \[\]/);
  assert.match(component, /showRays: display\.visible && !geometry\.error/);
  assert.match(component, /disabled=\{!runtime \|\| Boolean\(geometry\.error\) \|\| design\.diagnosticType === 'LASER'/);
  assert.match(component, /\{pose \? <Pose pose=\{pose\}[\s\S]{0,100}: <p className=\{styles\.errorText\} role="alert">\{geometry\.error\}<\/p>\}/);

  const navIndex = component.indexOf('<div className={styles.levelTabs} role="tablist"');
  const globalStatusIndex = component.indexOf('className={styles.statusLine}');
  const firstTabIndex = component.indexOf('<section className={styles.panel} role="tabpanel"');
  assert.ok(navIndex >= 0 && globalStatusIndex > navIndex && firstTabIndex > globalStatusIndex,
    'geometry and runtime messages must remain visible above every tab panel');

  const portSelect = component.match(/<Select label=\{ui\('法兰 \/ 方位', 'Flange \/ azimuth'\)\}[\s\S]*?onChange=\{\(value\) => \{ const next = dataset\?\.records\.find/)?.[0] ?? '';
  assert.ok(portSelect, 'the flange selector must remain present');
  assert.doesNotMatch(portSelect, /disabled=\{[^}]*portId === 'explicit'/,
    'an explicit pose must not disable the flange selector and trap the user outside the 41-port dataset');
  assert.match(portSelect, /disabled=\{!dataset\}/);
  assert.match(portSelect, /portId === 'explicit' \? \[\{ value: 'explicit'/,
    'the controlled select must retain a labelled explicit-pose option until a flange is chosen');

  assert.match(component, /function resetDiagnosticWorkspace\(\) \{[\s\S]*?traceAbort\.current\?\.abort\(\);[\s\S]*?revision\.current \+= 1;[\s\S]*?runtime\?\.clearDiagnosticSlice\(\);/,
    'reset must abort in-flight CAD work, invalidate its revision and clear the render slice');
  assert.match(component, /const defaultPort = dataset\?\.records\.find\(\(item\) => item\.id === 'S2@270'\) \?\? dataset\?\.records\[0\];[\s\S]*?createDefaultDiagView2Design\('CAMERA', 'EHL2-CAMERA-01'\)/,
    'reset must restore the source-compatible Camera at S2@270 whenever the reviewed dataset is available');
  assert.match(component, /setProject\(\[\]\);\s*setProjectResults\(\{\}\);\s*setResults\(\[\]\);\s*setCompletedTraceMode\(null\);\s*setAnalysisState\('idle'\);\s*setMessage\(''\);/,
    'reset must remove every snapshot and completed/stale analysis without retaining a status message');
  const resetBlock = component.slice(
    component.indexOf('function resetDiagnosticWorkspace()'),
    component.indexOf('function loadPptScenario'),
  );
  for (const resetToken of [
    "setDepthMode('physical')",
    'setShowLabels(true)',
    'setShowHits(true)',
    'setShowPptComposite(false)',
    'setPlasmaContexts([])',
    'setForwardSnapshot(defaultForwardPanelSnapshot())',
    'setPortDisplay({ ...DEFAULT_PORT_DISPLAY })',
    'setViewerAppearance({ ...DEFAULT_VIEWER_APPEARANCE })',
    'setViewerState(nextViewerState)',
    'commitAppliedSlice(DEFAULT_SLICE)',
    "setTraceMode('source-cad')",
    "setSliceKind('none')",
    'setSliceOffset(0)',
    'setSliceRotationDeg(0)',
    "setSliceSide('positive')",
    "setTab('placement')",
  ]) assert.ok(resetBlock.includes(resetToken), `reset misses ${resetToken}`);
  assert.match(component, /不会改动设备级安全、授权配置或已显式保存的浏览器副本/);
  assert.match(component, /Device-level safety, authorization settings and explicitly saved browser copies are unchanged/);
  assert.doesNotMatch(component, /window\.confirm|\bconfirm\(/,
    'reset confirmation must remain an explicit inline control rather than a blocking browser dialog');
  assert.match(component, /function startNewDiagnostic\(\) \{ snapshotCurrent\(\); runtime\?\.clearDiagnosticSlice\(\); commitAppliedSlice\(DEFAULT_SLICE\); setTraceMode\('source-cad'\); setSliceKind\('none'\); setSliceOffset\(0\); setSliceRotationDeg\(0\); setSliceSide\('positive'\);/,
    'a new independent diagnostic must not inherit the previous diagnostic\'s render slice or exploratory trace semantics');

  assert.match(component, /function workspaceSettings\(\): WorkspaceSettings \{[\s\S]{0,500}traceMode,[\s\S]{0,120}slice: appliedSlice,[\s\S]{0,300}forward: forwardSnapshot,[\s\S]{0,120}portDisplay,[\s\S]{0,120}viewerAppearance,[\s\S]{0,120}viewerState/,
    'workspace save must serialize the slice applied to Three, not uncommitted form inputs');
  assert.match(component, /version: 4, activeDesignId: design\.id[\s\S]{0,260}settings: workspaceSettings\(\), analyses: workspaceAnalyses\(\)/);
  assert.match(component, /const v3Keys = \['depthMode', 'forward', 'portDisplay', 'showHits', 'showLabels', 'slice', 'tab', 'traceMode', 'viewerAppearance', 'viewerState'\]/,
    'workspace settings must reject unknown/missing top-level fields');
  assert.match(component, /const currentKeys = \['opacity', 'scope', 'showInfoPanel', 'visible'\]/);
  assert.match(component, /item\.scope !== undefined && !isOneOf\(item\.scope, \['selected', 'all'\] as const\)/);
  assert.match(component, /const currentKeys = \['backgroundBlurriness', 'backgroundEnabled', 'backgroundIntensity', 'castShadow', 'defaultLightsEnabled', 'environmentIntensity', 'environmentPreset'\]/);
  assert.match(component, /item\.environmentPreset !== undefined && item\.environmentPreset !== 'room-platform-substitute' && item\.environmentPreset !== 'none'/);
  assert.match(component, /const viewerState = parseEhl2DiagnosticViewerState\(item\.viewerState\)/);
  assert.match(component, /some\(\(id\) => !allowedPartIds\.has\(id as/,
    'workspace restore must reject unknown CAD part ids');

  const resultParserStart = component.indexOf('function parseStoredRayResults(');
  const provenanceParserStart = component.indexOf('function parseRuntimeProvenance(');
  const storedAnalysesParserStart = component.indexOf('function parseStoredAnalyses(');
  const storedAnalysesParserEnd = component.indexOf('function sameRuntimeProvenance(', storedAnalysesParserStart);
  assert.ok(resultParserStart >= 0 && provenanceParserStart > resultParserStart,
    'unable to locate the strict v4 ray-result parser');
  assert.ok(storedAnalysesParserStart >= 0 && storedAnalysesParserEnd > storedAnalysesParserStart,
    'unable to locate the strict v4 analysis parser');
  const resultParser = component.slice(resultParserStart, provenanceParserStart);
  for (const contract of [
    'if (design.diagnosticType === \'LASER\')',
    'const expected = buildDiagView2TraceRays(design)',
    'value.length !== expected.length',
    'Object.keys(item).sort().join(\'|\') !== RESULT_KEYS',
    'item.rayId !== ray.rayId',
    '!EHL2_PUBLIC_PART_IDS.has(item.hitModel)',
    '!vectorClose(hitPoint, projected, 1e-5)',
    'Math.abs(normalMagnitude - 1) > 1e-4',
    'Math.abs(item.incidenceAngleDeg - expectedIncidence) > 1e-4',
  ]) assert.ok(resultParser.includes(contract), `strict stored-ray parser misses ${contract}`);

  const provenanceParser = component.slice(provenanceParserStart, component.indexOf('function parseStoredSlice(', provenanceParserStart));
  for (const contract of [
    "['assetId', 'coordinateFrame', 'deviceId', 'engine', 'modelPath', 'modelSha256', 'schema']",
    "item.schema !== 'fusiondigital.ehl2-public-cad-v1'",
    "item.coordinateFrame !== 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1'",
    "item.engine !== 'three-mesh-bvh-v1'",
    '!/^[A-Fa-f0-9]{64}$/.test(item.modelSha256)',
    'modelSha256: item.modelSha256.toUpperCase()',
  ]) assert.ok(provenanceParser.includes(contract), `CAD provenance parser misses ${contract}`);

  const storedAnalysesParser = component.slice(storedAnalysesParserStart, storedAnalysesParserEnd);
  for (const contract of [
    'value.length > 64',
    "item.authority !== 'render-cad-bvh-derived'",
    'item.geometryKey !== diagnosticGeometryKey(design)',
    'const cad = parseRuntimeProvenance(item.cad)',
    "if (item.traceMode === 'render-state')",
    "['slice', 'viewerState']",
    'parseEhl2DiagnosticViewerState(context.viewerState)',
    'const slice = parseStoredSlice(context.slice)',
    "else if (keys !== sourceKeys)",
    'results: parseStoredRayResults(item.results, design)',
    'verifiedInSession: false',
  ]) assert.ok(storedAnalysesParser.includes(contract), `strict stored-analysis parser misses ${contract}`);
  assert.match(component, /cad: \{ \.\.\.diagnosticRuntime\.provenance \}/,
    'new snapshots must pin the exact public runtime asset provenance');
  assert.match(component, /results: \[\.\.\.rayResults\],[\s\S]{0,80}verifiedInSession: true/,
    'only a trace completed in the current browser session may become trusted');
  assert.match(component, /mode === 'render-state' \? \{ renderContext: \{ viewerState: currentViewerState, slice: \{ \.\.\.currentSlice \} \} \} : \{\}/,
    'only render-state snapshots may carry a frozen viewer/slice context');
  assert.match(component, /!stored\.verifiedInSession[\s\S]{0,220}!sameRuntimeProvenance\(stored\.cad, diagnosticRuntime\.provenance\)\) return false;[\s\S]{0,220}stored\.traceMode === 'source-cad'[\s\S]{0,300}JSON\.stringify\(stored\.renderContext\.viewerState\) === JSON\.stringify\(currentViewerState\)[\s\S]{0,180}JSON\.stringify\(stored\.renderContext\.slice\) === JSON\.stringify\(currentSlice\)/,
    'source-CAD snapshots require the same asset while render-state snapshots additionally require exact viewer and slice state');
  assert.match(component, /const expectedKeys = workspaceVersion === 4\s*\? \['activeDesignId', 'analyses', 'geometry', 'schema', 'settings', 'version'\]/,
    'workspace v4 must reject missing or unknown envelope fields including analyses');
  assert.match(component, /rawAnalyses = workspaceVersion === 4 \? envelope\.analyses : \[\]/,
    'legacy workspaces must not acquire untrusted analysis results');
  assert.match(component, /if \(typeof envelope\.activeDesignId !== 'string' \|\| envelope\.activeDesignId\.length === 0\) throw new Error\('DiagView2 workspace activeDesignId is invalid\.'\)/);
  assert.match(component, /const first = workspaceVersion > 0[\s\S]{0,180}store\.diagnostics\.find\(\(item\) => item\.id === activeDesignId\)[\s\S]{0,120}if \(!first\) throw new Error\('DiagView2 workspace activeDesignId does not match a unique diagnostic\.'\)/,
    'workspace envelopes must never silently substitute diagnostics[0] for a corrupt active id');
  assert.match(component, /const restoredAnalyses = workspaceVersion === 4 \? parseStoredAnalyses\(rawAnalyses, store\.diagnostics\) : \{\}/);
  assert.match(component, /setProjectResults\(restoredAnalyses\)/);
  assert.match(component, /const restoredActiveAnalysis = storedAnalysisMatchesContext\(storedActiveAnalysis, first, runtime, restoredViewerContext, restoredSliceContext\) \? storedActiveAnalysis : null/,
    'an imported snapshot must remain inert until it is re-traced in the current session');
  const workspaceAnalysesStart = component.indexOf('function workspaceAnalyses()');
  const workspaceAnalysesEnd = component.indexOf('function serializeWorkspace()', workspaceAnalysesStart);
  const workspaceAnalysesSource = component.slice(workspaceAnalysesStart, workspaceAnalysesEnd);
  assert.doesNotMatch(workspaceAnalysesSource, /verifiedInSession:/,
    'runtime trust must never be serialized into an importable workspace assertion');
  assert.match(component, /const pending = pendingRestoredSlice\.current;\s*pendingRestoredSlice\.current = null;[\s\S]{0,220}const targetSlice = pending\?\.slice \?\? appliedSliceRef\.current;[\s\S]{0,260}const resolvedSlice = applyStoredDiagnosticSlice\(nextRuntime, targetDesign, targetSlice, allDesignsRef\.current\);\s*commitAppliedSlice\(resolvedSlice\)/,
    'render slicing must be deterministically re-applied after a late Three runtime becomes ready');
  assert.match(component, /catch \(error\) \{\s*nextRuntime\.clearDiagnosticSlice\(\);\s*commitAppliedSlice\(DEFAULT_SLICE\);\s*setTraceMode\('source-cad'\)/,
    'an unrestorable render slice must fail safe to source-CAD semantics');
  assert.match(component, /pendingRestoredSlice\.current = \{ design: first, slice: restoredSettings\.slice \}/);
  assert.match(component, /setPortDisplay\(restoredSettings\.portDisplay\)/);
  assert.match(component, /setViewerAppearance\(restoredSettings\.viewerAppearance\)/);
  assert.match(component, /setViewerState\(restoredSettings\.viewerState\)/);
  assert.match(component, /applyStoredDiagnosticSlice\(runtime, first, restoredSettings\.slice, store\.diagnostics\)/);
  assert.match(component, /Browser security cannot restore the GEQDSK file handle; reselect it\./);
  assert.match(component, /<div hidden=\{tab !== 'forward'\}><ForwardPanel key=\{`\$\{physicsResetRevision\}:\$\{design\.id\}`\}/,
    'switching tabs must not destroy the loaded GEQDSK file or physics settings');
  assert.match(component, /const laserReportReady = design\.diagnosticType === 'LASER' && !geometry\.error/);
  assert.match(component, /buildDiagView2Report\(design, \[\], \{ deviceName: 'EHL-2', poloidalReferenceMajorRadiusM: forwardSnapshot\.plasma\.r0M \}\)/,
    'LASER must export geometry without fabricated intersections and disclose the active R0 hit-angle reference');
  assert.match(component, /buildDiagView2Report\(design, results, \{ deviceName: 'EHL-2', intersectionMode: 'source-cad', poloidalReferenceMajorRadiusM: forwardSnapshot\.plasma\.r0M \}\)/,
    'single source-CAD reports must use the active front-end plasma R0 for source-compatible hit angles');
  assert.match(component, /buildDiagView2Report\(item, saved\.results, \{ deviceName: 'EHL-2', createdAt: now, intersectionMode: 'source-cad', poloidalReferenceMajorRadiusM: forwardSnapshot\.plasma\.r0M \}\)/,
    'multi-diagnostic reports must use the same active R0 as single-report JSON, CSV and HTML');

  assert.match(component, /role="region" aria-label=\{ui\('虚拟正向全通道结果', 'All-channel virtual-forward results'\)\}/);
  assert.match(component, /output\.rays\.map\(\(ray, index\) => <tr key=\{ray\.rayId\}>/,
    'the visual channel bars need a complete semantic value table, not title attributes alone');
  assert.match(component, /\{error && <p className=\{styles\.errorText\} role="alert">\{error\}<\/p>\}/);
});

test('a hidden active diagnostic does not suppress visible frozen background diagnostics', () => {
  const physicalWebMetresRoot = new Group();
  const frozen = createDefaultDiagView2Design('ARRAY', 'visible-frozen-array');
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, {
    kind: 'diagview2-workbench',
    labelLocale: 'en',
    designId: 'hidden-active-camera',
    designName: 'hidden-active-camera',
    diagnosticType: 'CAMERA',
    previewRays: [],
    rayResults: [],
    depthMode: 'physical',
    showRays: false,
    showLabels: false,
    showHitMarkers: false,
    laserDiameterMm: 0,
    opacity: 0.6,
    color: 0x61d6a7,
    colorCss: '#61d6a7',
    backgroundLayers: [{
      designId: frozen.id,
      designName: frozen.nameSuffix,
      diagnosticType: frozen.diagnosticType,
      previewRays: buildDiagView2PreviewRays(frozen),
      laserDiameterMm: 0,
      opacity: 0.9,
      color: 0xf2c45c,
      colorCss: '#f2c45c',
    }],
  });

  const root = physicalWebMetresRoot.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY');
  assert.equal(root?.visible, true);
  assert.ok(root?.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_VISIBLE-FROZEN-ARRAY'));
  overlay.dispose();
});

test('the Three overlay renders two independent plasma layers and all 41 reviewed port markers', () => {
  const physicalWebMetresRoot = new Group();
  const design = createDefaultDiagView2Design('CAMERA', 'multi-context-camera');
  const ports = Array.from({ length: 41 }, (_, index) => ({
    id: `PORT-${String(index + 1).padStart(2, '0')}`,
    label: `Reviewed port ${index + 1}`,
    positionWebMetres: [0.7 + index * 0.01, (index % 5) * 0.04, -0.4 + index * 0.02] as const,
    normalWeb: [1, 0, 0] as const,
  }));
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, {
    kind: 'diagview2-workbench',
    labelLocale: 'en',
    designId: design.id,
    designName: design.nameSuffix,
    diagnosticType: design.diagnosticType,
    previewRays: buildDiagView2PreviewRays(design),
    rayResults: [],
    depthMode: 'physical',
    showRays: true,
    showLabels: false,
    showHitMarkers: false,
    laserDiameterMm: 0,
    opacity: 0.6,
    color: 0x61d6a7,
    colorCss: '#61d6a7',
    plasmaContexts: [
      {
        id: 'parametric-plasma',
        label: 'Parametric R0/a/kappa/delta',
        sourceKind: 'parametric',
        color: 0xff50c8,
        opacity: 0.35,
        lcfsBoundaryRZMetres: [[0.55, -0.35], [1.35, 0], [0.55, 0.35]],
        magneticAxisRZMetres: [0.92, 0],
      },
      {
        id: 'geqdsk-lcfs',
        label: 'GEQDSK test equilibrium',
        sourceKind: 'geqdsk',
        color: 0x54d9ff,
        opacity: 0.2,
        lcfsBoundaryRZMetres: [[0.48, -0.42], [1.42, 0], [0.48, 0.42]],
        magneticAxisRZMetres: [0.95, 0.02],
      },
    ],
    portMarkers: {
      pointsWebMetres: ports,
      visible: true,
      opacity: 0.95,
      selectedId: 'PORT-17',
      showSelectedLabel: false,
    },
  });

  const root = physicalWebMetresRoot.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY');
  assert.ok(root);
  const parametric = root.getObjectByName(
    'EHL2_DIAGVIEW2_GEQDSK_PLASMA_CONTEXT_LAYER_1_PARAMETRIC-PLASMA',
  );
  const geqdsk = root.getObjectByName(
    'EHL2_DIAGVIEW2_GEQDSK_PLASMA_CONTEXT_LAYER_2_GEQDSK-LCFS',
  );
  assert.equal(parametric?.userData.sourceKind, 'parametric');
  assert.equal(geqdsk?.userData.sourceKind, 'geqdsk');
  assert.notEqual(parametric?.userData.color, geqdsk?.userData.color);

  const markerGroup = root.getObjectByName('EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS');
  assert.ok(markerGroup);
  assert.equal(markerGroup.userData.pointCount, 41);
  const markers = markerGroup.children.filter((child) => child.userData.kind === 'reviewed-port-centre-marker');
  const normals = markerGroup.children.filter((child) => child.userData.kind === 'reviewed-port-normal-indicator');
  assert.equal(markers.length, 41);
  assert.equal(normals.length, 41);
  assert.ok(normals.every((normal) => normal.userData.lengthMetres === 0.2));
  assert.equal(markers.filter((marker) => marker.userData.selected).length, 1);
  assert.equal(markers.find((marker) => marker.userData.selected)?.userData.portId, 'PORT-17');
  markerGroup.traverse((node) => assert.equal((node.raycast as unknown as () => unknown)(), undefined));
  overlay.dispose();
});

test('the DiagView2 workbench renders a finite four-sided camera frustum and subdued frozen diagnostics', () => {
  const physicalWebMetresRoot = new Group();
  const active = createDefaultDiagView2Design('CAMERA', 'active-camera');
  const frozen = createDefaultDiagView2Design('ARRAY', 'frozen-array');
  const previewRays = buildDiagView2PreviewRays(active);
  const rayResults = previewRays.filter((ray) => ray.role !== 'fill').map((ray, index) => {
    const hitDistanceM = ray.defaultLengthM / 4;
    return createDiagView2RayResult(ray, {
      hitModel: 'fixture-cad',
      hitPointM: [
        ray.originM[0] + ray.direction[0] * hitDistanceM,
        ray.originM[1] + ray.direction[1] * hitDistanceM,
        ray.originM[2] + ray.direction[2] * hitDistanceM,
      ],
      hitDistanceM,
      triangleIndex: index,
      hitFaceNormal: [-ray.direction[0], -ray.direction[1], -ray.direction[2]],
    });
  });
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, {
    kind: 'diagview2-workbench',
    labelLocale: 'en',
    designId: active.id,
    designName: active.nameSuffix,
    diagnosticType: active.diagnosticType,
    previewRays,
    rayResults,
    depthMode: 'physical',
    showRays: true,
    showLabels: false,
    showHitMarkers: false,
    laserDiameterMm: 0,
    opacity: 0.8,
    color: 0x61d6a7,
    colorCss: '#61d6a7',
    backgroundLayers: [{
      designId: frozen.id,
      designName: frozen.nameSuffix,
      diagnosticType: frozen.diagnosticType,
      previewRays: buildDiagView2PreviewRays(frozen),
      laserDiameterMm: 0,
      opacity: 0.9,
      color: 0xf2c45c,
      colorCss: '#f2c45c',
    }],
  });

  const root = physicalWebMetresRoot.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY');
  const frustum = root?.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_ACTIVE-CAMERA_FINITE_FRUSTUM') as
    | (Object3D & { geometry: BufferGeometry; material: Material })
    | undefined;
  assert.ok(frustum, 'CAMERA must have a finite translucent four-sided frustum surface');
  assert.equal(frustum.geometry.getAttribute('position').count, 5, 'apex plus four finite FOV corners');
  assert.equal(frustum.geometry.getIndex()?.count, 12, 'four triangular side faces');
  assert.ok(frustum.material.transparent);
  assert.ok(frustum.material.opacity > 0 && frustum.material.opacity < 1);
  assert.equal(root?.userData.kind, 'ehl2-diagnostic-overlay');
  const activeGroup = root?.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_ACTIVE-CAMERA');
  assert.equal(activeGroup?.userData.captureRole, 'active');
  const frozenGroup = root?.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_FROZEN-ARRAY');
  assert.equal(frozenGroup?.userData.captureRole, 'frozen');

  const frustumPositions = frustum.geometry.getAttribute('position');
  const rays = root?.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_ACTIVE-CAMERA_RAYS') as
    | (Object3D & { geometry: BufferGeometry })
    | undefined;
  assert.ok(rays);
  const rayPositions = rays.geometry.getAttribute('position');
  const visibleRays = previewRays.filter((ray) => ray.role !== 'fill');
  const resultById = new Map(rayResults.map((result) => [result.rayId, result]));
  const cornerIds = ['top_edge_00', 'top_edge_09', 'bottom_edge_09', 'bottom_edge_00'] as const;
  cornerIds.forEach((rayId, cornerIndex) => {
    const rayIndex = visibleRays.findIndex((ray) => ray.rayId === rayId);
    assert.ok(rayIndex >= 0);
    const ray = visibleRays[rayIndex];
    const result = resultById.get(rayId);
    assert.ok(result?.hasIntersection);
    approximateFloat32Vector(
      [
        frustumPositions.getX(cornerIndex + 1),
        frustumPositions.getY(cornerIndex + 1),
        frustumPositions.getZ(cornerIndex + 1),
      ],
      diagView2PointToEhl2Web(ray.defaultEndpointM),
      `${rayId} frustum corner must retain the preview length`,
    );
    approximateFloat32Vector(
      [
        rayPositions.getX(rayIndex * 2 + 1),
        rayPositions.getY(rayIndex * 2 + 1),
        rayPositions.getZ(rayIndex * 2 + 1),
      ],
      diagView2PointToEhl2Web(result.effectiveEndpointM),
      `${rayId} ray segment must still stop at its physical CAD hit`,
    );
  });

  assert.ok(frozenGroup, 'frozen project diagnostics must remain visible as a background overlay');
  assert.equal(frozenGroup.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_FROZEN-ARRAY_LABEL'), undefined);
  overlay.dispose();
});

test('the Three overlay renders reviewed geometry under the physical-web-metres root and disposes replacements', () => {
  const physicalWebMetresRoot = new Group();
  const options: Ehl2DiagnosticOverlayOptions = {
    ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
    mode: 'inspect',
    activeScenarioId: 'vs2-0',
    showLabels: false,
    showBlindZones: false,
  };
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, options);
  const overlayRoot = physicalWebMetresRoot.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY');
  assert.ok(overlayRoot);
  assert.equal(overlayRoot.parent, physicalWebMetresRoot);
  assert.equal(overlayRoot.visible, true);
  assert.equal(overlayRoot.userData.coordinateFrame, 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1');
  assert.equal(overlayRoot.userData.raycast, false);

  const scenarioGroup = overlayRoot.getObjectByName('EHL2_DIAGNOSTIC_VS2-0');
  assert.ok(scenarioGroup);
  assert.equal(scenarioGroup.userData.authority, 'ppt-planar-reference');
  assert.equal(overlayRoot.getObjectByName('EHL2_DIAGNOSTIC_VS4-112-5'), undefined);
  assert.equal(overlayRoot.getObjectByName('EHL2_DIAGNOSTIC_VS2-0_THREE_DIMENSIONAL_FRUSTUM'), undefined);

  const expected = buildEhl2DiagnosticScenarioGeometry(scenarioForId('vs2-0'), options);
  const opticalAxis = overlayRoot.getObjectByName('EHL2_DIAGNOSTIC_VS2-0_OPTICAL_AXIS') as Object3D & {
    geometry: BufferGeometry;
  };
  assert.ok(opticalAxis);
  const positions = opticalAxis.geometry.getAttribute('position');
  assert.equal(positions.count, 2);
  approximateFloat32Vector([positions.getX(0), positions.getY(0), positions.getZ(0)], expected.originWebMetres);
  approximateFloat32Vector(
    [positions.getX(1), positions.getY(1), positions.getZ(1)],
    expected.opticalAxisEndWebMetres,
  );

  overlayRoot.traverse((node) => {
    if (!('geometry' in node)) return;
    assert.equal((node.raycast as unknown as () => unknown)(), undefined,
      `${node.name} must not contaminate CAD part picking`);
  });

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  overlayRoot.traverse((node) => {
    const renderable = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      const candidates = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      candidates.forEach((material) => materials.add(material));
    }
  });
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  geometries.forEach((geometry) => {
    const original = geometry.dispose.bind(geometry);
    geometry.dispose = () => { disposedGeometries.add(geometry); original(); };
  });
  materials.forEach((material) => {
    const original = material.dispose.bind(material);
    material.dispose = () => { disposedMaterials.add(material); original(); };
  });

  overlay.setOptions({
    ...options,
    activeScenarioId: 'vs4-112-5',
    verticalHalfAngleDeg: 18,
  });
  assert.equal(disposedGeometries.size, geometries.size);
  assert.equal(disposedMaterials.size, materials.size);
  assert.ok(overlayRoot.getObjectByName('EHL2_DIAGNOSTIC_VS4-112-5_THREE_DIMENSIONAL_FRUSTUM'));
  assert.equal(
    overlayRoot.getObjectByName('EHL2_DIAGNOSTIC_VS4-112-5')?.userData.authority,
    'user-assumption',
  );

  overlay.setOptions(undefined);
  assert.equal(overlayRoot.visible, false);
  assert.equal(overlayRoot.children.length, 0);
  overlay.dispose();
  overlay.dispose();
  assert.equal(overlayRoot.parent, null);
});

test('Tokamak viewer updates DiagView2 options without reloading CAD and loads the overlay only for EHL-2', async () => {
  const viewer = await readFile(
    new URL('../app/components/TokamakCadViewer.tsx', import.meta.url),
    'utf8',
  );
  assert.match(viewer, /diagnosticOverlayOptionsRef\.current = diagnosticOverlayOptions;[\s\S]{0,160}diagnosticOverlay\?\.setOptions\(diagnosticOverlayOptions\);[\s\S]{0,80}\[diagnosticOverlayOptions\]/);
  assert.match(viewer, /const diagnosticOverlayModulePromise = ehl2Session[\s\S]{0,120}import\('\.\/device-viewer\/Ehl2DiagnosticThreeOverlay'\)[\s\S]{0,80}Promise\.resolve\(null\)/);
  assert.match(viewer, /createEhl2DiagnosticThreeOverlay\([\s\S]{0,120}physicalWebMetresRoot: model/);
  assert.match(viewer, /localDiagnosticOverlay\?\.dispose\(\)/);
  assert.match(viewer, /diagnosticOverlay: localDiagnosticOverlay/);

  const initializationDeps = viewer.match(
    /return \(\) => \{ disposed = true; releaseResources\(\); viewerRef\.current = null; \};\s*\}, \[([^\]]+)\]\);/,
  );
  assert.ok(initializationDeps, 'unable to locate the CAD/WebGL initialization effect dependency list');
  assert.doesNotMatch(initializationDeps[1], /diagnosticOverlayOptions/,
    'changing DiagView2 controls must call setOptions, not reload the CAD/WebGL scene');
});

test('diagnostic viewer appearance settings clamp finite inputs and fail closed on invalid state', async () => {
  const viewer = await readFile(
    new URL('../app/components/TokamakCadViewer.tsx', import.meta.url),
    'utf8',
  );
  assert.match(viewer, /function finiteClamped\(value: unknown, minimum: number, maximum: number\): number \| undefined \{[\s\S]{0,180}Number\.isFinite\(value\)[\s\S]{0,120}Math\.min\(maximum, Math\.max\(minimum, value\)\)/);
  assert.match(viewer, /const environmentIntensity = finiteClamped\(input\.environmentIntensity, 0, 5\);/);
  assert.match(viewer, /const backgroundIntensity = finiteClamped\(input\.backgroundIntensity, 0, 5\);/);
  assert.match(viewer, /const backgroundBlurriness = finiteClamped\(input\.backgroundBlurriness, 0, 1\);/);
  assert.match(viewer, /input\.environmentPreset !== 'room-platform-substitute' && input\.environmentPreset !== 'none'/,
    'only the explicitly labelled RoomEnvironment substitute or no environment may be restored');
  assert.match(viewer, /typeof input\.castShadow !== 'boolean'/);
  assert.match(viewer, /if \(!\/\^\[A-Za-z0-9\]\[A-Za-z0-9\._:-\]\{0,159\}\$\/\.test\(partId\)\) continue;/);
  assert.match(viewer, /const bounded = finiteClamped\(opacity, 0, 1\);/);
  assert.match(viewer, /if \(!value \|\| typeof value !== 'object' \|\| Array\.isArray\(value\)\) return \{\};/);
  assert.match(viewer, /diagnosticViewerSettingsRef\.current = next;[\s\S]{0,180}viewerRef\.current\?\.setDiagnosticViewerSettings\(next\);/);
  assert.match(viewer, /setPartOpacities: \(partOpacities: Readonly<Record<string, number>>\)/);
  assert.match(viewer, /const setPartOpacities = \(next: Readonly<Record<string, number>>\) => \{[\s\S]{0,900}nodeByPartId\.has\(partId\)/);
  assert.match(viewer, /partOpacityMaterials\.add\(material\)/);
  assert.match(viewer, /diagnosticViewerState\?: Ehl2DiagnosticViewerState/);
  assert.match(viewer, /onDiagnosticViewerStateChange\?: \(state: Ehl2DiagnosticViewerState\) => void/);
  assert.match(viewer, /export type Ehl2DiagnosticCameraView = \{\s*position: \[number, number, number\];\s*target: \[number, number, number\];\s*up: \[number, number, number\];\s*\}/);
  assert.match(viewer, /cameraView: Ehl2DiagnosticCameraView \| null/);
  assert.match(viewer, /export function parseEhl2DiagnosticViewerState\(value: unknown\): Ehl2DiagnosticViewerState \| null/);
  assert.match(viewer, /const currentKeys = \[\.\.\.legacyKeys\.split\('\|'\), 'cameraView'\]\.sort\(\)\.join\('\|'\);[\s\S]{0,180}if \(inputKeys !== legacyKeys && inputKeys !== currentKeys\) return null/,
    'viewer-state restore must reject unknown/missing fields while migrating the legacy preset-only snapshot');
  assert.match(viewer, /const selectedPartIds = safePartIdList\(input\.selectedPartIds\)/);
  assert.match(viewer, /const partOpacities = safePartOpacityMap\(input\.partOpacities\)/);
  assert.match(viewer, /function safeViewTuple\(value: unknown\): \[number, number, number\] \| null \{[\s\S]{0,200}value\.length !== 3[\s\S]{0,180}finiteClamped\(item, -1_000, 1_000\)/);
  assert.match(viewer, /Object\.keys\(item\)\.sort\(\)\.join\('\|'\) !== \['position', 'target', 'up'\]\.sort\(\)\.join\('\|'\)/);
  assert.match(viewer, /Math\.hypot\(position\[0\] - target\[0\][\s\S]{0,180}< 1e-6 \|\| Math\.hypot\(\.\.\.up\) < 1e-6/,
    'degenerate free-camera poses must fail closed');
  assert.match(viewer, /const cameraView = inputKeys === legacyKeys \? null : safeViewSnapshot\(input\.cameraView\)/,
    'legacy viewer state must deterministically migrate to its named preset');
  const controlledRestoreStart = viewer.indexOf(
    'const parsed = parseEhl2DiagnosticViewerState(diagnosticViewerState);',
  );
  const controlledRestoreEnd = viewer.indexOf(
    'const snapshot: Ehl2DiagnosticViewerState = {',
    controlledRestoreStart,
  );
  assert.ok(
    controlledRestoreStart >= 0 && controlledRestoreEnd > controlledRestoreStart,
    'unable to locate the controlled viewer-state restore effect',
  );
  const controlledRestore = viewer.slice(controlledRestoreStart, controlledRestoreEnd);
  for (const operation of [
    'pendingControlledViewerStateRef.current = key',
    'cameraViewRef.current = next.cameraView',
    'setCameraView(next.cameraView)',
    'if (next.cameraView) viewer.applyView(next.cameraView)',
    'else viewer.setView(next.activeView)',
    'viewer.controls.autoRotate = next.autoRotate',
    'viewer.setWireframe(next.wireframe)',
    'viewer.setClipping(next.clipping, next.clipAxis, next.clipOffset)',
    'viewer.setOpacity(next.globalOpacity, next.selectedOpacity)',
    'viewer.setAnalyticPlasmaVisible(next.analyticPlasmaVisible)',
    'viewer.selectParts(selected)',
    'viewer.applyVisibility(hidden, isolated)',
    'viewer.setPartOpacities(next.partOpacities)',
  ]) {
    assert.ok(
      controlledRestore.includes(operation),
      `controlled workspace restore must apply ${operation}`,
    );
  }
  assert.match(viewer, /const pendingControlledViewerStateRef = useRef\(''\)/);
  const pendingArmIndex = controlledRestore.indexOf('pendingControlledViewerStateRef.current = key');
  const firstInternalUpdateIndex = controlledRestore.indexOf('setActiveView(next.activeView)');
  assert.ok(pendingArmIndex >= 0 && firstInternalUpdateIndex > pendingArmIndex,
    'a controlled restore must arm its target before scheduling internal state updates');
  assert.match(viewer, /if \(pendingControlledViewerStateRef\.current\) \{\s*if \(key === pendingControlledViewerStateRef\.current\) \{\s*lastDiagnosticViewerStateRef\.current = key;\s*pendingControlledViewerStateRef\.current = '';\s*\}\s*return;\s*\}/,
    'intermediate old internal snapshots must never overwrite the parent while a controlled restore is pending');
  assert.match(viewer, /diagnosticViewerStateCallbackRef\.current\?\.\(snapshot\)/,
    'all front-end viewer changes must be serialisable by the parent workspace');
  assert.match(viewer, /const snapshot: Ehl2DiagnosticViewerState = \{[\s\S]{0,500}partOpacities:[\s\S]{0,200}cameraView,[\s\S]{0,300}\};/,
    'workspace state snapshots must include the exact free-orbit camera pose');
  assert.match(viewer, /controls\.addEventListener\('end', \(\) => \{[\s\S]{0,360}position: camera\.position\.toArray\(\)[\s\S]{0,260}target: controls\.target\.toArray\(\)[\s\S]{0,260}up: camera\.up\.toArray\(\)[\s\S]{0,300}cameraViewRef\.current = snapshot;\s*setCameraView\(snapshot\)/,
    'completed orbit interactions must publish a serialisable camera pose');
  assert.match(viewer, /const restoredView = cameraViewRef\.current \?\? viewSnapshotRef\.current;[\s\S]{0,300}camera\.position\.fromArray\(restoredView\.position\)[\s\S]{0,220}controls\.target\.fromArray\(restoredView\.target\)[\s\S]{0,220}camera\.up\.fromArray\(restoredView\.up\)/,
    'a pose restored before viewer activation must be replayed after CAD initialization');
  assert.match(viewer, /const selectView = \(preset: ViewPreset\) => \{\s*viewSnapshotRef\.current = null;\s*cameraViewRef\.current = null;[\s\S]{0,220}setCameraView\(null\)/,
    'choosing a named preset must clear stale free-orbit camera state');
  assert.match(viewer, /const resetView = \(\) => \{[\s\S]{0,500}cameraViewRef\.current = null;\s*setCameraView\(null\)/,
    'viewer reset must also clear the persisted free-camera pose');

  assert.match(viewer, /const roomEnvironmentTexture = normalized\.environmentPreset !== 'none'[\s\S]{0,120}\? localEnvironmentTarget\?\.texture \?\? null[\s\S]{0,80}: null;\s*scene\.environment = roomEnvironmentTexture;/,
    'the explicit none preset must remove RoomEnvironment image-based lighting');
  assert.match(viewer, /scene\.background = normalized\.backgroundEnabled === true \? roomEnvironmentTexture : null;/,
    'a background request must share the preset-gated texture and fail closed when the preset is none');
  assert.match(viewer, /renderer\.shadowMap\.enabled = normalized\.castShadow;[\s\S]{0,220}defaultSceneLights\.forEach[\s\S]{0,220}castShadow = normalized\.castShadow \?\? false[\s\S]{0,260}model\.traverse[\s\S]{0,220}node\.castShadow = normalized\.castShadow \?\? false;\s*node\.receiveShadow = normalized\.castShadow \?\? false/,
    'real-time shadow restore must consistently update renderer, lights and published CAD meshes');
  assert.match(viewer, /provenance: \{\s*schema: 'fusiondigital\.ehl2-public-cad-v1',[\s\S]{0,300}modelSha256: selectedModel\.sha256\.toUpperCase\(\),[\s\S]{0,220}coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',[\s\S]{0,160}engine: 'three-mesh-bvh-v1'/,
    'the runtime exposed to workspace restore must pin the actual manifest-selected public CAD asset');

  const initializationDeps = viewer.match(
    /return \(\) => \{ disposed = true; releaseResources\(\); viewerRef\.current = null; \};\s*\}, \[([^\]]+)\]\);/,
  );
  assert.ok(initializationDeps, 'unable to locate the CAD/WebGL initialization effect dependency list');
  assert.doesNotMatch(initializationDeps[1], /diagnosticViewerSettings/,
    'appearance changes must be applied through the ViewerApi rather than reloading CAD');
  assert.doesNotMatch(initializationDeps[1], /diagnosticViewerState/,
    'restoring view, visibility or opacity state must not reload CAD');
  assert.doesNotMatch(initializationDeps[1], /viewportOverlay/,
    'changing an informational viewport overlay must not reload CAD');
});

test('the public catalog enables DiagView2 only for the real-3D EHL-2 entry and fails closed on drift', async () => {
  const rawCatalog = JSON.parse(await readFile(
    new URL('../public/models/device-catalog.json', import.meta.url),
    'utf8',
  ));
  const catalog = parseDeviceCatalog(rawCatalog);
  const enabled = catalog.devices.filter((device) => device.diagnosticWorkspace !== null);
  assert.deepEqual(enabled.map((device) => device.id), ['ehl-2-preliminary']);

  const ehl = enabled[0];
  assert.equal(ehl.viewer.mode, 'real-3d');
  assert.deepEqual(ehl.diagnosticWorkspace, {
    kind: 'ehl2-diagview2',
    authority: 'design-reference',
    coordinateFrame: EHL2_DIAGVIEW2_SOURCE.coordinateFrame,
    asOf: '2026-08-21',
    sourceLabel: 'DiagView2 geometry-analysis engine and reviewed EHL-2 flange dataset',
    sourceRevision: EHL2_DIAGVIEW2_SOURCE.branchCommit,
    portDatasetEndpoint: '/models/ehl2-preliminary-v1/diagview2-ports.json',
    capabilities: ['camera', 'array', 'laser', 'cad-first-hit', 'render-slicing', 'geometry-io', 'design-report', 'optical-view-capture', 'virtual-forward-model'],
    statement: rawCatalog.devices.find((device: { id: string }) => device.id === ehl.id).diagnosticWorkspace.statement,
  });
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /Browser reproduction of the DiagView2 geometry-analysis workflow/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /reviewed 41-flange EHL-2 design dataset/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not an as-installed survey/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not .*calibrated optical model/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /validated engineering clear-aperture analysis/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not .*manufacturing authority/i);

  const withoutEhlWorkspace = structuredClone(rawCatalog);
  withoutEhlWorkspace.devices.find((device: { id: string }) => device.id === ehl.id).diagnosticWorkspace = null;
  assert.throws(() => parseDeviceCatalog(withoutEhlWorkspace), /requires its reviewed diagnostic workspace contract/);

  const enabledOnExl = structuredClone(rawCatalog);
  const exl = enabledOnExl.devices.find((device: { id: string }) => device.id === 'exl-50u-2026-upgrade');
  exl.diagnosticWorkspace = structuredClone(
    enabledOnExl.devices.find((device: { id: string }) => device.id === ehl.id).diagnosticWorkspace,
  );
  assert.throws(() => parseDeviceCatalog(enabledOnExl), /cannot expose the EHL-2 diagnostic workspace/);

  const staleRevision = structuredClone(rawCatalog);
  staleRevision.devices.find((device: { id: string }) => device.id === ehl.id).diagnosticWorkspace.sourceRevision = '0000000000000000000000000000000000000000';
  assert.throws(() => parseDeviceCatalog(staleRevision), /not a reviewed DiagView2 contract/);
});
