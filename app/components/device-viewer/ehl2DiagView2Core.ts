/**
 * Pure TypeScript reconstruction of the geometry/report contracts in
 * DiagView2 origin/digView2 @ 868d74d5e0e6c9abaec0eb623bcdd13ead771c79.
 *
 * This module deliberately contains no Three.js, DOM, CAD or server code. CAD
 * intersection remains the caller's responsibility; `createDiagView2RayResult`
 * converts a caller-supplied nearest hit into the source-compatible result
 * contract without pretending that an intersection has been calculated here.
 */

export type DiagView2Vec3 = readonly [number, number, number];
export type DiagView2DiagnosticType = 'CAMERA' | 'ARRAY' | 'LASER';
export type DiagView2RayRole = 'optical_axis' | 'boundary' | 'fill' | 'channel' | 'path_segment';

export type DiagView2SideFlange = {
  kind: 'side_flange';
  section: string;
  angleDeg: number;
  radiusMm: number;
  zMm: number;
  thetaDeg: number;
};

export type DiagView2MidFlange = {
  kind: 'mid_flange';
  section: string;
  angleDeg: number;
  xMm: number;
  yMm: number;
  zMm: number;
  thetaDeg: number;
};

export type DiagView2Flange = DiagView2SideFlange | DiagView2MidFlange;

export type DiagView2Placement =
  | {
    mode: 'explicit';
    /** Resolved DiagView2 world position, metres. */
    positionM: DiagView2Vec3;
    /** Resolved DiagView2 world normal. */
    normal: DiagView2Vec3;
  }
  | {
    mode: 'flange';
    /** Raw row from side_flange or mid_flange; source lengths are millimetres. */
    flange: DiagView2Flange;
  };

export type DiagView2CameraParameters = {
  hStartDeg: number;
  hEndDeg: number;
  vStartDeg: number;
  vEndDeg: number;
  lengthM: number;
};

export type DiagView2ArrayParameters = {
  vStartDeg: number;
  vEndDeg: number;
  rayCount: number;
  lengthM: number;
};

export type DiagView2LaserParameters = {
  diameterMm: number;
  lengthM: number;
  /**
   * Absolute DiagView2 world points in millimetres. As in the source branch,
   * these points are not transformed by the diagnostic rotation. The resolved
   * optical centre is prepended to the path.
   */
  customPathPointsMm: readonly DiagView2Vec3[] | null;
};

export type DiagView2DiagnosticDesign = {
  id: string;
  nameSuffix: string;
  diagnosticType: DiagView2DiagnosticType;
  placement: DiagView2Placement;
  /** [dR, dY, dZ] in source-local millimetres. dR retains the source sign inversion. */
  localOffsetMm: DiagView2Vec3;
  /** Absolute [dX, dY, dZ] world offset in millimetres. */
  worldOffsetMm: DiagView2Vec3;
  /** [pitch, yaw, roll] in degrees, matching the source's rot_x/rot_y/rot_z storage. */
  rotationDeg: DiagView2Vec3;
  camera: DiagView2CameraParameters | null;
  array: DiagView2ArrayParameters | null;
  laser: DiagView2LaserParameters | null;
  /** Enhanced-v3 browser presentation state; absent legacy values receive type defaults. */
  display?: {
    colorHex: string;
    opacity: number;
    visible: boolean;
  };
};

export type DiagView2ResolvedPose = {
  basePositionM: DiagView2Vec3;
  positionM: DiagView2Vec3;
  /** Unrotated source normal. */
  normal: DiagView2Vec3;
  /** Source local frame: normal, toroidal tangent, poloidal tangent. */
  n: DiagView2Vec3;
  u: DiagView2Vec3;
  v: DiagView2Vec3;
  rotationDeg: DiagView2Vec3;
};

export type DiagView2DiagnosticRay = {
  rayId: string;
  diagnosticType: DiagView2DiagnosticType;
  role: DiagView2RayRole;
  channelIndex: number | null;
  originM: DiagView2Vec3;
  direction: DiagView2Vec3;
  defaultLengthM: number;
  defaultEndpointM: DiagView2Vec3;
  hAngleDeg: number | null;
  vAngleDeg: number | null;
};

export type DiagView2RayHit = {
  hitModel: string;
  hitPointM: DiagView2Vec3;
  hitDistanceM?: number;
  triangleIndex: number;
  hitFaceNormal: DiagView2Vec3;
  incidenceAngleDeg?: number;
};

export type DiagView2RayResult = DiagView2DiagnosticRay & {
  effectiveEndpointM: DiagView2Vec3;
  hasIntersection: boolean;
  hitModel: string | null;
  hitDistanceM: number | null;
  hitPointM: DiagView2Vec3 | null;
  triangleIndex: number | null;
  hitFaceNormal: DiagView2Vec3 | null;
  incidenceAngleDeg: number | null;
};

export type DiagView2DesignStore = {
  schema: 'fusiondigital.diagview2-design';
  version: 3;
  source: {
    branch: 'origin/digView2';
    commit: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79';
    compatibility: 'browser-reconstruction';
  };
  deviceId: string;
  diagnostics: readonly DiagView2DiagnosticDesign[];
  migratedFromVersion?: 2;
};

export type DiagView2ReportRay = DiagView2RayResult & {
  originMm: DiagView2Vec3;
  defaultEndpointMm: DiagView2Vec3;
  effectiveEndpointMm: DiagView2Vec3;
  hitPointMm: DiagView2Vec3 | null;
  /** atan2(hit Y, hit X), in the report's right-handed Cartesian frame. */
  hitToroidalAngleDeg: number | null;
  /** atan2(hit Z, hypot(hit X, hit Y) - R_major), matching DiagView2. */
  hitPoloidalAngleDeg: number | null;
  slopeXY: number | null;
  slopeXZ: number | null;
  slopeYZ: number | null;
  parametricForm: {
    x: string;
    y: string;
    z: string;
  };
};

export type DiagView2Report = {
  meta: {
    reportId: string;
    deviceName: string;
    diagnosticType: Lowercase<DiagView2DiagnosticType>;
    creationTime: string;
    schemaVersion: 3;
    coordinateSystem: 'Right-handed Cartesian';
    positionUnit: 'mm';
    angleUnit: 'degrees';
    authority: 'virtual-browser-output';
    intersectionMode: 'source-cad' | 'render-state' | 'not-applicable' | 'unspecified';
    hitAngleDefinition: 'toroidal=atan2(Y,X); poloidal=atan2(Z,sqrt(X^2+Y^2)-R_major)';
    /** Active plasma R0 when supplied; otherwise the audited source-branch default. */
    poloidalReferenceMajorRadiusM: number;
  };
  design: DiagView2DiagnosticDesign;
  pose: DiagView2ResolvedPose;
  summary: {
    rayCount: number;
    hitCount: number;
    intersectionStatus: 'completed' | 'not-applicable';
    virtualOutput: true;
  };
  rays: readonly DiagView2ReportRay[];
  intersections: readonly DiagView2ReportRay[];
};

export type DiagView2ReportOptions = {
  deviceName?: string;
  /** Records whether first hits used all source CAD or the current exploratory render state. */
  intersectionMode?: 'source-cad' | 'render-state';
  /**
   * R_major used only for the source-compatible poloidal hit angle. The exact
   * audited branch defaults its active plasma R0 to 0.950 m.
   */
  poloidalReferenceMajorRadiusM?: number;
  /** ISO string or Date. Supplying it makes report output deterministic. */
  createdAt?: string | Date;
};

export type DiagView2ProjectReportEntry = {
  design: DiagView2DiagnosticDesign;
  analysisStatus: 'completed' | 'exploratory-completed' | 'not-run' | 'not-applicable';
  report: DiagView2Report | null;
};

export type DiagView2ProjectReportOptions = {
  deviceName?: string;
  createdAt?: string | Date;
};

export type DiagView2GeqdskData = {
  caseName: string;
  nw: number;
  nh: number;
  rdimM: number;
  zdimM: number;
  rcentrM: number;
  rleftM: number;
  zmidM: number;
  rmaxisM: number;
  zmaxisM: number;
  simag: number;
  sibry: number;
  bcentrT: number;
  currentA: number;
  fpol: Float64Array;
  pressure: Float64Array;
  ffprim: Float64Array;
  pprime: Float64Array;
  /** R-major flat storage: cell index = rIndex * nh + zIndex. */
  psirz: Float64Array;
  qpsi: Float64Array;
  rM: Float64Array;
  zM: Float64Array;
  /** R-major normalized poloidal flux. Not clipped. */
  psiNorm: Float64Array;
  boundaryRM: Float64Array;
  boundaryZM: Float64Array;
  limiterRM: Float64Array;
  limiterZM: Float64Array;
  trailingTokenCount: number;
};

export type DiagView2MathProfileModel =
  | 'linear'
  | 'parabolic'
  | 'square-parabolic'
  | 'flat-center';

export type DiagView2MathProfile = {
  model: DiagView2MathProfileModel;
  coreValue: number;
  edgeValue: number;
  unit: 'relative-emissivity' | 'relative-line-weight';
  authority: 'virtual-software';
  values: Float64Array;
  rho: Float64Array;
};

export type DiagView2SparseWeightRow = {
  rayId: string;
  /** R-major GEQDSK cell indices. */
  cellIndices: Uint32Array;
  /** Path length accumulated in each cell, metres. */
  pathLengthsM: Float32Array;
  sampledLengthM: number;
  centerPostBlockDistanceM: number | null;
};

export type DiagView2VirtualForwardProgress = {
  phase: 'ray-marching';
  completedRays: number;
  totalRays: number;
  fraction: number;
};

export type DiagView2VirtualForwardControl = {
  /** Checked before each ray and periodically during ray marching. */
  shouldAbort?: () => boolean;
  /** Called at 0%, after each completed ray, and at 100%. */
  onProgress?: (progress: DiagView2VirtualForwardProgress) => void;
};

export type DiagView2VirtualForwardOptions = {
  /** Source branch uses 0.005 m. */
  stepM?: number;
  /** Source branch uses 10 m independently of the display-ray length. */
  maxLengthM?: number;
  /** Browser guard; checked before allocation/marching. */
  maxTotalSamples?: number;
  control?: DiagView2VirtualForwardControl;
};

export type DiagView2VirtualWeightResult = {
  authority: 'virtual-software';
  model: 'axisymmetric-rz-ray-marching';
  stepM: number;
  maxLengthM: number;
  rays: readonly DiagView2DiagnosticRay[];
  weights: readonly DiagView2SparseWeightRow[];
};

export type DiagView2VirtualForwardResult = DiagView2VirtualWeightResult & {
  profile: DiagView2MathProfile;
  signals: Float64Array;
  normalizedSignals: Float64Array;
  normalizationReferenceSignal: number;
  signalUnit: 'relative-emissivity·m' | 'relative-line-weight·m';
  warnings: readonly string[];
};

