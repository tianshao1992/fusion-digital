export const EXL50U_SENSOR_POINT_DATASET_URL =
  '/models/exl50u-sensor-points-v1/sensor-points.json';
export const EXL50U_SENSOR_POINT_MANIFEST_URL =
  '/models/exl50u-sensor-points-v1/manifest.json';
export const EXL50U_SENSOR_POINT_SCHEMA_VERSION =
  'fusiondigital.exl50u.sensor-points.v1';
export const EXL50U_SENSOR_ELEVATION_DATUM_MM = 4_805;
export const EXL50U_SENSOR_SOURCE_SHA256 =
  'DDF9CAC621BF7DCF26F70A879F65381B9D0944AD02CDB460E7F1660F5B563789';

export type Exl50uSensorFamily = 'LD' | 'PF' | 'TF' | 'TF_V' | 'SMOKE';
export type Exl50uSensorTuple = Readonly<{
  hMm: number;
  rMm: number;
  phiDeg: number;
}>;
export type Exl50uSensorWebPoint = readonly [number, number, number];

export type Exl50uSensorPoint = Readonly<{
  id: string;
  sourceIndex: number;
  sourceKey: string;
  displayName: string;
  family: Exl50uSensorFamily;
  status: 'active';
  sourceTuple: Exl50uSensorTuple;
  webMetres: Exl50uSensorWebPoint;
}>;

const EXPECTED_COUNTS = Object.freeze({ LD: 42, PF: 7, TF: 14, TF_V: 12, SMOKE: 1 });
const EXPECTED_PUBLICATION = Object.freeze({
  precisePointPublicationAuthorized: true,
  authorizedAt: '2026-08-31',
  publicDualEndpoint: true,
  sourceGeometryIncluded: false,
  browserMutationAuthoritative: false,
  engineeringUseAllowed: false,
});
const EXPECTED_COORDINATE_SYSTEM = Object.freeze({
  id: 'EXL50U_CYLINDRICAL_H_R_PHI_V1',
  sourceTuple: Object.freeze(['elevation_mm', 'radius_mm', 'toroidal_deg']),
  sourceUnits: Object.freeze(['millimetre', 'millimetre', 'degree']),
  elevationDatumMm: EXL50U_SENSOR_ELEVATION_DATUM_MM,
  sourceFrame: 'right-handed cylindrical; phi=0 along +X and increases toward +Y',
  webFrame: 'right-handed XYZ; Y vertical',
  sourceToWebPoint: '[H_mm, R_mm, phi_deg] -> [R*cos(phi), H-4805, -R*sin(phi)] / 1000',
  reviewStatus: 'cad-registered-provisional-not-surveyed',
  reviewBoundary: 'The source JSON omits field labels, units and datum. The published interpretation is registered against the supplied millimetre CAD mesh and remains non-survey, non-as-built visualization data.',
});
const EXPECTED_RUNTIME_GEOMETRY = Object.freeze({
  mode: 'marker-layer-on-existing-exl50u-model',
  geometryAssets: Object.freeze([]),
  redundantObjOrStlLoaded: false,
});

export type Exl50uSensorPointDataset = Readonly<{
  schemaVersion: typeof EXL50U_SENSOR_POINT_SCHEMA_VERSION;
  id: 'exl50u-host-sensor-points-v1';
  asOf: '2026-08-31';
  deviceId: 'EXL-50U';
  authority: 'user-provided-nominal-installation-points';
  source: Readonly<{
    fileName: 'sensor_positions.json';
    bytes: 4_642;
    sha256: typeof EXL50U_SENSOR_SOURCE_SHA256;
  }>;
  publication: typeof EXPECTED_PUBLICATION;
  coordinateSystem: typeof EXPECTED_COORDINATE_SYSTEM;
  runtimeGeometry: typeof EXPECTED_RUNTIME_GEOMETRY;
  recordCount: 76;
  familyCounts: typeof EXPECTED_COUNTS;
  records: readonly Exl50uSensorPoint[];
}>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function exact<T extends string | number | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  return expected;
}

