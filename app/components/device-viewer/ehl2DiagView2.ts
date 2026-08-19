export type Ehl2DiagnosticScenarioId =
  | 'vs3-270'
  | 'vs3-135'
  | 'vs2-0'
  | 'vs2-225'
  | 'vs4-112-5';

export type Ehl2DiagnosticScenario = {
  id: Ehl2DiagnosticScenarioId;
  diagnosticId: 'VS2' | 'VS3' | 'VS4';
  azimuthDeg: number;
  sourceFovLabel: '±50';
  spectralBands: readonly ('infrared' | 'visible')[];
  equipmentSets: number | null;
  includedInCompositeAssessment: boolean;
  sourceSlides: readonly number[];
  elevationReferenceAvailable: boolean;
  color: number;
  colorCss: string;
};

export type Ehl2DiagnosticViewMode = 'coverage' | 'inspect' | 'compare';
export type Ehl2DiagnosticDepthMode = 'xray' | 'physical';

export type Ehl2DiagnosticOverlayOptions = {
  labelLocale: 'zh-CN' | 'en';
  mode: Ehl2DiagnosticViewMode;
  activeScenarioId: Ehl2DiagnosticScenarioId;
  compareScenarioIds: readonly Ehl2DiagnosticScenarioId[];
  horizontalHalfAngleDeg: number;
  verticalHalfAngleDeg: number;
  pitchDeg: number;
  yawDeg: number;
  lengthMetres: number;
  depthMode: Ehl2DiagnosticDepthMode;
  showBoundaryRays: boolean;
  showLabels: boolean;
  showBlindZones: boolean;
};

export type Vec3Tuple = readonly [number, number, number];

export type Ehl2DiagnosticScenarioGeometry = {
  scenario: Ehl2DiagnosticScenario;
  authority: 'ppt-planar-reference' | 'user-assumption';
  originWebMetres: Vec3Tuple;
  opticalAxisEndWebMetres: Vec3Tuple;
  planarBoundaryEndsWebMetres: readonly [Vec3Tuple, Vec3Tuple];
  frustumCornersWebMetres: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple] | null;
};

export const EHL2_DIAGVIEW2_SOURCE = Object.freeze({
  branch: 'origin/digView2',
  branchCommit: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79',
  presentationDate: '2026-08-17',
  coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',
  authority: 'design-reference',
});

export const EHL2_DIAGNOSTIC_SCENARIOS: readonly Ehl2DiagnosticScenario[] = Object.freeze([
  {
    id: 'vs3-270', diagnosticId: 'VS3', azimuthDeg: 270, sourceFovLabel: '±50',
    spectralBands: ['infrared', 'visible'], equipmentSets: 2,
    includedInCompositeAssessment: true, sourceSlides: [1, 6, 7],
    elevationReferenceAvailable: true, color: 0x2fbf7c, colorCss: '#2fbf7c',
  },
  {
    id: 'vs3-135', diagnosticId: 'VS3', azimuthDeg: 135, sourceFovLabel: '±50',
    spectralBands: ['infrared', 'visible'], equipmentSets: 2,
    includedInCompositeAssessment: true, sourceSlides: [2, 6, 7],
    elevationReferenceAvailable: true, color: 0x2bb8c7, colorCss: '#2bb8c7',
  },
  {
    id: 'vs2-0', diagnosticId: 'VS2', azimuthDeg: 0, sourceFovLabel: '±50',
    spectralBands: ['visible'], equipmentSets: 1,
    includedInCompositeAssessment: true, sourceSlides: [3, 6, 7],
    elevationReferenceAvailable: true, color: 0x8a6de0, colorCss: '#8a6de0',
  },
  {
    id: 'vs2-225', diagnosticId: 'VS2', azimuthDeg: 225, sourceFovLabel: '±50',
    spectralBands: ['visible'], equipmentSets: 1,
    includedInCompositeAssessment: true, sourceSlides: [4, 6, 7],
    elevationReferenceAvailable: true, color: 0xe66f3f, colorCss: '#e66f3f',
  },
  {
    id: 'vs4-112-5', diagnosticId: 'VS4', azimuthDeg: 112.5, sourceFovLabel: '±50',
    spectralBands: [], equipmentSets: null,
    includedInCompositeAssessment: false, sourceSlides: [5],
    elevationReferenceAvailable: false, color: 0x5d6ec7, colorCss: '#5d6ec7',
  },
]);