export const DIAGVIEW2_SOURCE = Object.freeze({
  branch: 'origin/digView2' as const,
  commit: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79' as const,
});

export const DIAGVIEW2_DEFAULTS = Object.freeze({
  rayLengthM: 5,
  cameraEdgeSamplesPerSide: 10,
  cameraFillSamplesX: 10,
  cameraFillSamplesY: 10,
  arrayRayCount: 21,
  laserDiameterMm: 100,
  localOffsetLimitMm: 5_000,
  worldOffsetLimitMm: 5_000,
});

const EPSILON = 1e-12;
const RAY_EPSILON_M = 1e-6;
const MAX_POSITION_M = 100;
const MAX_RAY_LENGTH_M = 100;
const TANGENT_COS_EPSILON = 1e-6;

export class DiagView2ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagView2ValidationError';
  }
}

export class DiagView2AbortError extends Error {
  constructor(message = 'DiagView2 virtual forward model was aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

function fail(path: string, message: string): never {
  throw new DiagView2ValidationError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'expected an object');
  return value;
}

function finiteNumber(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number');
  if (value < min || value > max) fail(path, `expected ${min} <= value <= ${max}`);
  return Object.is(value, -0) ? 0 : value;
}

function finiteInteger(value: unknown, path: string, min: number, max: number): number {
  const result = finiteNumber(value, path, min, max);
  if (!Number.isInteger(result)) fail(path, 'expected an integer');
  return result;
}

function nonEmptyString(value: unknown, path: string, maxLength = 160): string {
  if (typeof value !== 'string') fail(path, 'expected a string');
  const result = value.trim();
  if (!result) fail(path, 'must not be empty');
  if (result.length > maxLength) fail(path, `must not exceed ${maxLength} characters`);
  return result;
}

function vec3(value: unknown, path: string, min = -Infinity, max = Infinity): DiagView2Vec3 {
  if (!Array.isArray(value) || value.length !== 3) fail(path, 'expected exactly three coordinates');
  return [
    finiteNumber(value[0], `${path}[0]`, min, max),
    finiteNumber(value[1], `${path}[1]`, min, max),
    finiteNumber(value[2], `${path}[2]`, min, max),
  ];
}

function optionalNumber(value: unknown, path: string, fallback: number, min: number, max: number): number {
  return value === undefined ? fallback : finiteNumber(value, path, min, max);
}

function tangentAngle(value: unknown, path: string, min: number, max: number): number {
  const angle = finiteNumber(value, path, min, max);
  if (Math.abs(Math.cos(degreesToRadians(angle))) < TANGENT_COS_EPSILON) {
    fail(path, 'is too close to a tan() singularity');
  }
  return angle;
}

function add(a: DiagView2Vec3, b: DiagView2Vec3): DiagView2Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: DiagView2Vec3, b: DiagView2Vec3): DiagView2Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: DiagView2Vec3, factor: number): DiagView2Vec3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function dot(a: DiagView2Vec3, b: DiagView2Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: DiagView2Vec3, b: DiagView2Vec3): DiagView2Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function magnitude(value: DiagView2Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: DiagView2Vec3, path: string, fallback?: DiagView2Vec3): DiagView2Vec3 {
  const length = magnitude(value);
  if (length <= EPSILON) {
    if (fallback) return fallback;
    fail(path, 'zero-length vector is not allowed');
  }
  const result = scale(value, 1 / length);
  if (!result.every(Number.isFinite)) fail(path, 'normalization produced a non-finite vector');
  return result;
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function rotateAroundAxis(value: DiagView2Vec3, axis: DiagView2Vec3, degrees: number): DiagView2Vec3 {
  if (Math.abs(degrees) <= EPSILON) return value;
  const unit = normalize(axis, 'rotation axis');
  const angle = degreesToRadians(degrees);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(value, cosine), scale(cross(unit, value), sine)),
    scale(unit, dot(unit, value) * (1 - cosine)),
  );
}

function sourceRotate(
  direction: DiagView2Vec3,
  frame: Pick<DiagView2ResolvedPose, 'n' | 'u' | 'v' | 'rotationDeg'>,
): DiagView2Vec3 {
  const [pitch, yaw, roll] = frame.rotationDeg;
  // scipy Rotation composition in the source is Rroll * Rpitch * Ryaw.
  // For column vectors, yaw acts first, then pitch, then roll.
  let result = rotateAroundAxis(direction, frame.v, yaw);
  result = rotateAroundAxis(result, frame.u, pitch);
  result = rotateAroundAxis(result, frame.n, roll);
  return normalize(result, 'rotated direction', frame.n);
}

function sourceFrame(positionM: DiagView2Vec3, normalValue: DiagView2Vec3) {
  const n = normalize(normalValue, 'normal');
  const radius = Math.hypot(positionM[0], positionM[1]);
  const eR: DiagView2Vec3 = radius < EPSILON
    ? [1, 0, 0]
    : [positionM[0] / radius, positionM[1] / radius, 0];
  let u = cross([0, 0, 1], eR);
  u = magnitude(u) < EPSILON ? [0, 1, 0] : normalize(u, 'local u');
  let v = cross(n, u);
  if (magnitude(v) < EPSILON) {
    let fallback: DiagView2Vec3 = [1, 0, 0];
    if (Math.abs(dot(n, fallback)) > 0.95) fallback = [0, 1, 0];
    v = cross(n, fallback);
  }
  v = normalize(v, 'local v', [0, 0, 1]);
  return { n, u, v };
}

function lowercaseType(type: DiagView2DiagnosticType): Lowercase<DiagView2DiagnosticType> {
  return type.toLowerCase() as Lowercase<DiagView2DiagnosticType>;
}

function typeFromUnknown(value: unknown, path: string): DiagView2DiagnosticType {
  if (typeof value !== 'string') fail(path, 'expected CAMERA, ARRAY or LASER');
  const result = value.toUpperCase();
  if (result !== 'CAMERA' && result !== 'ARRAY' && result !== 'LASER') {
    fail(path, `unsupported diagnostic type ${JSON.stringify(value)}`);
  }
  return result;
}

function parseFlange(value: unknown, path: string): DiagView2Flange {
  const record = asRecord(value, path);
  const kind = record.kind;
  const section = nonEmptyString(record.section, `${path}.section`, 40);
  const angleDeg = finiteNumber(record.angleDeg, `${path}.angleDeg`, -360, 360);
  const thetaDeg = finiteNumber(record.thetaDeg, `${path}.thetaDeg`, -360, 360);
  if (kind === 'side_flange') {
    return {
      kind,
      section,
      angleDeg,
      radiusMm: finiteNumber(record.radiusMm, `${path}.radiusMm`, -100_000, 100_000),
      zMm: finiteNumber(record.zMm, `${path}.zMm`, -100_000, 100_000),
      thetaDeg,
    };
  }
  if (kind === 'mid_flange') {
    return {
      kind,
      section,
      angleDeg,
      xMm: finiteNumber(record.xMm, `${path}.xMm`, -100_000, 100_000),
      yMm: finiteNumber(record.yMm, `${path}.yMm`, -100_000, 100_000),
      zMm: finiteNumber(record.zMm, `${path}.zMm`, -100_000, 100_000),
      thetaDeg,
    };
  }
  return fail(`${path}.kind`, 'expected side_flange or mid_flange');
}

function parsePlacement(value: unknown, path: string): DiagView2Placement {
  const record = asRecord(value, path);
  if (record.mode === 'explicit') {
    return {
      mode: 'explicit',
      positionM: vec3(record.positionM, `${path}.positionM`, -MAX_POSITION_M, MAX_POSITION_M),
      normal: normalize(vec3(record.normal, `${path}.normal`, -1e6, 1e6), `${path}.normal`),
    };
  }
  if (record.mode === 'flange') {
    return { mode: 'flange', flange: parseFlange(record.flange, `${path}.flange`) };
  }
  return fail(`${path}.mode`, 'expected explicit or flange');
}

function parseCamera(value: unknown, path: string): DiagView2CameraParameters {
  const record = asRecord(value, path);
  return {
    hStartDeg: tangentAngle(record.hStartDeg, `${path}.hStartDeg`, -180, 180),
    hEndDeg: tangentAngle(record.hEndDeg, `${path}.hEndDeg`, -180, 180),
    vStartDeg: tangentAngle(record.vStartDeg, `${path}.vStartDeg`, -90, 90),
    vEndDeg: tangentAngle(record.vEndDeg, `${path}.vEndDeg`, -90, 90),
    lengthM: finiteNumber(record.lengthM, `${path}.lengthM`, 0.1, MAX_RAY_LENGTH_M),
  };
}

function parseArrayParameters(value: unknown, path: string): DiagView2ArrayParameters {
  const record = asRecord(value, path);
  return {
    vStartDeg: tangentAngle(record.vStartDeg, `${path}.vStartDeg`, -90, 90),
    vEndDeg: tangentAngle(record.vEndDeg, `${path}.vEndDeg`, -90, 90),
    rayCount: finiteInteger(record.rayCount, `${path}.rayCount`, 2, 201),
    lengthM: finiteNumber(record.lengthM, `${path}.lengthM`, 0.1, MAX_RAY_LENGTH_M),
  };
}

function parseLaser(value: unknown, path: string): DiagView2LaserParameters {
  const record = asRecord(value, path);
  let customPathPointsMm: readonly DiagView2Vec3[] | null = null;
  if (record.customPathPointsMm !== null && record.customPathPointsMm !== undefined) {
    if (!Array.isArray(record.customPathPointsMm)) fail(`${path}.customPathPointsMm`, 'expected an array or null');
    if (record.customPathPointsMm.length > 10_000) fail(`${path}.customPathPointsMm`, 'too many points');
    customPathPointsMm = record.customPathPointsMm.map((point, index) => (
      vec3(point, `${path}.customPathPointsMm[${index}]`, -100_000, 100_000)
    ));
  }
  return {
    diameterMm: finiteNumber(record.diameterMm, `${path}.diameterMm`, 0, 5_000),
    lengthM: finiteNumber(record.lengthM, `${path}.lengthM`, 0.1, MAX_RAY_LENGTH_M),
    customPathPointsMm,
  };
}

function defaultDisplay(diagnosticType: DiagView2DiagnosticType) {
  return {
    colorHex: diagnosticType === 'CAMERA' ? '#61d6a7' : diagnosticType === 'ARRAY' ? '#f2c45c' : '#ff735d',
    opacity: diagnosticType === 'LASER' ? 0.25 : diagnosticType === 'CAMERA' ? 0.6 : 1,
    visible: true,
  };
}