function assertExactJson(value: unknown, expected: unknown, label: string): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(value) || value.length !== expected.length) {
      throw new Error(`${label} must match the reviewed array`);
    }
    expected.forEach((item, index) => assertExactJson(value[index], item, `${label}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    const input = object(value, label);
    const template = expected as Record<string, unknown>;
    assertKeys(input, Object.keys(template), label);
    Object.entries(template).forEach(([key, item]) => assertExactJson(input[key], item, `${label}.${key}`));
    return;
  }
  if (value !== expected) throw new Error(`${label} must match the reviewed contract`);
}

function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function clean(value: number) {
  if (Math.abs(value) < 5e-13) return 0;
  return Number(value.toFixed(12));
}

export function exl50uSensorPointToWebMetres(tuple: Exl50uSensorTuple): Exl50uSensorWebPoint {
  const hMm = finite(tuple.hMm, 'sourceTuple.hMm');
  const rMm = finite(tuple.rMm, 'sourceTuple.rMm');
  const phiDeg = finite(tuple.phiDeg, 'sourceTuple.phiDeg');
  if (hMm < 0 || hMm > 20_000) throw new Error('sourceTuple.hMm is outside the reviewed range');
  if (rMm <= 0 || rMm > 10_000) throw new Error('sourceTuple.rMm is outside the reviewed range');
  if (phiDeg < 0 || phiDeg >= 360) throw new Error('sourceTuple.phiDeg must be in [0, 360)');
  const phi = phiDeg * Math.PI / 180;
  return [
    clean(rMm * Math.cos(phi) / 1_000),
    clean((hMm - EXL50U_SENSOR_ELEVATION_DATUM_MM) / 1_000),
    clean(-rMm * Math.sin(phi) / 1_000),
  ];
}

export function updateExl50uSensorPoint(
  point: Exl50uSensorPoint,
  patch: Partial<Pick<Exl50uSensorPoint, 'displayName' | 'family'>> & { sourceTuple?: Exl50uSensorTuple },
): Exl50uSensorPoint {
  const displayName = patch.displayName === undefined ? point.displayName : patch.displayName.trim();
  if (!displayName || displayName.length > 80) throw new Error('displayName must contain 1-80 characters');
  const family = patch.family ?? point.family;
  if (!(['LD', 'PF', 'TF', 'TF_V', 'SMOKE'] as const).includes(family)) {
    throw new Error('family is unsupported');
  }
  const sourceTuple = patch.sourceTuple ?? point.sourceTuple;
  return {
    ...point,
    displayName,
    family,
    sourceTuple,
    webMetres: exl50uSensorPointToWebMetres(sourceTuple),
  };
}

function parsePoint(value: unknown, index: number): Exl50uSensorPoint {
  const label = `records[${index}]`;
  const input = object(value, label);
  assertKeys(input, ['id', 'sourceIndex', 'sourceKey', 'displayName', 'family', 'status', 'sourceTuple', 'webMetres'], label);
  const id = exact(input.id, `EXL50U-SP-${String(index + 1).padStart(3, '0')}`, `${label}.id`);
  const sourceIndex = exact(input.sourceIndex, index + 1, `${label}.sourceIndex`);
  const sourceKey = typeof input.sourceKey === 'string' ? input.sourceKey : '';
  const displayName = typeof input.displayName === 'string' ? input.displayName : '';
  if (!sourceKey || sourceKey.length > 80 || displayName !== sourceKey) {
    throw new Error(`${label} must preserve its bounded source label`);
  }
  const family = input.family;
  if (!(['LD', 'PF', 'TF', 'TF_V', 'SMOKE'] as const).includes(family as Exl50uSensorFamily)) {
    throw new Error(`${label}.family is unsupported`);
  }
  exact(input.status, 'active', `${label}.status`);
  const sourceTupleInput = object(input.sourceTuple, `${label}.sourceTuple`);
  assertKeys(sourceTupleInput, ['hMm', 'rMm', 'phiDeg'], `${label}.sourceTuple`);
  const sourceTuple = {
    hMm: finite(sourceTupleInput.hMm, `${label}.sourceTuple.hMm`),
    rMm: finite(sourceTupleInput.rMm, `${label}.sourceTuple.rMm`),
    phiDeg: finite(sourceTupleInput.phiDeg, `${label}.sourceTuple.phiDeg`),
  };
  const web = input.webMetres;
  if (!Array.isArray(web) || web.length !== 3) throw new Error(`${label}.webMetres must be a 3-vector`);
  const webMetres = web.map((value, axis) => finite(value, `${label}.webMetres[${axis}]`)) as [number, number, number];
  const expectedWeb = exl50uSensorPointToWebMetres(sourceTuple);
  expectedWeb.forEach((expected, axis) => {
    if (Math.abs(expected - webMetres[axis]) > 2e-10) {
      throw new Error(`${label}.webMetres disagrees with the reviewed cylindrical transform`);
    }
  });
  return {
    id,
    sourceIndex,
    sourceKey,
    displayName,
    family: family as Exl50uSensorFamily,
    status: 'active',
    sourceTuple,
    webMetres,
  };
}

export function parseExl50uSensorPointDataset(value: unknown): Exl50uSensorPointDataset {
  const root = object(value, 'EXL-50U sensor point dataset');
  assertKeys(root, [
    'schemaVersion', 'id', 'asOf', 'deviceId', 'authority', 'source', 'publication',
    'coordinateSystem', 'runtimeGeometry', 'recordCount', 'familyCounts', 'records',
  ], 'EXL-50U sensor point dataset');
  exact(root.schemaVersion, EXL50U_SENSOR_POINT_SCHEMA_VERSION, 'schemaVersion');
  exact(root.id, 'exl50u-host-sensor-points-v1', 'id');
  exact(root.asOf, '2026-08-31', 'asOf');
  exact(root.deviceId, 'EXL-50U', 'deviceId');
  exact(root.authority, 'user-provided-nominal-installation-points', 'authority');
  assertExactJson(root.source, {
    fileName: 'sensor_positions.json',
    bytes: 4_642,
    sha256: EXL50U_SENSOR_SOURCE_SHA256,
  }, 'source');
  assertExactJson(root.publication, EXPECTED_PUBLICATION, 'publication');
  assertExactJson(root.coordinateSystem, EXPECTED_COORDINATE_SYSTEM, 'coordinateSystem');
  assertExactJson(root.runtimeGeometry, EXPECTED_RUNTIME_GEOMETRY, 'runtimeGeometry');
  exact(root.recordCount, 76, 'recordCount');
  assertExactJson(root.familyCounts, EXPECTED_COUNTS, 'familyCounts');
  if (!Array.isArray(root.records) || root.records.length !== 76) {
    throw new Error('records must contain exactly 76 sensor points');
  }
  const records = root.records.map(parsePoint);
  if (new Set(records.map((record) => record.id)).size !== records.length
    || new Set(records.map((record) => record.sourceKey)).size !== records.length
    || new Set(records.map((record) => JSON.stringify(record.sourceTuple))).size !== records.length) {
    throw new Error('sensor records must have unique stable ids, source keys and coordinates');
  }
  const observedCounts = records.reduce<Record<Exl50uSensorFamily, number>>((counts, point) => {
    counts[point.family] += 1;
    return counts;
  }, { LD: 0, PF: 0, TF: 0, TF_V: 0, SMOKE: 0 });
  assertExactJson(observedCounts, EXPECTED_COUNTS, 'observed family counts');
  return {
    schemaVersion: EXL50U_SENSOR_POINT_SCHEMA_VERSION,
    id: 'exl50u-host-sensor-points-v1',
    asOf: '2026-08-31',
    deviceId: 'EXL-50U',
    authority: 'user-provided-nominal-installation-points',
    source: {
      fileName: 'sensor_positions.json',
      bytes: 4_642,
      sha256: EXL50U_SENSOR_SOURCE_SHA256,
    },
    publication: EXPECTED_PUBLICATION,
    coordinateSystem: EXPECTED_COORDINATE_SYSTEM,
    runtimeGeometry: EXPECTED_RUNTIME_GEOMETRY,
    recordCount: 76,
    familyCounts: EXPECTED_COUNTS,
    records,
  };
}