export const EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT = Object.freeze({
  sourceSlides: [6, 7] as const,
  diagnosticWindowAzimuthsDeg: [202.5, 292.5] as const,
  centerPost: 'none' as const,
  lowerDivertor: 'none' as const,
  upperDivertor: { status: 'partial' as const, nearAzimuthDeg: 270 },
});

export const DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS: Ehl2DiagnosticOverlayOptions = Object.freeze({
  labelLocale: 'zh-CN',
  mode: 'coverage',
  activeScenarioId: 'vs3-270',
  compareScenarioIds: ['vs3-270', 'vs3-135', 'vs2-0', 'vs2-225'] as const,
  horizontalHalfAngleDeg: 50,
  // The presentation never defines a vertical half-FOV. Zero therefore means
  // "plan view only"; a non-zero value is an explicit user assumption.
  verticalHalfAngleDeg: 0,
  pitchDeg: 0,
  yawDeg: 0,
  lengthMetres: 3.2,
  depthMode: 'xray',
  showBoundaryRays: true,
  showLabels: true,
  showBlindZones: true,
});

const NOMINAL_PORT_RADIUS_METRES = 2.55;

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
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

function normalize(vector: Vec3Tuple, fallback: Vec3Tuple = [0, 0, 1]): Vec3Tuple {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > 1e-9 ? scale(vector, 1 / length) : fallback;
}

function rotateAroundAxis(vector: Vec3Tuple, axis: Vec3Tuple, angleDeg: number): Vec3Tuple {
  if (Math.abs(angleDeg) < 1e-9) return vector;
  const unit = normalize(axis);
  const angle = degreesToRadians(angleDeg);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(vector, cosine), scale(cross(unit, vector), sine)),
    scale(unit, dot(unit, vector) * (1 - cosine)),
  );
}

/**
 * DiagView2 computes optical geometry in a right-handed scientific frame with
 * X/Y horizontal and Z vertical. The reviewed EHL-2 browser GLB is right-handed
 * Y-up. This is the inverse of DiagView2's +90 degree model rotation about X.
 */
export function diagView2PointToEhl2Web(point: Vec3Tuple): Vec3Tuple {
  return [point[0], point[2], -point[1]];
}

export function scenarioForId(id: Ehl2DiagnosticScenarioId) {
  return EHL2_DIAGNOSTIC_SCENARIOS.find((scenario) => scenario.id === id)
    ?? EHL2_DIAGNOSTIC_SCENARIOS[0];
}

export function scenarioIdsForMode(options: Ehl2DiagnosticOverlayOptions): Ehl2DiagnosticScenarioId[] {
  if (options.mode === 'coverage') {
    return EHL2_DIAGNOSTIC_SCENARIOS
      .filter((scenario) => scenario.includedInCompositeAssessment)
      .map((scenario) => scenario.id);
  }
  if (options.mode === 'inspect') return [options.activeScenarioId];
  const allowed = new Set(EHL2_DIAGNOSTIC_SCENARIOS.map((scenario) => scenario.id));
  return [...new Set(options.compareScenarioIds)].filter((id): id is Ehl2DiagnosticScenarioId => allowed.has(id));
}

export function normalizeEhl2DiagnosticOverlayOptions(
  input?: Partial<Ehl2DiagnosticOverlayOptions>,
): Ehl2DiagnosticOverlayOptions {
  const candidate = { ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS, ...input };
  const validScenarioIds = new Set(EHL2_DIAGNOSTIC_SCENARIOS.map((scenario) => scenario.id));
  const activeScenarioId = validScenarioIds.has(candidate.activeScenarioId)
    ? candidate.activeScenarioId
    : DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.activeScenarioId;
  const compareScenarioIds = [...new Set(candidate.compareScenarioIds)]
    .filter((id): id is Ehl2DiagnosticScenarioId => validScenarioIds.has(id));
  return {
    labelLocale: candidate.labelLocale === 'en' ? 'en' : 'zh-CN',
    mode: ['coverage', 'inspect', 'compare'].includes(candidate.mode) ? candidate.mode : 'coverage',
    activeScenarioId,
    compareScenarioIds,
    horizontalHalfAngleDeg: clamp(candidate.horizontalHalfAngleDeg, 1, 75),
    verticalHalfAngleDeg: clamp(candidate.verticalHalfAngleDeg, 0, 60),
    pitchDeg: clamp(candidate.pitchDeg, -35, 35),
    yawDeg: clamp(candidate.yawDeg, -35, 35),
    lengthMetres: clamp(candidate.lengthMetres, 0.5, 6),
    depthMode: candidate.depthMode === 'physical' ? 'physical' : 'xray',
    showBoundaryRays: Boolean(candidate.showBoundaryRays),
    showLabels: Boolean(candidate.showLabels),
    showBlindZones: Boolean(candidate.showBlindZones),
  };
}