function parseDisplay(value: unknown, diagnosticType: DiagView2DiagnosticType, path: string) {
  const fallback = defaultDisplay(diagnosticType);
  if (value === null || value === undefined) return fallback;
  const record = asRecord(value, path);
  const colorHex = nonEmptyString(record.colorHex, `${path}.colorHex`).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(colorHex)) fail(`${path}.colorHex`, 'expected #RRGGBB');
  if (typeof record.visible !== 'boolean') fail(`${path}.visible`, 'expected a boolean');
  return {
    colorHex,
    opacity: finiteNumber(record.opacity, `${path}.opacity`, 0, 1),
    visible: record.visible,
  };
}

function parseDesign(value: unknown, path: string): DiagView2DiagnosticDesign {
  const record = asRecord(value, path);
  const diagnosticType = typeFromUnknown(record.diagnosticType, `${path}.diagnosticType`);
  const camera = record.camera === null || record.camera === undefined
    ? null
    : parseCamera(record.camera, `${path}.camera`);
  const array = record.array === null || record.array === undefined
    ? null
    : parseArrayParameters(record.array, `${path}.array`);
  const laser = record.laser === null || record.laser === undefined
    ? null
    : parseLaser(record.laser, `${path}.laser`);
  if (diagnosticType === 'CAMERA' && !camera) fail(`${path}.camera`, 'CAMERA design requires camera parameters');
  if (diagnosticType === 'ARRAY' && !array) fail(`${path}.array`, 'ARRAY design requires array parameters');
  if (diagnosticType === 'LASER' && !laser) fail(`${path}.laser`, 'LASER design requires laser parameters');
  return {
    id: nonEmptyString(record.id, `${path}.id`),
    nameSuffix: nonEmptyString(record.nameSuffix, `${path}.nameSuffix`),
    diagnosticType,
    placement: parsePlacement(record.placement, `${path}.placement`),
    localOffsetMm: vec3(
      record.localOffsetMm,
      `${path}.localOffsetMm`,
      -DIAGVIEW2_DEFAULTS.localOffsetLimitMm,
      DIAGVIEW2_DEFAULTS.localOffsetLimitMm,
    ),
    worldOffsetMm: vec3(
      record.worldOffsetMm,
      `${path}.worldOffsetMm`,
      -DIAGVIEW2_DEFAULTS.worldOffsetLimitMm,
      DIAGVIEW2_DEFAULTS.worldOffsetLimitMm,
    ),
    rotationDeg: vec3(record.rotationDeg, `${path}.rotationDeg`, -180, 180),
    camera: diagnosticType === 'CAMERA' ? camera : null,
    array: diagnosticType === 'ARRAY' ? array : null,
    laser: diagnosticType === 'LASER' ? laser : null,
    display: parseDisplay(record.display, diagnosticType, `${path}.display`),
  };
}

function validatedDesign(value: DiagView2DiagnosticDesign): DiagView2DiagnosticDesign {
  return parseDesign(value, 'design');
}

export function createDefaultDiagView2Design(
  diagnosticType: DiagView2DiagnosticType = 'CAMERA',
  id = 'diagnostic-1',
): DiagView2DiagnosticDesign {
  const type = typeFromUnknown(diagnosticType, 'diagnosticType');
  return {
    id: nonEmptyString(id, 'id'),
    nameSuffix: nonEmptyString(id, 'id'),
    diagnosticType: type,
    // Explicit, not a claimed EHL-2 surveyed port. This keeps the kernel usable
    // before the reviewed port-data JSON is available.
    placement: { mode: 'explicit', positionM: [2.55, 0, 0], normal: [-1, 0, 0] },
    localOffsetMm: [0, 0, 0],
    worldOffsetMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    camera: type === 'CAMERA'
      ? { hStartDeg: -20, hEndDeg: 20, vStartDeg: -10, vEndDeg: 20, lengthM: 5 }
      : null,
    array: type === 'ARRAY'
      ? { vStartDeg: -10, vEndDeg: 20, rayCount: 21, lengthM: 5 }
      : null,
    laser: type === 'LASER'
      ? { diameterMm: 100, lengthM: 5, customPathPointsMm: null }
      : null,
    display: defaultDisplay(type),
  };
}

function basePose(placement: DiagView2Placement) {
  if (placement.mode === 'explicit') {
    return {
      positionM: placement.positionM,
      normal: normalize(placement.normal, 'placement.normal'),
    };
  }
  const { flange } = placement;
  const angle = degreesToRadians(flange.angleDeg);
  const positionM: DiagView2Vec3 = flange.kind === 'side_flange'
    ? [
      flange.radiusMm * Math.cos(angle) / 1_000,
      flange.radiusMm * Math.sin(angle) / 1_000,
      flange.zMm / 1_000,
    ]
    : [flange.xMm / 1_000, flange.yMm / 1_000, flange.zMm / 1_000];
  const radius = Math.hypot(positionM[0], positionM[1]);
  const eR: DiagView2Vec3 = radius < 1e-9
    ? [1, 0, 0]
    : [positionM[0] / radius, positionM[1] / radius, 0];
  const theta = degreesToRadians(flange.thetaDeg);
  const normal = normalize(
    add(scale(eR, Math.cos(theta)), scale([0, 0, 1], Math.sin(theta))),
    'flange normal',
    [0, 0, 1],
  );
  return { positionM, normal };
}

export function resolveDiagView2Pose(input: DiagView2DiagnosticDesign): DiagView2ResolvedPose {
  const design = validatedDesign(input);
  const base = basePose(design.placement);
  const offsetFrame = sourceFrame(base.positionM, base.normal);
  const [dR, dY, dZ] = design.localOffsetMm;
  const localOffsetM = add(
    add(scale(offsetFrame.n, -dR / 1_000), scale(offsetFrame.u, dY / 1_000)),
    scale(offsetFrame.v, dZ / 1_000),
  );
  const worldOffsetM = scale(design.worldOffsetMm, 1 / 1_000);
  const positionM = add(add(base.positionM, localOffsetM), worldOffsetM);
  if (!positionM.every(Number.isFinite)) fail('design offsets', 'resolved position is non-finite');
  // DiagView2 recomputes u from the final absolute position, while preserving
  // the flange/explicit normal. Retaining that detail avoids subtle ray drift.
  const finalFrame = sourceFrame(positionM, base.normal);
  return {
    basePositionM: base.positionM,
    positionM,
    normal: base.normal,
    ...finalFrame,
    rotationDeg: design.rotationDeg,
  };
}

/**
 * Resolve the source-compatible rotated local basis. DiagView2 composes the
 * stored angles as Rroll(n) * Rpitch(u) * Ryaw(v); the same transform must be
 * used for ray generation, array-plane slicing and optical-view capture.
 */
export function resolveDiagView2RotatedFrame(input: DiagView2DiagnosticDesign) {
  const pose = resolveDiagView2Pose(input);
  return {
    ...pose,
    n: sourceRotate(pose.n, pose),
    u: sourceRotate(pose.u, pose),
    v: sourceRotate(pose.v, pose),
  };
}

function makeRay(
  design: DiagView2DiagnosticDesign,
  pose: DiagView2ResolvedPose,
  rayId: string,
  role: DiagView2RayRole,
  rawDirection: DiagView2Vec3,
  lengthM: number,
  channelIndex: number | null,
  hAngleDeg: number | null,
  vAngleDeg: number | null,
  originM = pose.positionM,
): DiagView2DiagnosticRay {
  const direction = sourceRotate(normalize(rawDirection, `${rayId}.direction`, pose.n), pose);
  return {
    rayId,
    diagnosticType: design.diagnosticType,
    role,
    channelIndex,
    originM,
    direction,
    defaultLengthM: lengthM,
    defaultEndpointM: add(originM, scale(direction, lengthM)),
    hAngleDeg,
    vAngleDeg,
  };
}

function linearSamples(start: number, end: number, count: number): number[] {
  if (count === 1) return [start];
  return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
}

function cameraRays(design: DiagView2DiagnosticDesign, includeFill: boolean): DiagView2DiagnosticRay[] {
  const camera = design.camera;
  if (!camera) fail('design.camera', 'CAMERA parameters are unavailable');
  const pose = resolveDiagView2Pose(design);
  const rays: DiagView2DiagnosticRay[] = [];
  const addAngularRay = (rayId: string, role: DiagView2RayRole, h: number, v: number) => {
    const raw = add(
      add(pose.n, scale(pose.u, Math.tan(degreesToRadians(h)))),
      scale(pose.v, Math.tan(degreesToRadians(v))),
    );
    rays.push(makeRay(design, pose, rayId, role, raw, camera.lengthM, null, h, v));
  };
  addAngularRay('optical_axis', 'optical_axis', 0, 0);
  const hSamples = linearSamples(camera.hStartDeg, camera.hEndDeg, 10);
  const vSamples = linearSamples(camera.vStartDeg, camera.vEndDeg, 10);
  hSamples.forEach((h, index) => {
    addAngularRay(`top_edge_${String(index).padStart(2, '0')}`, 'boundary', h, camera.vEndDeg);
    addAngularRay(`bottom_edge_${String(index).padStart(2, '0')}`, 'boundary', h, camera.vStartDeg);
  });
  vSamples.forEach((v, index) => {
    addAngularRay(`left_edge_${String(index).padStart(2, '0')}`, 'boundary', camera.hStartDeg, v);
    addAngularRay(`right_edge_${String(index).padStart(2, '0')}`, 'boundary', camera.hEndDeg, v);
  });
  if (includeFill) {
    const hFill = linearSamples(camera.hStartDeg, camera.hEndDeg, 10);
    const vFill = linearSamples(camera.vStartDeg, camera.vEndDeg, 10);
    vFill.forEach((v, vIndex) => hFill.forEach((h, hIndex) => {
      addAngularRay(
        `fill_${String(vIndex).padStart(2, '0')}_${String(hIndex).padStart(2, '0')}`,
        'fill',
        h,
        v,
      );
    }));
  }
  return rays;
}

function arrayRays(design: DiagView2DiagnosticDesign): DiagView2DiagnosticRay[] {
  const array = design.array;
  if (!array) fail('design.array', 'ARRAY parameters are unavailable');
  const pose = resolveDiagView2Pose(design);
  return linearSamples(array.vStartDeg, array.vEndDeg, array.rayCount).map((v, index) => (
    makeRay(
      design,
      pose,
      `ch_${index}`,
      'channel',
      add(pose.n, scale(pose.v, Math.tan(degreesToRadians(v)))),
      array.lengthM,
      index,
      null,
      v,
    )
  ));
}

