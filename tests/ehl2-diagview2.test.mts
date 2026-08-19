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

test('the EHL-2 workbench keeps bilingual, accessible and no-script source content in one contract', async () => {
  const component = await readFile(
    new URL('../app/digital-prototype/Ehl2DiagnosticExperience.tsx', import.meta.url),
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
    ['诊断视线方案工作台', 'Diagnostic viewing-scheme workbench'],
    ['设计参考 · 非物理配准', 'DESIGN REFERENCE · NOT PHYSICALLY REGISTERED'],
    ['四方案复合基线', 'Four-scenario composite baseline'],
    ['五个 PPT 诊断方案', 'Five PPT diagnostic scenarios'],
    ['垂直半视场（PPT 未给出）', 'Vertical half-FOV (not in PPT)'],
    ['忽略遮挡', 'Occlusion bypass'],
    ['PPT 视场标记', 'PPT FOV mark'],
    ['五方案静态来源表（SSR / 无 JavaScript 仍可读取）', 'Static five-scenario source table (readable with SSR / no JavaScript)'],
    ['VS4 仅有平面来源；立面与谱段/套数不完整。', 'VS4 has a plan-view source only; elevation, bands and set count are incomplete.'],
  ] as const) {
    assert.ok(component.includes(chinese), `missing Chinese workbench copy: ${chinese}`);
    assert.ok(component.includes(english), `missing English workbench copy: ${english}`);
  }

  assert.match(component, /<aside className=\{styles\.workbench\} aria-labelledby="ehl2-diagview-title">/);
  assert.match(component, /className=\{styles\.boundaryBanner\} role="note"/);
  assert.match(component, /className=\{styles\.contractError\} role="alert"/);
  assert.match(component, /className=\{styles\.levelTabs\} role="group" aria-label=/);
  assert.match(component, /aria-pressed=\{options\.mode === mode\}/);
  assert.ok((component.match(/aria-live="polite"/g) ?? []).length >= 2);
  assert.match(component, /<fieldset className=\{styles\.renderControls\}>[\s\S]*?<legend>/);
  assert.match(component, /className=\{styles\.tableWrap\} tabIndex=\{0\} role="region" aria-label=/);
  assert.match(component, /<th scope="row">\{scenario\.diagnosticId\}<\/th>/);
  assert.match(component, /aria-label=\{ui\(`校核 \$\{scenario\.diagnosticId\} \$\{scenario\.azimuthDeg\}°`, `Inspect/);
  assert.match(component, /aria-label=\{ui\(`将 \$\{scenario\.diagnosticId\} \$\{scenario\.azimuthDeg\}° 加入对比`, `Compare/);
  assert.match(component, /export function Ehl2DiagnosticNoScriptSummary\(\)/);
  assert.match(component, /className=\{styles\.noScriptSummary\} aria-labelledby="ehl2-diag-noscript-title"/);
  assert.match(component, /JavaScript is unavailable\. The interactive 3D overlay remains off/);
  assert.match(component, /当前未启用 JavaScript，交互式三维叠加保持关闭/);
  assert.match(component, /EHL2_DIAGNOSTIC_SCENARIOS\.map\(\(scenario\) => <ScenarioCard/);
  assert.doesNotMatch(component, /Technical annotation/i);

  assert.match(styles, /\.levelTabs button:hover,\.levelTabs button:focus-visible/);
  assert.match(styles, /\.panel:focus-visible/);
  assert.match(styles, /\.tableWrap\{overflow:auto/);
  assert.match(styles, /\.scenarioCard button[^\n]*min-height:44px/);
  assert.match(styles, /@media\(max-width:1180px\)\{\.root\{display:block\}/);
  assert.match(styles, /@media\(max-width:700px\)\{\.scenarioGrid\{grid-template-columns:1fr\}/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);

  assert.match(workspace, /if \(device\.diagnosticWorkspace\?\.kind === 'ehl2-diagview2'\) \{\s*return <Ehl2DiagnosticExperience device=\{device\} \/>;\s*\}/);
  assert.match(workspace, /return <StandardDeviceExperience device=\{device\} \/>;/);
  assert.match(workspace, /<noscript><Ehl2DiagnosticNoScriptSummary \/><\/noscript>/,
    'the EHL-2 evidence table must remain reachable in homepage SSR without selecting a client-only tab');
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
    asOf: EHL2_DIAGVIEW2_SOURCE.presentationDate,
    sourceLabel: 'DiagView2 PPT design reference',
    sourceRevision: EHL2_DIAGVIEW2_SOURCE.branchCommit,
    statement: rawCatalog.devices.find((device: { id: string }) => device.id === ehl.id).diagnosticWorkspace.statement,
  });
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /PPT-derived planar design reference/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not an as-installed survey/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not .*calibrated optical model/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not .*three-dimensional field-of-view validation/i);
  assert.match(ehl.diagnosticWorkspace?.statement ?? '', /not .*engineering occlusion authority/i);

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