export function buildEhl2DiagnosticScenarioGeometry(
  scenario: Ehl2DiagnosticScenario,
  input: Ehl2DiagnosticOverlayOptions,
): Ehl2DiagnosticScenarioGeometry {
  const options = normalizeEhl2DiagnosticOverlayOptions(input);
  const isEditableInspection = options.mode === 'inspect' && options.activeScenarioId === scenario.id;
  const horizontalHalfAngleDeg = isEditableInspection ? options.horizontalHalfAngleDeg : 50;
  const verticalHalfAngleDeg = isEditableInspection ? options.verticalHalfAngleDeg : 0;
  const pitchDeg = isEditableInspection ? options.pitchDeg : 0;
  const yawDeg = isEditableInspection ? options.yawDeg : 0;
  const lengthMetres = isEditableInspection ? options.lengthMetres : DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.lengthMetres;
  const usesUserGeometryAssumption = isEditableInspection && (
    horizontalHalfAngleDeg !== DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.horizontalHalfAngleDeg
    || verticalHalfAngleDeg !== DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.verticalHalfAngleDeg
    || pitchDeg !== DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.pitchDeg
    || yawDeg !== DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.yawDeg
    || lengthMetres !== DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.lengthMetres
  );

  const phi = degreesToRadians(scenario.azimuthDeg);
  const originDiag: Vec3Tuple = [
    NOMINAL_PORT_RADIUS_METRES * Math.cos(phi),
    NOMINAL_PORT_RADIUS_METRES * Math.sin(phi),
    0,
  ];
  const eR: Vec3Tuple = [Math.cos(phi), Math.sin(phi), 0];
  const n = normalize(scale(eR, -1));
  const u = normalize(cross([0, 0, 1], eR), [0, 1, 0]);
  const vAxis = normalize(cross(n, u), [0, 0, -1]);

  const directionFor = (horizontalDeg: number, verticalDeg: number): Vec3Tuple => {
    let direction = normalize(add(
      add(n, scale(u, Math.tan(degreesToRadians(horizontalDeg)))),
      scale(vAxis, Math.tan(degreesToRadians(verticalDeg))),
    ), n);
    // DiagView2 composes R = Rn(roll) * Ru(pitch) * Rv(yaw). With column
    // vectors the yaw therefore acts first, followed by pitch. Roll is not
    // exposed because the PPT provides no detector roll or sensor geometry.
    direction = rotateAroundAxis(direction, vAxis, yawDeg);
    direction = rotateAroundAxis(direction, u, pitchDeg);
    return normalize(direction, n);
  };

  const endFor = (horizontalDeg: number, verticalDeg: number) => diagView2PointToEhl2Web(
    add(originDiag, scale(directionFor(horizontalDeg, verticalDeg), lengthMetres)),
  );
  const originWebMetres = diagView2PointToEhl2Web(originDiag);
  const planarBoundaryEndsWebMetres = [
    endFor(-horizontalHalfAngleDeg, 0),
    endFor(horizontalHalfAngleDeg, 0),
  ] as const;
  const frustumCornersWebMetres = verticalHalfAngleDeg > 0
    ? [
      endFor(-horizontalHalfAngleDeg, -verticalHalfAngleDeg),
      endFor(horizontalHalfAngleDeg, -verticalHalfAngleDeg),
      endFor(horizontalHalfAngleDeg, verticalHalfAngleDeg),
      endFor(-horizontalHalfAngleDeg, verticalHalfAngleDeg),
    ] as const
    : null;

  return {
    scenario,
    authority: usesUserGeometryAssumption ? 'user-assumption' : 'ppt-planar-reference',
    originWebMetres,
    opticalAxisEndWebMetres: endFor(0, 0),
    planarBoundaryEndsWebMetres,
    frustumCornersWebMetres,
  };
}