function laserRays(design: DiagView2DiagnosticDesign): DiagView2DiagnosticRay[] {
  const laser = design.laser;
  if (!laser) fail('design.laser', 'LASER parameters are unavailable');
  const pose = resolveDiagView2Pose(design);
  if (!laser.customPathPointsMm || laser.customPathPointsMm.length === 0) {
    return [makeRay(
      design,
      pose,
      'segment_0',
      'path_segment',
      pose.n,
      laser.lengthM,
      0,
      null,
      null,
    )];
  }
  const pointsM: DiagView2Vec3[] = [
    pose.positionM,
    ...laser.customPathPointsMm.map((point) => scale(point, 1 / 1_000)),
  ];
  return pointsM.slice(0, -1).map((origin, index) => {
    const delta = subtract(pointsM[index + 1], origin);
    const lengthM = magnitude(delta);
    if (lengthM <= RAY_EPSILON_M) fail(`design.laser.customPathPointsMm[${index}]`, 'creates a zero-length segment');
    // Custom points are absolute and deliberately bypass local rotation.
    const direction = normalize(delta, `laser segment ${index}`);
    return {
      rayId: `segment_${index}`,
      diagnosticType: 'LASER',
      role: 'path_segment',
      channelIndex: index,
      originM: origin,
      direction,
      defaultLengthM: lengthM,
      defaultEndpointM: pointsM[index + 1],
      hAngleDeg: null,
      vAngleDeg: null,
    };
  });
}

/** Source preview: camera axis + 4x10 edge rays (41), all array channels, or the laser path. */
export function buildDiagView2PreviewRays(input: DiagView2DiagnosticDesign): DiagView2DiagnosticRay[] {
  const design = validatedDesign(input);
  if (design.diagnosticType === 'CAMERA') return cameraRays(design, false);
  if (design.diagnosticType === 'ARRAY') return arrayRays(design);
  return laserRays(design);
}

/** Source trace/forward set: camera preview + 10x10 fill (141), or all array/laser rays. */
export function buildDiagView2TraceRays(input: DiagView2DiagnosticDesign): DiagView2DiagnosticRay[] {
  const design = validatedDesign(input);
  if (design.diagnosticType === 'CAMERA') return cameraRays(design, true);
  if (design.diagnosticType === 'ARRAY') return arrayRays(design);
  return laserRays(design);
}

const GEQDSK_NUMBER_PATTERN = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?/g;
const MAX_GEQDSK_TEXT_LENGTH = 16 * 1024 * 1024;
const MAX_GEQDSK_CELLS = 1_000_000;

function parseGeqdskTokens(text: string): number[] {
  const matches = text.match(GEQDSK_NUMBER_PATTERN) ?? [];
  const residue = text.replace(GEQDSK_NUMBER_PATTERN, '').trim();
  if (residue) fail('GEQDSK numeric body', `contains unparseable content ${JSON.stringify(residue.slice(0, 40))}`);
  return matches.map((token, index) => {
    const value = Number(token.replace(/[dD]/, 'E'));
    return finiteNumber(value, `GEQDSK token ${index}`);
  });
}

function geqdskLinspace(start: number, end: number, count: number): Float64Array {
  const result = new Float64Array(count);
  if (count === 1) {
    result[0] = start;
    return result;
  }
  for (let index = 0; index < count; index += 1) {
    result[index] = start + (end - start) * index / (count - 1);
  }
  return result;
}

/**
 * Parse the sequential GEQDSK layout used by DiagView2's GFileLoader.
 * The result converts the file's R-fast stream into R-major browser storage.
 */
export function parseDiagView2Geqdsk(input: string): DiagView2GeqdskData {
  if (typeof input !== 'string' || input.length === 0) fail('GEQDSK', 'expected non-empty text');
  if (input.length > MAX_GEQDSK_TEXT_LENGTH) fail('GEQDSK', 'file exceeds the 16 MiB browser limit');
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const header = lines[0] ?? '';
  if (header.length < 49) fail('GEQDSK header', 'expected a 48-character case field followed by imfit, nw and nh');
  const headerIntegers = header.slice(48).trim().split(/\s+/).filter(Boolean).map((token, index) => {
    if (!/^[+-]?\d+$/.test(token)) fail(`GEQDSK header integer ${index}`, 'expected an integer');
    return Number(token);
  });
  if (headerIntegers.length < 3) fail('GEQDSK header', 'could not parse imfit, nw and nh');
  const nw = finiteInteger(headerIntegers[1], 'GEQDSK nw', 2, 4_096);
  const nh = finiteInteger(headerIntegers[2], 'GEQDSK nh', 2, 4_096);
  if (nw * nh > MAX_GEQDSK_CELLS) fail('GEQDSK grid', 'exceeds the 1,000,000-cell browser limit');
  const tokens = parseGeqdskTokens(lines.slice(1).join('\n'));
  let cursor = 0;
  const takeOne = (path: string) => {
    if (cursor >= tokens.length) fail(path, 'unexpected end of file');
    const result = tokens[cursor];
    cursor += 1;
    return result;
  };
  const takeArray = (count: number, path: string) => {
    if (cursor + count > tokens.length) fail(path, `expected ${count} values, file ended early`);
    const result = Float64Array.from(tokens.slice(cursor, cursor + count));
    cursor += count;
    return result;
  };

  const rdimM = takeOne('GEQDSK rdim');
  const zdimM = takeOne('GEQDSK zdim');
  const rcentrM = takeOne('GEQDSK rcentr');
  const rleftM = takeOne('GEQDSK rleft');
  const zmidM = takeOne('GEQDSK zmid');
  if (rdimM <= 0 || zdimM <= 0) fail('GEQDSK dimensions', 'rdim and zdim must be positive');
  const rmaxisM = takeOne('GEQDSK rmaxis');
  const zmaxisM = takeOne('GEQDSK zmaxis');
  const simag = takeOne('GEQDSK simag');
  const sibry = takeOne('GEQDSK sibry');
  const bcentrT = takeOne('GEQDSK bcentr');
  const currentA = takeOne('GEQDSK current');
  // Four duplicate/reserved scalars on line 4, then five on line 5.
  takeArray(4, 'GEQDSK line 4 reserved values');
  takeArray(5, 'GEQDSK line 5 values');
  const fpol = takeArray(nw, 'GEQDSK fpol');
  const pressure = takeArray(nw, 'GEQDSK pressure');
  const ffprim = takeArray(nw, 'GEQDSK ffprim');
  const pprime = takeArray(nw, 'GEQDSK pprime');
  const filePsi = takeArray(nw * nh, 'GEQDSK psirz');
  const qpsi = takeArray(nw, 'GEQDSK qpsi');
  const nbbbs = finiteInteger(takeOne('GEQDSK nbbbs'), 'GEQDSK nbbbs', 0, 1_000_000);
  const limitr = finiteInteger(takeOne('GEQDSK limitr'), 'GEQDSK limitr', 0, 1_000_000);
  if (nbbbs + limitr > 1_000_000) fail('GEQDSK boundary', 'too many boundary/limiter points');
  const boundaryPairs = takeArray(2 * nbbbs, 'GEQDSK boundary points');
  const limiterPairs = takeArray(2 * limitr, 'GEQDSK limiter points');

  const fluxSpan = sibry - simag;
  if (Math.abs(fluxSpan) <= 1e-12) fail('GEQDSK flux', 'sibry and simag must define a non-zero normalization span');
  const psirz = new Float64Array(nw * nh);
  const psiNorm = new Float64Array(nw * nh);
  for (let zIndex = 0; zIndex < nh; zIndex += 1) {
    for (let rIndex = 0; rIndex < nw; rIndex += 1) {
      const fileIndex = rIndex + zIndex * nw;
      const browserIndex = rIndex * nh + zIndex;
      const psi = filePsi[fileIndex];
      psirz[browserIndex] = psi;
      psiNorm[browserIndex] = (psi - simag) / fluxSpan;
    }
  }
  const splitPairs = (pairs: Float64Array) => {
    const first = new Float64Array(pairs.length / 2);
    const second = new Float64Array(pairs.length / 2);
    for (let index = 0; index < first.length; index += 1) {
      first[index] = pairs[2 * index];
      second[index] = pairs[2 * index + 1];
    }
    return [first, second] as const;
  };
  const [boundaryRM, boundaryZM] = splitPairs(boundaryPairs);
  const [limiterRM, limiterZM] = splitPairs(limiterPairs);
  return {
    caseName: header.slice(0, 48).trim(),
    nw,
    nh,
    rdimM,
    zdimM,
    rcentrM,
    rleftM,
    zmidM,
    rmaxisM,
    zmaxisM,
    simag,
    sibry,
    bcentrT,
    currentA,
    fpol,
    pressure,
    ffprim,
    pprime,
    psirz,
    qpsi,
    rM: geqdskLinspace(rleftM, rleftM + rdimM, nw),
    zM: geqdskLinspace(zmidM - zdimM / 2, zmidM + zdimM / 2, nh),
    psiNorm,
    boundaryRM,
    boundaryZM,
    limiterRM,
    limiterZM,
    trailingTokenCount: tokens.length - cursor,
  };
}

function pointOnSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const segmentX = x2 - x1;
  const segmentY = y2 - y1;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
  if (segmentLengthSquared <= 1e-20) {
    return (x - x1) ** 2 + (y - y1) ** 2 <= 1e-20;
  }
  const crossValue = (x - x1) * segmentY - (y - y1) * segmentX;
  if (Math.abs(crossValue) > 1e-10) return false;
  const projection = (x - x1) * segmentX + (y - y1) * segmentY;
  return projection >= -1e-10 && projection <= segmentLengthSquared + 1e-10;
}

function pointInBoundary(r: number, z: number, boundaryR: Float64Array, boundaryZ: Float64Array): boolean {
  if (boundaryR.length < 3) return true;
  let inside = false;
  for (let current = 0, previous = boundaryR.length - 1; current < boundaryR.length; previous = current, current += 1) {
    const r1 = boundaryR[previous];
    const z1 = boundaryZ[previous];
    const r2 = boundaryR[current];
    const z2 = boundaryZ[current];
    if (pointOnSegment(r, z, r1, z1, r2, z2)) return true;
    const crosses = (z1 > z) !== (z2 > z)
      && r < (r2 - r1) * (z - z1) / (z2 - z1) + r1;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** rho = sqrt(clamp(psi_norm, 0, 1)), matching the source mathematical model. */
export function computeDiagView2Rho(psiNorm: ArrayLike<number>): Float64Array {
  if (psiNorm.length > MAX_GEQDSK_CELLS) fail('psiNorm', 'exceeds the browser cell limit');
  const rho = new Float64Array(psiNorm.length);
  for (let index = 0; index < psiNorm.length; index += 1) {
    const psi = finiteNumber(psiNorm[index], `psiNorm[${index}]`);
    rho[index] = Math.sqrt(Math.min(1, Math.max(0, psi)));
  }
  return rho;
}

export function buildDiagView2MathProfile(
  gfile: DiagView2GeqdskData,
  model: DiagView2MathProfileModel = 'linear',
  coreValue = 1,
  edgeValue = 0,
): DiagView2MathProfile {
  if (!['linear', 'parabolic', 'square-parabolic', 'flat-center'].includes(model)) {
    fail('profile.model', 'unsupported mathematical profile');
  }
  const core = finiteNumber(coreValue, 'profile.coreValue', -1e100, 1e100);
  const edge = finiteNumber(edgeValue, 'profile.edgeValue', -1e100, 1e100);
  if (gfile.psiNorm.length !== gfile.nw * gfile.nh) fail('gfile.psiNorm', 'grid size mismatch');
  const rho = computeDiagView2Rho(gfile.psiNorm);
  const values = new Float64Array(rho.length);
  for (let rIndex = 0; rIndex < gfile.nw; rIndex += 1) {
    for (let zIndex = 0; zIndex < gfile.nh; zIndex += 1) {
      const index = rIndex * gfile.nh + zIndex;
      const psi = gfile.psiNorm[index];
      const insideLcfs = psi <= 1
        && pointInBoundary(gfile.rM[rIndex], gfile.zM[zIndex], gfile.boundaryRM, gfile.boundaryZM);
      if (!insideLcfs) {
        values[index] = 0;
        continue;
      }
      const radius = rho[index];
      let shape: number;
      if (model === 'linear') shape = 1 - radius;
      else if (model === 'parabolic') shape = 1 - radius ** 2;
      else if (model === 'square-parabolic') shape = (1 - radius ** 2) ** 2;
      else shape = (1 - radius ** 4) ** 2;
      const value = edge + (core - edge) * shape;
      if (!Number.isFinite(value)) fail(`profile.values[${index}]`, 'profile formula produced a non-finite value');
      values[index] = value;
    }
  }
  return {
    model,
    coreValue: core,
    edgeValue: edge,
    unit: 'relative-emissivity',
    authority: 'virtual-software',
    values,
    rho,
  };
}

function virtualGridBounds(gfile: DiagView2GeqdskData) {
  const dr = gfile.rM.length > 1 ? gfile.rM[1] - gfile.rM[0] : 0;
  const dz = gfile.zM.length > 1 ? gfile.zM[1] - gfile.zM[0] : 0;
  if (!(dr > 0) || !(dz > 0)) fail('GEQDSK grid', 'R and Z coordinates must be strictly increasing');
  return {
    rIn: gfile.rM[0] - dr / 2,
    rOut: gfile.rM[gfile.rM.length - 1] + dr / 2,
    zMin: gfile.zM[0] - dz / 2,
    zMax: gfile.zM[gfile.zM.length - 1] + dz / 2,
  };
}

function centerPostBlockDistance(
  origin: DiagView2Vec3,
  direction: DiagView2Vec3,
  rIn: number,
): number {
  if (rIn < 0) return Infinity;
  const [x0, y0] = origin;
  const [ux, uy] = direction;
  const a = ux ** 2 + uy ** 2;
  const b = 2 * (x0 * ux + y0 * uy);
  const c = x0 ** 2 + y0 ** 2 - rIn ** 2;
  if (a < 1e-9) return c <= 0 ? 0 : Infinity;
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  if (first > RAY_EPSILON_M) return first;
  if (second > RAY_EPSILON_M) return second;
  return Infinity;
}

function checkForwardAbort(control?: DiagView2VirtualForwardControl) {
  if (control?.shouldAbort?.()) throw new DiagView2AbortError();
}

export function computeDiagView2VirtualWeights(
  inputDesign: DiagView2DiagnosticDesign,
  gfile: DiagView2GeqdskData,
  options: DiagView2VirtualForwardOptions = {},
): DiagView2VirtualWeightResult {
  const design = validatedDesign(inputDesign);
  if (design.diagnosticType === 'LASER') {
    fail('forward design', 'source forward projection supports CAMERA and ARRAY only');
  }
  if (gfile.nw * gfile.nh !== gfile.psiNorm.length) fail('GEQDSK grid', 'psiNorm size mismatch');
  const stepM = optionalNumber(options.stepM, 'forward.stepM', 0.005, 0.001, 0.05);
  const maxLengthM = optionalNumber(options.maxLengthM, 'forward.maxLengthM', 10, 0.1, 100);
  const maxTotalSamples = finiteInteger(
    options.maxTotalSamples ?? 2_000_000,
    'forward.maxTotalSamples',
    1,
    20_000_000,
  );
  const rays = buildDiagView2TraceRays(design);
  const conservativeSamples = rays.length * Math.floor(maxLengthM / stepM);
  if (conservativeSamples > maxTotalSamples) {
    fail(
      'forward sample budget',
      `${conservativeSamples} conservative samples exceed maxTotalSamples=${maxTotalSamples}`,
    );
  }
  const grid = virtualGridBounds(gfile);
  const weights: DiagView2SparseWeightRow[] = [];
  const control = options.control;
  checkForwardAbort(control);
  control?.onProgress?.({ phase: 'ray-marching', completedRays: 0, totalRays: rays.length, fraction: 0 });
  rays.forEach((ray, rayIndex) => {
    checkForwardAbort(control);
    const blockDistance = centerPostBlockDistance(ray.originM, ray.direction, grid.rIn);
    const endM = Math.min(maxLengthM, blockDistance);
    const stepCount = Math.floor(endM / stepM);
    const counts = new Map<number, number>();
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      if ((stepIndex & 255) === 0) checkForwardAbort(control);
      const distanceM = stepCount === 1
        ? stepM / 2
        : stepM / 2 + (endM - stepM) * stepIndex / (stepCount - 1);
      const point = add(ray.originM, scale(ray.direction, distanceM));
      const radius = Math.hypot(point[0], point[1]);
      const z = point[2];
      if (radius < grid.rIn || radius >= grid.rOut || z < grid.zMin || z >= grid.zMax) continue;
      const rIndex = Math.min(gfile.nw - 1, Math.max(
        0,
        Math.trunc((radius - grid.rIn) / (grid.rOut - grid.rIn) * gfile.nw),
      ));
      const zIndex = Math.min(gfile.nh - 1, Math.max(
        0,
        Math.trunc((z - grid.zMin) / (grid.zMax - grid.zMin) * gfile.nh),
      ));
      const cellIndex = rIndex * gfile.nh + zIndex;
      counts.set(cellIndex, (counts.get(cellIndex) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((left, right) => left[0] - right[0]);
    const cellIndices = new Uint32Array(entries.length);
    const pathLengthsM = new Float32Array(entries.length);
    let sampledLengthM = 0;
    entries.forEach(([cellIndex, count], entryIndex) => {
      cellIndices[entryIndex] = cellIndex;
      pathLengthsM[entryIndex] = count * stepM;
      sampledLengthM += count * stepM;
    });
    weights.push({
      rayId: ray.rayId,
      cellIndices,
      pathLengthsM,
      sampledLengthM,
      centerPostBlockDistanceM: Number.isFinite(blockDistance) ? blockDistance : null,
    });
    const completedRays = rayIndex + 1;
    control?.onProgress?.({
      phase: 'ray-marching',
      completedRays,
      totalRays: rays.length,
      fraction: completedRays / rays.length,
    });
  });
  return {
    authority: 'virtual-software',
    model: 'axisymmetric-rz-ray-marching',
    stepM,
    maxLengthM,
    rays,
    weights,
  };
}

export function runDiagView2VirtualForwardModel(
  inputDesign: DiagView2DiagnosticDesign,
  gfile: DiagView2GeqdskData,
  profile: DiagView2MathProfile,
  options: DiagView2VirtualForwardOptions = {},
): DiagView2VirtualForwardResult {
  if (profile.values.length !== gfile.nw * gfile.nh) fail('profile.values', 'grid size mismatch');
  const geometry = computeDiagView2VirtualWeights(inputDesign, gfile, options);
  const signals = new Float64Array(geometry.weights.length);
  geometry.weights.forEach((row, rayIndex) => {
    let signal = 0;
    for (let entryIndex = 0; entryIndex < row.cellIndices.length; entryIndex += 1) {
      const value = finiteNumber(
        profile.values[row.cellIndices[entryIndex]],
        `profile.values[${row.cellIndices[entryIndex]}]`,
      );
      signal += value * row.pathLengthsM[entryIndex];
    }
    if (!Number.isFinite(signal)) fail(`signals[${rayIndex}]`, 'projection produced a non-finite signal');
    signals[rayIndex] = signal;
  });
  let normalizationReferenceSignal = 0;
  signals.forEach((signal) => {
    if (signal > normalizationReferenceSignal) normalizationReferenceSignal = signal;
  });
  const normalizedSignals = new Float64Array(signals.length);
  if (normalizationReferenceSignal > 0) {
    signals.forEach((signal, index) => {
      normalizedSignals[index] = signal / normalizationReferenceSignal;
    });
  }
  return {
    ...geometry,
    profile,
    signals,
    normalizedSignals,
    normalizationReferenceSignal,
    signalUnit: profile.unit === 'relative-line-weight' ? 'relative-line-weight·m' : 'relative-emissivity·m',
    warnings: [
      'Software-only axisymmetric R-Z projection; not an experimental measurement.',
      'Center-post cylinder only; CAD occlusion, optics, calibration, noise and spectral response are not modeled.',
      ...(profile.unit === 'relative-line-weight' ? ['Spectral values are manual relative PEC × ne × ion-fraction weights; not absolute emissivity.'] : []),
      'CHERAB/ADAS is not implemented in this browser kernel.',
    ],
  };
}

export function createDiagView2RayResult(
  inputRay: DiagView2DiagnosticRay,
  inputHit?: DiagView2RayHit | null,
): DiagView2RayResult {
  const ray: DiagView2DiagnosticRay = {
    ...inputRay,
    rayId: nonEmptyString(inputRay.rayId, 'ray.rayId'),
    diagnosticType: typeFromUnknown(inputRay.diagnosticType, 'ray.diagnosticType'),
    originM: vec3(inputRay.originM, 'ray.originM', -MAX_POSITION_M, MAX_POSITION_M),
    direction: normalize(vec3(inputRay.direction, 'ray.direction'), 'ray.direction'),
    defaultLengthM: finiteNumber(inputRay.defaultLengthM, 'ray.defaultLengthM', RAY_EPSILON_M, MAX_RAY_LENGTH_M),
    defaultEndpointM: vec3(inputRay.defaultEndpointM, 'ray.defaultEndpointM', -1_000, 1_000),
    channelIndex: inputRay.channelIndex === null
      ? null
      : finiteInteger(inputRay.channelIndex, 'ray.channelIndex', 0, 100_000),
    hAngleDeg: inputRay.hAngleDeg === null
      ? null
      : finiteNumber(inputRay.hAngleDeg, 'ray.hAngleDeg', -180, 180),
    vAngleDeg: inputRay.vAngleDeg === null
      ? null
      : finiteNumber(inputRay.vAngleDeg, 'ray.vAngleDeg', -90, 90),
  };
  const defaultEndpointM = add(ray.originM, scale(ray.direction, ray.defaultLengthM));
  if (!inputHit) {
    return {
      ...ray,
      defaultEndpointM,
      effectiveEndpointM: defaultEndpointM,
      hasIntersection: false,
      hitModel: null,
      hitDistanceM: null,
      hitPointM: null,
      triangleIndex: null,
      hitFaceNormal: null,
      incidenceAngleDeg: null,
    };
  }
  const hitPointM = vec3(inputHit.hitPointM, 'hit.hitPointM', -1_000, 1_000);
  const projectedDistanceM = dot(subtract(hitPointM, ray.originM), ray.direction);
  const hitDistanceM = inputHit.hitDistanceM === undefined
    ? projectedDistanceM
    : finiteNumber(inputHit.hitDistanceM, 'hit.hitDistanceM', RAY_EPSILON_M, ray.defaultLengthM + 1e-9);
  if (projectedDistanceM <= RAY_EPSILON_M || projectedDistanceM > ray.defaultLengthM + 1e-9) {
    fail('hit.hitPointM', 'must be in front of the origin and within the ray length');
  }
  if (Math.abs(projectedDistanceM - hitDistanceM) > Math.max(1e-6, hitDistanceM * 1e-6)) {
    fail('hit.hitDistanceM', 'does not match the projected hit point');
  }
  const hitFaceNormal = normalize(vec3(inputHit.hitFaceNormal, 'hit.hitFaceNormal'), 'hit.hitFaceNormal');
  const computedIncidence = radiansToDegrees(Math.acos(Math.min(1, Math.max(
    0,
    Math.abs(dot(scale(ray.direction, -1), hitFaceNormal)),
  ))));
  const incidenceAngleDeg = inputHit.incidenceAngleDeg === undefined
    ? computedIncidence
    : finiteNumber(inputHit.incidenceAngleDeg, 'hit.incidenceAngleDeg', 0, 90);
  return {
    ...ray,
    defaultEndpointM,
    effectiveEndpointM: hitPointM,
    hasIntersection: true,
    hitModel: nonEmptyString(inputHit.hitModel, 'hit.hitModel'),
    hitDistanceM,
    hitPointM,
    triangleIndex: finiteInteger(inputHit.triangleIndex, 'hit.triangleIndex', 0, Number.MAX_SAFE_INTEGER),
    hitFaceNormal,
    incidenceAngleDeg,
  };
}

function parseLegacyV2Diagnostic(value: unknown, index: number): DiagView2DiagnosticDesign {
  const path = `diagnostics[${index}]`;
  const record = asRecord(value, path);
  const params = asRecord(record.params, `${path}.params`);
  const diagnosticType = typeFromUnknown(record.diagnostic_type, `${path}.diagnostic_type`);
  const id = nonEmptyString(record.name_suffix ?? `diagnostic-${index + 1}`, `${path}.name_suffix`);
  const base = createDefaultDiagView2Design(diagnosticType, id);
  const positionM = vec3(params.position, `${path}.params.position`, -MAX_POSITION_M, MAX_POSITION_M);
  const normal = normalize(vec3(params.normal, `${path}.params.normal`), `${path}.params.normal`);
  const rotationDeg = params.rotation === undefined
    ? [0, 0, 0] as const
    : vec3(params.rotation, `${path}.params.rotation`, -180, 180);
  const common = {
    ...base,
    placement: { mode: 'explicit' as const, positionM, normal },
    rotationDeg,
  };
  if (diagnosticType === 'CAMERA') {
    return {
      ...common,
      camera: {
        hStartDeg: tangentAngle(params.h_start, `${path}.params.h_start`, -180, 180),
        hEndDeg: tangentAngle(params.h_end, `${path}.params.h_end`, -180, 180),
        vStartDeg: tangentAngle(params.v_start, `${path}.params.v_start`, -90, 90),
        vEndDeg: tangentAngle(params.v_end, `${path}.params.v_end`, -90, 90),
        lengthM: finiteNumber(params.length, `${path}.params.length`, 0.1, MAX_RAY_LENGTH_M),
      },
    };
  }
  if (diagnosticType === 'ARRAY') {
    return {
      ...common,
      array: {
        vStartDeg: tangentAngle(params.array_v_start, `${path}.params.array_v_start`, -90, 90),
        vEndDeg: tangentAngle(params.array_v_end, `${path}.params.array_v_end`, -90, 90),
        rayCount: finiteInteger(params.array_ray_count, `${path}.params.array_ray_count`, 2, 201),
        lengthM: finiteNumber(params.length, `${path}.params.length`, 0.1, MAX_RAY_LENGTH_M),
      },
    };
  }
  let customPathPointsMm: readonly DiagView2Vec3[] | null = null;
  if (params.laser_points !== undefined) {
    if (!Array.isArray(params.laser_points)) fail(`${path}.params.laser_points`, 'expected an array');
    // v2 geometry storage writes laser_points in metres; the v3 browser design
    // makes its absolute-mm nature explicit.
    customPathPointsMm = params.laser_points.map((point, pointIndex) => (
      scale(vec3(point, `${path}.params.laser_points[${pointIndex}]`, -MAX_POSITION_M, MAX_POSITION_M), 1_000)
    ));
  }
  return {
    ...common,
    laser: {
      diameterMm: finiteNumber(params.laser_diameter_mm, `${path}.params.laser_diameter_mm`, 0, 5_000),
      lengthM: finiteNumber(params.laser_length, `${path}.params.laser_length`, 0.1, MAX_RAY_LENGTH_M),
      customPathPointsMm,
    },
  };
}

export function parseDiagView2DesignFile(input: string | unknown): DiagView2DesignStore {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      fail('design file', message);
    }
  }
  const record = asRecord(raw, 'design file');
  const version = finiteInteger(record.version, 'design file.version', 2, 3);
  if (!Array.isArray(record.diagnostics) || record.diagnostics.length === 0) {
    fail('design file.diagnostics', 'expected at least one diagnostic');
  }
  if (record.diagnostics.length > 1_000) fail('design file.diagnostics', 'too many diagnostics');
  const diagnostics = version === 2
    ? record.diagnostics.map(parseLegacyV2Diagnostic)
    : record.diagnostics.map((value, index) => parseDesign(value, `diagnostics[${index}]`));
  const ids = new Set<string>();
  diagnostics.forEach((diagnostic, index) => {
    if (ids.has(diagnostic.id)) fail(`diagnostics[${index}].id`, 'duplicate id');
    ids.add(diagnostic.id);
  });
  if (version === 3 && record.schema !== 'fusiondigital.diagview2-design') {
    fail('design file.schema', 'unsupported v3 schema');
  }
  const sourceRecord = version === 3
    ? asRecord(record.source, 'design file.source')
    : null;
  if (sourceRecord) {
    if (sourceRecord.branch !== DIAGVIEW2_SOURCE.branch) {
      fail('design file.source.branch', 'unsupported DiagView2 source branch');
    }
    if (sourceRecord.commit !== DIAGVIEW2_SOURCE.commit) {
      fail('design file.source.commit', 'unreviewed DiagView2 source revision');
    }
    if (sourceRecord.compatibility !== 'browser-reconstruction') {
      fail('design file.source.compatibility', 'unsupported compatibility contract');
    }
  }
  return {
    schema: 'fusiondigital.diagview2-design',
    version: 3,
    source: {
      ...DIAGVIEW2_SOURCE,
      compatibility: 'browser-reconstruction',
    },
    deviceId: version === 3 && record.deviceId !== undefined
      ? nonEmptyString(record.deviceId, 'design file.deviceId')
      : 'ehl-2-preliminary',
    diagnostics,
    ...(version === 2 ? { migratedFromVersion: 2 as const } : {}),
  };
}

export function serializeDiagView2DesignFile(
  input: DiagView2DiagnosticDesign | readonly DiagView2DiagnosticDesign[] | DiagView2DesignStore,
  options: { deviceId?: string; space?: number } = {},
): string {
  let rawDiagnostics: readonly DiagView2DiagnosticDesign[];
  let sourceDeviceId: string | undefined;
  if (Array.isArray(input)) {
    rawDiagnostics = input;
  } else if ('diagnostics' in input) {
    rawDiagnostics = input.diagnostics;
    sourceDeviceId = input.deviceId;
  } else {
    rawDiagnostics = [input as DiagView2DiagnosticDesign];
  }
  if (rawDiagnostics.length === 0) fail('diagnostics', 'expected at least one diagnostic');
  const diagnostics = rawDiagnostics.map((design, index) => parseDesign(design, `diagnostics[${index}]`));
  const ids = new Set<string>();
  diagnostics.forEach((diagnostic, index) => {
    if (ids.has(diagnostic.id)) fail(`diagnostics[${index}].id`, 'duplicate id');
    ids.add(diagnostic.id);
  });
  const store: DiagView2DesignStore = {
    schema: 'fusiondigital.diagview2-design',
    version: 3,
    source: {
      ...DIAGVIEW2_SOURCE,
      compatibility: 'browser-reconstruction',
    },
    deviceId: nonEmptyString(options.deviceId ?? sourceDeviceId ?? 'ehl-2-preliminary', 'deviceId'),
    diagnostics,
  };
  return JSON.stringify(store, null, finiteInteger(options.space ?? 2, 'space', 0, 10));
}

function resultFromUnknown(value: DiagView2RayResult, index: number): DiagView2RayResult {
  const path = `rayResults[${index}]`;
  const baseRay: DiagView2DiagnosticRay = {
    rayId: nonEmptyString(value.rayId, `${path}.rayId`),
    diagnosticType: typeFromUnknown(value.diagnosticType, `${path}.diagnosticType`),
    role: value.role,
    channelIndex: value.channelIndex,
    originM: vec3(value.originM, `${path}.originM`, -MAX_POSITION_M, MAX_POSITION_M),
    direction: normalize(vec3(value.direction, `${path}.direction`), `${path}.direction`),
    defaultLengthM: finiteNumber(value.defaultLengthM, `${path}.defaultLengthM`, RAY_EPSILON_M, MAX_RAY_LENGTH_M),
    defaultEndpointM: vec3(value.defaultEndpointM, `${path}.defaultEndpointM`, -1_000, 1_000),
    hAngleDeg: value.hAngleDeg,
    vAngleDeg: value.vAngleDeg,
  };
  if (!value.hasIntersection) return createDiagView2RayResult(baseRay);
  if (
    value.hitModel === null
    || value.hitPointM === null
    || value.hitDistanceM === null
    || value.triangleIndex === null
    || value.hitFaceNormal === null
  ) {
    fail(path, 'intersection result is incomplete');
  }
  return createDiagView2RayResult(baseRay, {
    hitModel: value.hitModel,
    hitPointM: value.hitPointM,
    hitDistanceM: value.hitDistanceM,
    triangleIndex: value.triangleIndex,
    hitFaceNormal: value.hitFaceNormal,
    ...(value.incidenceAngleDeg === null ? {} : { incidenceAngleDeg: value.incidenceAngleDeg }),
  });
}

function slope(numerator: number, denominator: number): number | null {
  if (Math.abs(denominator) <= 1e-10) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

const DIAGVIEW2_SOURCE_DEFAULT_MAJOR_RADIUS_M = 0.950;

function hitAnglesFromPoint(
  hitPointM: DiagView2Vec3 | null,
  poloidalReferenceMajorRadiusM: number,
): readonly [number | null, number | null] {
  if (!hitPointM) return [null, null];
  const [x, y, z] = hitPointM;
  const toroidal = Math.atan2(y, x) * 180 / Math.PI;
  const poloidal = Math.atan2(z, Math.hypot(x, y) - poloidalReferenceMajorRadiusM) * 180 / Math.PI;
  return [Object.is(toroidal, -0) ? 0 : toroidal, Object.is(poloidal, -0) ? 0 : poloidal];
}

function reportRay(
  result: DiagView2RayResult,
  poloidalReferenceMajorRadiusM: number,
): DiagView2ReportRay {
  const originMm = scale(result.originM, 1_000);
  const defaultEndpointMm = scale(result.defaultEndpointM, 1_000);
  const effectiveEndpointMm = scale(result.effectiveEndpointM, 1_000);
  const hitPointMm = result.hitPointM ? scale(result.hitPointM, 1_000) : null;
  const [hitToroidalAngleDeg, hitPoloidalAngleDeg] = hitAnglesFromPoint(
    result.hitPointM,
    poloidalReferenceMajorRadiusM,
  );
  const [dx, dy, dz] = result.direction;
  return {
    ...result,
    originMm,
    defaultEndpointMm,
    effectiveEndpointMm,
    hitPointMm,
    hitToroidalAngleDeg,
    hitPoloidalAngleDeg,
    slopeXY: slope(dy, dx),
    slopeXZ: slope(dz, dx),
    slopeYZ: slope(dz, dy),
    parametricForm: {
      x: `x(t) = ${originMm[0].toFixed(4)} + t * ${dx.toFixed(6)}`,
      y: `y(t) = ${originMm[1].toFixed(4)} + t * ${dy.toFixed(6)}`,
      z: `z(t) = ${originMm[2].toFixed(4)} + t * ${dz.toFixed(6)}`,
    },
  };
}

function reportTimestamp(input?: string | Date): string {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input ?? Date.now());
  if (!Number.isFinite(date.getTime())) fail('report.createdAt', 'invalid date');
  return date.toISOString();
}

export function buildDiagView2Report(
  inputDesign: DiagView2DiagnosticDesign,
  inputResults: readonly DiagView2RayResult[],
  options: DiagView2ReportOptions = {},
): DiagView2Report {
  const design = validatedDesign(inputDesign);
  const laserGeometryOnly = design.diagnosticType === 'LASER';
  if (!laserGeometryOnly && inputResults.length === 0) fail('rayResults', 'completed CAD analysis results are required');
  if (laserGeometryOnly && inputResults.length > 0) fail('rayResults', 'LASER geometry reports do not accept CAD intersection results');
  const results = laserGeometryOnly
    ? buildDiagView2PreviewRays(design).map((ray) => createDiagView2RayResult(ray))
    : inputResults.map(resultFromUnknown);
  if (results.some((result) => result.diagnosticType !== design.diagnosticType)) {
    fail('rayResults', 'diagnostic type does not match the design');
  }
  const creationTime = reportTimestamp(options.createdAt);
  const compact = creationTime.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const poloidalReferenceMajorRadiusM = finiteNumber(
    options.poloidalReferenceMajorRadiusM ?? DIAGVIEW2_SOURCE_DEFAULT_MAJOR_RADIUS_M,
    'report.poloidalReferenceMajorRadiusM',
    0,
    100,
  );
  const rays = results.map((result) => reportRay(result, poloidalReferenceMajorRadiusM));
  return {
    meta: {
      reportId: `${design.diagnosticType.slice(0, 3)}_${compact}`,
      deviceName: nonEmptyString(options.deviceName ?? 'EHL-2', 'report.deviceName'),
      diagnosticType: lowercaseType(design.diagnosticType),
      creationTime,
      schemaVersion: 3,
      coordinateSystem: 'Right-handed Cartesian',
      positionUnit: 'mm',
      angleUnit: 'degrees',
      authority: 'virtual-browser-output',
      intersectionMode: laserGeometryOnly ? 'not-applicable' : options.intersectionMode ?? 'unspecified',
      hitAngleDefinition: 'toroidal=atan2(Y,X); poloidal=atan2(Z,sqrt(X^2+Y^2)-R_major)',
      poloidalReferenceMajorRadiusM,
    },
    design,
    pose: resolveDiagView2Pose(design),
    summary: {
      rayCount: rays.length,
      hitCount: rays.filter((ray) => ray.hasIntersection).length,
      intersectionStatus: laserGeometryOnly ? 'not-applicable' : 'completed',
      virtualOutput: true,
    },
    rays,
    intersections: rays.filter((ray) => ray.hasIntersection),
  };
}

export function reportToJson(report: DiagView2Report, space = 2): string {
  finiteInteger(space, 'space', 0, 10);
  return JSON.stringify(report, null, space);
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = typeof value === 'number'
    ? (Number.isFinite(value) ? String(value) : fail('CSV value', 'non-finite number'))
    : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function designSummaryRows(
  design: DiagView2DiagnosticDesign,
  pose: DiagView2ResolvedPose,
): readonly (readonly [string, string | number])[] {
  const rows: (readonly [string, string | number])[] = [
    ['Design_ID', design.id],
    ['Diagnostic_Name', design.nameSuffix],
    ['Placement_Mode', design.placement.mode],
    ['Optical_Centre_m', pose.positionM.join(' / ')],
    ['Normal', pose.normal.join(' / ')],
    ['Local_Offset_dR_dY_dZ_mm', design.localOffsetMm.join(' / ')],
    ['World_Offset_dX_dY_dZ_mm', design.worldOffsetMm.join(' / ')],
    ['Rotation_Pitch_Yaw_Roll_deg', design.rotationDeg.join(' / ')],
  ];
  if (design.placement.mode === 'flange') {
    const flange = design.placement.flange;
    rows.push(
      ['Flange_Kind', flange.kind],
      ['Flange_Section', flange.section],
      ['Flange_Azimuth_deg', flange.angleDeg],
      ['Flange_Theta_deg', flange.thetaDeg],
      ...(flange.kind === 'side_flange'
        ? ([['Flange_R_mm', flange.radiusMm], ['Flange_Z_mm', flange.zMm]] as const)
        : ([['Flange_X_mm', flange.xMm], ['Flange_Y_mm', flange.yMm], ['Flange_Z_mm', flange.zMm]] as const)),
    );
  }
  if (design.camera) rows.push(
    ['Camera_H_Start_deg', design.camera.hStartDeg], ['Camera_H_End_deg', design.camera.hEndDeg],
    ['Camera_V_Start_deg', design.camera.vStartDeg], ['Camera_V_End_deg', design.camera.vEndDeg],
    ['Camera_Length_m', design.camera.lengthM],
  );
  if (design.array) rows.push(
    ['Array_V_Start_deg', design.array.vStartDeg], ['Array_V_End_deg', design.array.vEndDeg],
    ['Array_Ray_Count', design.array.rayCount], ['Array_Length_m', design.array.lengthM],
  );
  if (design.laser) {
    const laserRays = buildDiagView2PreviewRays(design);
    rows.push(
      ['Laser_Diameter_mm', design.laser.diameterMm],
      ['Laser_Default_Length_m', design.laser.lengthM],
      ['Laser_Path_Point_Count', design.laser.customPathPointsMm?.length ?? 0],
      ['Laser_Path_Segment_Count', laserRays.length],
      ['Laser_Total_Path_Length_m', laserRays.reduce((sum, ray) => sum + ray.defaultLengthM, 0)],
    );
  }
  if (design.display) rows.push(
    ['Display_Color', design.display.colorHex],
    ['Display_Opacity', design.display.opacity],
    ['Display_Visible', String(design.display.visible)],
  );
  return rows;
}

export function reportToCsv(report: DiagView2Report): string {
  const rows: (string | number | null)[][] = [
    ['# Design Report:', report.meta.reportId],
    ['# Device:', report.meta.deviceName],
    ['# Type:', report.meta.diagnosticType],
    ['# Created:', report.meta.creationTime],
    ['# Authority:', report.meta.authority],
    ['# Intersection_Mode:', report.meta.intersectionMode],
    ['# Intersection_Status:', report.summary.intersectionStatus],
    ['# Hit_Angle_Definition:', report.meta.hitAngleDefinition],
    ['# Poloidal_Reference_R_Major_m:', report.meta.poloidalReferenceMajorRadiusM],
    ...designSummaryRows(report.design, report.pose).map(([label, value]) => [`# ${label}:`, value] as [string, string | number]),
    [],
    [
      'Ray_ID', 'Role', 'Channel',
      'Origin_X_mm', 'Origin_Y_mm', 'Origin_Z_mm',
      'Direction_X', 'Direction_Y', 'Direction_Z',
      'Default_Length_mm', 'Has_Intersection', 'Hit_Component', 'Triangle_Index',
      'Hit_X_mm', 'Hit_Y_mm', 'Hit_Z_mm', 'Hit_Distance_mm',
      'Hit_Toroidal_Angle_deg', 'Hit_Poloidal_Angle_deg',
      'Normal_X', 'Normal_Y', 'Normal_Z', 'Incidence_Angle_deg',
      'H_Angle_deg', 'V_Angle_deg', 'Slope_XY', 'Slope_XZ', 'Slope_YZ',
    ],
  ];
  report.rays.forEach((ray) => rows.push([
    ray.rayId,
    ray.role,
    ray.channelIndex,
    ...ray.originMm,
    ...ray.direction,
    ray.defaultLengthM * 1_000,
    ray.hasIntersection ? 'true' : 'false',
    ray.hitModel,
    ray.triangleIndex,
    ...(ray.hitPointMm ?? [null, null, null]),
    ray.hitDistanceM === null ? null : ray.hitDistanceM * 1_000,
    ray.hitToroidalAngleDeg,
    ray.hitPoloidalAngleDeg,
    ...(ray.hitFaceNormal ?? [null, null, null]),
    ray.incidenceAngleDeg,
    ray.hAngleDeg,
    ray.vAngleDeg,
    ray.slopeXY,
    ray.slopeXZ,
    ray.slopeYZ,
  ]));
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function htmlEscape(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatReportNumber(value: number | null, digits = 4): string {
  return value === null ? '—' : htmlEscape(value.toFixed(digits));
}

export function reportToHtml(report: DiagView2Report): string {
  const laserSummary = report.design.laser
    ? `<div><dt>Laser diameter (mm)</dt><dd>${formatReportNumber(report.design.laser.diameterMm, 3)}</dd></div><div><dt>Path segments</dt><dd>${report.summary.rayCount}</dd></div>`
    : '';
  const rows = report.rays.map((ray) => `
          <tr>
            <td>${htmlEscape(ray.rayId)}</td>
            <td>${htmlEscape(ray.role)}</td>
            <td>${ray.channelIndex ?? '—'}</td>
            <td>${ray.originMm.map((value) => formatReportNumber(value)).join(', ')}</td>
            <td>${ray.direction.map((value) => formatReportNumber(value, 6)).join(', ')}</td>
            <td>${ray.hasIntersection ? htmlEscape(ray.hitModel) : '—'}</td>
            <td>${ray.triangleIndex ?? '—'}</td>
            <td>${ray.hitPointMm ? ray.hitPointMm.map((value) => formatReportNumber(value, 3)).join(', ') : '—'}</td>
            <td>${formatReportNumber(ray.hitDistanceM === null ? null : ray.hitDistanceM * 1_000, 3)}</td>
            <td>${formatReportNumber(ray.hitToroidalAngleDeg, 3)}</td>
            <td>${formatReportNumber(ray.hitPoloidalAngleDeg, 3)}</td>
            <td>${formatReportNumber(ray.incidenceAngleDeg, 3)}</td>
          </tr>`).join('');
  const designRows = designSummaryRows(report.design, report.pose)
    .map(([label, value]) => `<div><dt>${htmlEscape(label.replaceAll('_', ' '))}</dt><dd>${htmlEscape(value)}</dd></div>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(report.meta.reportId)} · DiagView2 diagnostic report</title>
  <style>
    :root{color-scheme:light;--ink:#17201c;--muted:#62716a;--line:#ccd8d1;--paper:#fff;--wash:#f3f7f4;--accent:#167b63}
    *{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
    main{max-width:1120px;margin:32px auto;padding:32px;background:var(--paper);border:1px solid var(--line)}
    h1{margin:0 0 8px;font-size:28px}h2{margin:28px 0 10px;font-size:18px;color:var(--accent)}
    .meta,.warning{color:var(--muted)}.warning{padding:12px;border-left:4px solid #d0783c;background:#fff8ef}
    dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}dl div{padding:10px;background:var(--wash)}dt{color:var(--muted)}dd{margin:2px 0 0;font-weight:650}
    .table{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:8px;border:1px solid var(--line);text-align:left;white-space:nowrap}th{background:var(--wash)}
    @media(max-width:700px){main{margin:0;padding:18px}dl{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>DiagView2 diagnostic design report</h1>
      <div class="meta">${htmlEscape(report.meta.deviceName)} · ${htmlEscape(report.meta.reportId)} · ${htmlEscape(report.meta.creationTime)} · intersection: ${htmlEscape(report.meta.intersectionMode)}</div>
    </header>
    <p class="warning"><strong>Virtual output.</strong> Geometry reproduces the reviewed browser kernel. Hits are caller-supplied CAD ray-cast results; this report is not an as-built survey, calibrated optical model or experimental measurement.</p>
    <h2>Summary</h2>
    <dl>
      <div><dt>Diagnostic</dt><dd>${htmlEscape(report.design.nameSuffix)}</dd></div>
      <div><dt>Type</dt><dd>${htmlEscape(report.meta.diagnosticType)}</dd></div>
      <div><dt>Intersection mode</dt><dd>${htmlEscape(report.meta.intersectionMode)}</dd></div>
      <div><dt>Intersection status</dt><dd>${htmlEscape(report.summary.intersectionStatus)}</dd></div>
      <div><dt>Hit angle definition</dt><dd>${htmlEscape(report.meta.hitAngleDefinition)}</dd></div>
      <div><dt>Poloidal reference R major (m)</dt><dd>${formatReportNumber(report.meta.poloidalReferenceMajorRadiusM, 6)}</dd></div>
      <div><dt>Rays / hits</dt><dd>${report.summary.rayCount} / ${report.summary.hitCount}</dd></div>
      <div><dt>Optical centre (m)</dt><dd>${report.pose.positionM.map((value) => formatReportNumber(value, 6)).join(', ')}</dd></div>
      <div><dt>Normal</dt><dd>${report.pose.normal.map((value) => formatReportNumber(value, 6)).join(', ')}</dd></div>
      <div><dt>Rotation [P,Y,R] (deg)</dt><dd>${report.pose.rotationDeg.map((value) => formatReportNumber(value, 3)).join(', ')}</dd></div>
      ${laserSummary}
      ${designRows}
    </dl>
    <h2>Ray geometry</h2>
    <div class="table"><table>
      <thead><tr><th>Ray</th><th>Role</th><th>Channel</th><th>Origin (mm)</th><th>Direction</th><th>Hit component</th><th>Triangle</th><th>Hit point XYZ (mm)</th><th>Hit distance (mm)</th><th>Toroidal hit angle (deg)</th><th>Poloidal hit angle (deg)</th><th>Incidence (deg)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </main>
</body>
</html>`;
}

/**
 * Produces the source application's multi-diagnostic HTML hand-off without
 * promoting an un-run or exploratory render-state trace to formal evidence.
 */
export function projectReportsToHtml(
  inputEntries: readonly DiagView2ProjectReportEntry[],
  options: DiagView2ProjectReportOptions = {},
): string {
  if (inputEntries.length === 0) fail('projectReport.entries', 'at least one diagnostic is required');
  const createdAt = reportTimestamp(options.createdAt);
  const deviceName = nonEmptyString(options.deviceName ?? 'EHL-2', 'projectReport.deviceName');
  const entries = inputEntries.map((entry, index) => {
    const design = validatedDesign(entry.design);
    if (!['completed', 'exploratory-completed', 'not-run', 'not-applicable'].includes(entry.analysisStatus)) {
      fail(`projectReport.entries[${index}].analysisStatus`, 'unsupported value');
    }
    if (entry.analysisStatus === 'completed' && (!entry.report || entry.report.meta.intersectionMode !== 'source-cad')) {
      fail(`projectReport.entries[${index}]`, 'completed entries require a source-CAD report');
    }
    if (entry.analysisStatus === 'not-applicable' && (!entry.report || design.diagnosticType !== 'LASER')) {
      fail(`projectReport.entries[${index}]`, 'not-applicable is reserved for LASER geometry reports');
    }
    if ((entry.analysisStatus === 'not-run' || entry.analysisStatus === 'exploratory-completed') && entry.report) {
      fail(`projectReport.entries[${index}]`, 'non-formal entries must not contain a formal report');
    }
    if (entry.report && entry.report.design.id !== design.id) {
      fail(`projectReport.entries[${index}].report`, 'report design does not match the section design');
    }
    return { ...entry, design };
  });
  const sections = entries.map((entry, index) => {
    const statusText = entry.analysisStatus === 'completed'
      ? 'Completed against all source CAD'
      : entry.analysisStatus === 'not-applicable'
        ? 'Geometry only; CAD intersection is not applicable'
        : entry.analysisStatus === 'exploratory-completed'
          ? 'Exploratory render-state result; excluded from formal evidence'
          : 'Not run';
    const report = entry.report;
    const pose = report?.pose ?? resolveDiagView2Pose(entry.design);
    const designRows = designSummaryRows(entry.design, pose)
      .map(([label, value]) => `<div><dt>${htmlEscape(label.replaceAll('_', ' '))}</dt><dd>${htmlEscape(value)}</dd></div>`)
      .join('');
    const rows = report?.rays.map((ray) => `<tr><td>${htmlEscape(ray.rayId)}</td><td>${htmlEscape(ray.role)}</td><td>${ray.channelIndex ?? '—'}</td><td>${ray.hasIntersection ? htmlEscape(ray.hitModel) : '—'}</td><td>${ray.hitPointMm ? ray.hitPointMm.map((value) => formatReportNumber(value, 3)).join(', ') : '—'}</td><td>${formatReportNumber(ray.hitDistanceM === null ? null : ray.hitDistanceM * 1_000, 3)}</td><td>${formatReportNumber(ray.hitToroidalAngleDeg, 3)}</td><td>${formatReportNumber(ray.hitPoloidalAngleDeg, 3)}</td><td>${formatReportNumber(ray.incidenceAngleDeg, 3)}</td></tr>`).join('') ?? '';
    return `<section>
      <h2>${String(index + 1).padStart(2, '0')} · ${htmlEscape(entry.design.nameSuffix)}</h2>
      <dl>
        <div><dt>Type</dt><dd>${htmlEscape(entry.design.diagnosticType)}</dd></div>
        <div><dt>Analysis status</dt><dd>${htmlEscape(entry.analysisStatus)}</dd></div>
        <div><dt>Evidence interpretation</dt><dd>${htmlEscape(statusText)}</dd></div>
        <div><dt>Rays / hits</dt><dd>${report ? `${report.summary.rayCount} / ${report.summary.hitCount}` : '—'}</dd></div>
        ${report ? `<div><dt>Hit angle definition</dt><dd>${htmlEscape(report.meta.hitAngleDefinition)}</dd></div><div><dt>Poloidal reference R major (m)</dt><dd>${formatReportNumber(report.meta.poloidalReferenceMajorRadiusM, 6)}</dd></div>` : ''}
        ${designRows}
      </dl>
      ${report ? `<div class="table"><table><thead><tr><th>Ray</th><th>Role</th><th>Channel</th><th>Hit component</th><th>Hit point XYZ (mm)</th><th>Hit distance (mm)</th><th>Toroidal hit angle (deg)</th><th>Poloidal hit angle (deg)</th><th>Incidence (deg)</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No formal ray result is attached to this section.</p>'}
    </section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(deviceName)} · DiagView2 project report</title>
  <style>
    :root{color-scheme:light;--ink:#17201c;--muted:#62716a;--line:#ccd8d1;--paper:#fff;--wash:#f3f7f4;--accent:#167b63}
    *{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
    main{max-width:1180px;margin:32px auto;padding:32px;background:var(--paper);border:1px solid var(--line)}h1{margin:0 0 8px;font-size:28px}h2{margin:32px 0 12px;color:var(--accent)}
    .meta,.warning,.empty{color:var(--muted)}.warning{padding:12px;border-left:4px solid #d0783c;background:#fff8ef}dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}dl div{padding:10px;background:var(--wash)}dt{color:var(--muted)}dd{margin:2px 0 0;font-weight:650}
    .table{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:8px;border:1px solid var(--line);text-align:left;white-space:nowrap}th{background:var(--wash)}@media(max-width:700px){main{margin:0;padding:18px}dl{grid-template-columns:1fr}}
  </style>
</head>
<body><main><header><h1>DiagView2 multi-diagnostic project report</h1><div class="meta">${htmlEscape(deviceName)} · ${htmlEscape(createdAt)} · ${entries.length} diagnostics</div></header>
<p class="warning"><strong>Virtual browser output.</strong> Only sections marked “completed” contain formal source-CAD first-hit results. Exploratory render-state results and un-run analyses are deliberately excluded; LASER sections are geometry-only.</p>
${sections}</main></body></html>`;
}
