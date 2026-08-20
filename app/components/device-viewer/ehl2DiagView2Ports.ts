export const EHL2_DIAGVIEW2_PORT_DATASET_URL =
  '/models/ehl2-preliminary-v1/diagview2-ports.json';
export const EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION =
  'fusiondigital.ehl2.diagview2-ports.v1';
export const EHL2_DIAGVIEW2_PORT_SOURCE = Object.freeze({
  repository: 'DiagView',
  branch: 'origin/digView2',
  branchRevision: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79',
  sourceDataCommit: '94c1a21285b5a832beea24d94066f8cdb4873eee',
  introducedCommit: '42973f14913f80fb9fd35c51f971005ee46aa1aa',
  path: 'data/EHL2_position.xlsx',
  gitBlobSha1: 'a2dd0fb815612b2c4735a39ff6d1e0a51c9dbdb5',
  byteLength: 1_364_538,
  sha256: '159DC5D5E2718A84C76AAF479D6AD14B8A2D3E1FDA8B77BF5EBA389D3AFC5ABC',
});

export type Ehl2DiagView2PortSection = 'S1' | 'S2' | 'S3';
export type Ehl2DiagView2PortType = 'side_flange' | 'mid_flange';
export type Ehl2DiagView2Tuple = readonly [number, number, number];

type Ehl2DiagView2PortBase = {
  id: string;
  sourceCellRange: string;
  section: Ehl2DiagView2PortSection;
  flangeType: Ehl2DiagView2PortType;
  azimuthDeg: number;
  poloidalNormalDeg: number;
  diagViewMetres: Ehl2DiagView2Tuple;
  diagViewNormal: Ehl2DiagView2Tuple;
  webMetres: Ehl2DiagView2Tuple;
  webNormal: Ehl2DiagView2Tuple;
};

export type Ehl2DiagView2SidePort = Ehl2DiagView2PortBase & {
  section: 'S1' | 'S3';
  flangeType: 'side_flange';
  sourceMm: { readonly r: number; readonly z: number };
};

export type Ehl2DiagView2MidPort = Ehl2DiagView2PortBase & {
  section: 'S2';
  flangeType: 'mid_flange';
  sourceMm: { readonly x: number; readonly y: number; readonly z: number };
};

export type Ehl2DiagView2Port = Ehl2DiagView2SidePort | Ehl2DiagView2MidPort;

export type Ehl2DiagView2PortDataset = {
  schemaVersion: typeof EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION;
  id: 'ehl2-diagview2-ports-v1';
  asOf: '2026-08-21';
  authority: 'historical-design-reference';
  source: typeof EHL2_DIAGVIEW2_PORT_SOURCE;
  publication: {
    publicNumericTableOnly: true;
    sourceWorkbookIncluded: false;
    embeddedWorkbookImageIncluded: false;
    engineeringUseAllowed: false;
  };
  coordinateSystem: {
    sourceUnit: 'millimetre';
    publishedUnit: 'metre';
    diagViewFrame: 'right-handed XYZ; Z vertical';
    webFrame: 'right-handed XYZ; Y vertical';
    diagViewToWebPoint: '[x, y, z] -> [x, z, -y]';
    diagViewToWebDirection: '[x, y, z] -> [x, z, -y]';
    normalConvention: string;
  };
  offsetCompatibility: {
    mode: 'diagview2-apply_fine_tune-legacy-v1';
    sourceRevision: typeof EHL2_DIAGVIEW2_PORT_SOURCE.branchRevision;
    localBasis: {
      normal: 'n';
      toroidal: 't_phi = [-sin(phi), cos(phi), 0]';
      poloidal: 't_theta = [-sin(theta)cos(phi), -sin(theta)sin(phi), cos(theta)]';
    };
    localOffsetMm: '(-dR * n + dY * t_phi + dZ * t_theta) / 1000';
    worldOffsetMm: '[dX_world, dY_world, dZ_world] / 1000';
    warning: string;
  };
  recordCount: 41;
  sectionCounts: { readonly S1: 16; readonly S2: 13; readonly S3: 12 };
  records: readonly Ehl2DiagView2Port[];
};

type SourceExpectation = {
  id: string;
  sourceCellRange: string;
  section: Ehl2DiagView2PortSection;
  flangeType: Ehl2DiagView2PortType;
  azimuthDeg: number;
  poloidalNormalDeg: number;
  sourceMm: Readonly<Record<string, number>>;
};

const S1_ANGLES = [
  0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5,
  180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5,
] as const;
const S3_ANGLES = [
  22.5, 45, 67.5, 112.5, 135, 157.5,
  202.5, 225, 247.5, 292.5, 315, 337.5,
] as const;
const S2_ROWS = [
  [16, 4174.3004, 373.7859],
  [61, 2687.3696, 3215.9827],
  [90, 0, 4115],
  [129, -1942.7688, 3713.509],
  [145, -3082.3824, 2780.9025],
  [174, -3999.5924, 1252.1024],
  [190, -4145.9685, -213.1785],
  [219, -3178.509, -1942.7688],
  [247, -1576.6557, -3806.3837],
  [270, 0, -4120],
  [292, 1576.6557, -3806.3837],
  [315, 2913.2799, -2913.2799],
  [337, 3806.3837, -1576.6557],
] as const;

const EXPECTED_SOURCE_ROWS: readonly SourceExpectation[] = Object.freeze([
  ...S1_ANGLES.map((azimuthDeg, index) => ({
    id: `S1@${azimuthDeg}`,
    sourceCellRange: `side_flange!A${index + 2}:E${index + 2}`,
    section: 'S1' as const,
    flangeType: 'side_flange' as const,
    azimuthDeg,
    poloidalNormalDeg: 210,
    sourceMm: { r: 3789, z: 2101 },
  })),
  ...S3_ANGLES.map((azimuthDeg, index) => ({
    id: `S3@${azimuthDeg}`,
    sourceCellRange: `side_flange!A${index + 18}:E${index + 18}`,
    section: 'S3' as const,
    flangeType: 'side_flange' as const,
    azimuthDeg,
    poloidalNormalDeg: 150,
    sourceMm: { r: 3789, z: -2101 },
  })),
  ...S2_ROWS.map(([azimuthDeg, x, y], index) => ({
    id: `S2@${azimuthDeg}`,
    sourceCellRange: `mid_flange!A${index + 2}:F${index + 2}`,
    section: 'S2' as const,
    flangeType: 'mid_flange' as const,
    azimuthDeg,
    poloidalNormalDeg: 180,
    sourceMm: { x, y, z: 0 },
  })),
]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  return expected;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function tuple(value: unknown, label: string): Ehl2DiagView2Tuple {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be a 3-vector`);
  return [
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
    finite(value[2], `${label}[2]`),
  ];
}

function close(actual: number, expected: number, label: string, tolerance = 2e-10) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} disagrees with the reviewed workbook geometry`);
  }
}

function closeTuple(actual: Ehl2DiagView2Tuple, expected: Ehl2DiagView2Tuple, label: string) {
  actual.forEach((value, index) => close(value, expected[index], `${label}[${index}]`));
}

function expectedGeometry(expectation: SourceExpectation) {
  const theta = expectation.poloidalNormalDeg * Math.PI / 180;
  let x: number;
  let y: number;
  let z: number;
  if (expectation.flangeType === 'side_flange') {
    const phi = expectation.azimuthDeg * Math.PI / 180;
    x = expectation.sourceMm.r * Math.cos(phi) / 1000;
    y = expectation.sourceMm.r * Math.sin(phi) / 1000;
    z = expectation.sourceMm.z / 1000;
  } else {
    x = expectation.sourceMm.x / 1000;
    y = expectation.sourceMm.y / 1000;
    z = expectation.sourceMm.z / 1000;
  }
  const radialLength = Math.hypot(x, y);
  if (!(radialLength > 1e-12)) throw new Error(`${expectation.id} has no radial direction`);
  const normal: Ehl2DiagView2Tuple = [
    Math.cos(theta) * x / radialLength,
    Math.cos(theta) * y / radialLength,
    Math.sin(theta),
  ];
  const position: Ehl2DiagView2Tuple = [x, y, z];
  return {
    position,
    normal,
    webPosition: [x, z, -y] as Ehl2DiagView2Tuple,
    webNormal: [normal[0], normal[2], -normal[1]] as Ehl2DiagView2Tuple,
  };
}

function parseSourceMm(
  value: unknown,
  expectation: SourceExpectation,
  label: string,
): Ehl2DiagView2SidePort['sourceMm'] | Ehl2DiagView2MidPort['sourceMm'] {
  const input = object(value, label);
  const expectedKeys = Object.keys(expectation.sourceMm);
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    throw new Error(`${label} has unexpected fields`);
  }
  for (const key of expectedKeys) {
    exact(input[key], expectation.sourceMm[key], `${label}.${key}`);
  }
  return expectation.flangeType === 'side_flange'
    ? { r: expectation.sourceMm.r, z: expectation.sourceMm.z }
    : { x: expectation.sourceMm.x, y: expectation.sourceMm.y, z: expectation.sourceMm.z };
}

function parsePort(value: unknown, expectation: SourceExpectation, index: number): Ehl2DiagView2Port {
  const label = `records[${index}]`;
  const input = object(value, label);
  exact(input.id, expectation.id, `${label}.id`);
  exact(input.sourceCellRange, expectation.sourceCellRange, `${label}.sourceCellRange`);
  exact(input.section, expectation.section, `${label}.section`);
  exact(input.flangeType, expectation.flangeType, `${label}.flangeType`);
  exact(input.azimuthDeg, expectation.azimuthDeg, `${label}.azimuthDeg`);
  exact(input.poloidalNormalDeg, expectation.poloidalNormalDeg, `${label}.poloidalNormalDeg`);
  const sourceMm = parseSourceMm(input.sourceMm, expectation, `${label}.sourceMm`);
  const diagViewMetres = tuple(input.diagViewMetres, `${label}.diagViewMetres`);
  const diagViewNormal = tuple(input.diagViewNormal, `${label}.diagViewNormal`);
  const webMetres = tuple(input.webMetres, `${label}.webMetres`);
  const webNormal = tuple(input.webNormal, `${label}.webNormal`);
  const expected = expectedGeometry(expectation);
  closeTuple(diagViewMetres, expected.position, `${label}.diagViewMetres`);
  closeTuple(diagViewNormal, expected.normal, `${label}.diagViewNormal`);
  closeTuple(webMetres, expected.webPosition, `${label}.webMetres`);
  closeTuple(webNormal, expected.webNormal, `${label}.webNormal`);
  close(Math.hypot(...diagViewNormal), 1, `${label}.diagViewNormal length`);
  close(Math.hypot(...webNormal), 1, `${label}.webNormal length`);

  const common = {
    id: expectation.id,
    sourceCellRange: expectation.sourceCellRange,
    azimuthDeg: expectation.azimuthDeg,
    poloidalNormalDeg: expectation.poloidalNormalDeg,
    diagViewMetres,
    diagViewNormal,
    webMetres,
    webNormal,
  };
  if (expectation.flangeType === 'side_flange') {
    return { ...common, section: expectation.section as 'S1' | 'S3', flangeType: 'side_flange', sourceMm: sourceMm as Ehl2DiagView2SidePort['sourceMm'] };
  }
  return { ...common, section: 'S2', flangeType: 'mid_flange', sourceMm: sourceMm as Ehl2DiagView2MidPort['sourceMm'] };
}

export function parseEhl2DiagView2PortDataset(input: unknown): Ehl2DiagView2PortDataset {
  const root = object(input, 'EHL-2 DiagView2 port dataset');
  exact(root.schemaVersion, EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION, 'schemaVersion');
  exact(root.id, 'ehl2-diagview2-ports-v1', 'id');
  exact(root.asOf, '2026-08-21', 'asOf');
  exact(root.authority, 'historical-design-reference', 'authority');

  const source = object(root.source, 'source');
  for (const [key, expected] of Object.entries(EHL2_DIAGVIEW2_PORT_SOURCE)) {
    exact(source[key], expected, `source.${key}`);
  }
  const publication = object(root.publication, 'publication');
  exact(publication.publicNumericTableOnly, true, 'publication.publicNumericTableOnly');
  exact(publication.sourceWorkbookIncluded, false, 'publication.sourceWorkbookIncluded');
  exact(publication.embeddedWorkbookImageIncluded, false, 'publication.embeddedWorkbookImageIncluded');
  exact(publication.engineeringUseAllowed, false, 'publication.engineeringUseAllowed');

  const coordinateSystem = object(root.coordinateSystem, 'coordinateSystem');
  exact(coordinateSystem.sourceUnit, 'millimetre', 'coordinateSystem.sourceUnit');
  exact(coordinateSystem.publishedUnit, 'metre', 'coordinateSystem.publishedUnit');
  exact(coordinateSystem.diagViewFrame, 'right-handed XYZ; Z vertical', 'coordinateSystem.diagViewFrame');
  exact(coordinateSystem.webFrame, 'right-handed XYZ; Y vertical', 'coordinateSystem.webFrame');
  exact(coordinateSystem.diagViewToWebPoint, '[x, y, z] -> [x, z, -y]', 'coordinateSystem.diagViewToWebPoint');
  exact(coordinateSystem.diagViewToWebDirection, '[x, y, z] -> [x, z, -y]', 'coordinateSystem.diagViewToWebDirection');
  const normalConvention = exact(
    coordinateSystem.normalConvention,
    'n = cos(theta) * normalize([x, y, 0]) + sin(theta) * [0, 0, 1]',
    'coordinateSystem.normalConvention',
  );

  const offsetCompatibility = object(root.offsetCompatibility, 'offsetCompatibility');
  exact(offsetCompatibility.mode, 'diagview2-apply_fine_tune-legacy-v1', 'offsetCompatibility.mode');
  exact(offsetCompatibility.sourceRevision, EHL2_DIAGVIEW2_PORT_SOURCE.branchRevision, 'offsetCompatibility.sourceRevision');
  const localBasis = object(offsetCompatibility.localBasis, 'offsetCompatibility.localBasis');
  exact(localBasis.normal, 'n', 'offsetCompatibility.localBasis.normal');
  exact(localBasis.toroidal, 't_phi = [-sin(phi), cos(phi), 0]', 'offsetCompatibility.localBasis.toroidal');
  exact(localBasis.poloidal, 't_theta = [-sin(theta)cos(phi), -sin(theta)sin(phi), cos(theta)]', 'offsetCompatibility.localBasis.poloidal');
  exact(offsetCompatibility.localOffsetMm, '(-dR * n + dY * t_phi + dZ * t_theta) / 1000', 'offsetCompatibility.localOffsetMm');
  exact(offsetCompatibility.worldOffsetMm, '[dX_world, dY_world, dZ_world] / 1000', 'offsetCompatibility.worldOffsetMm');
  const warning = exact(
    offsetCompatibility.warning,
    'The historical dR sign is retained only for DiagView2 configuration compatibility; it is not an independently surveyed engineering convention.',
    'offsetCompatibility.warning',
  );

  exact(root.recordCount, 41, 'recordCount');
  const counts = object(root.sectionCounts, 'sectionCounts');
  exact(counts.S1, 16, 'sectionCounts.S1');
  exact(counts.S2, 13, 'sectionCounts.S2');
  exact(counts.S3, 12, 'sectionCounts.S3');
  if (!Array.isArray(root.records) || root.records.length !== EXPECTED_SOURCE_ROWS.length) {
    throw new Error('records must contain exactly 41 reviewed flange rows');
  }
  const records = root.records.map((record, index) => parsePort(record, EXPECTED_SOURCE_ROWS[index], index));
  if (new Set(records.map((record) => record.id)).size !== 41) {
    throw new Error('records contain duplicate flange ids');
  }

  return {
    schemaVersion: EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION,
    id: 'ehl2-diagview2-ports-v1',
    asOf: '2026-08-21',
    authority: 'historical-design-reference',
    source: EHL2_DIAGVIEW2_PORT_SOURCE,
    publication: {
      publicNumericTableOnly: true,
      sourceWorkbookIncluded: false,
      embeddedWorkbookImageIncluded: false,
      engineeringUseAllowed: false,
    },
    coordinateSystem: {
      sourceUnit: 'millimetre',
      publishedUnit: 'metre',
      diagViewFrame: 'right-handed XYZ; Z vertical',
      webFrame: 'right-handed XYZ; Y vertical',
      diagViewToWebPoint: '[x, y, z] -> [x, z, -y]',
      diagViewToWebDirection: '[x, y, z] -> [x, z, -y]',
      normalConvention,
    },
    offsetCompatibility: {
      mode: 'diagview2-apply_fine_tune-legacy-v1',
      sourceRevision: EHL2_DIAGVIEW2_PORT_SOURCE.branchRevision,
      localBasis: {
        normal: 'n',
        toroidal: 't_phi = [-sin(phi), cos(phi), 0]',
        poloidal: 't_theta = [-sin(theta)cos(phi), -sin(theta)sin(phi), cos(theta)]',
      },
      localOffsetMm: '(-dR * n + dY * t_phi + dZ * t_theta) / 1000',
      worldOffsetMm: '[dX_world, dY_world, dZ_world] / 1000',
      warning,
    },
    recordCount: 41,
    sectionCounts: { S1: 16, S2: 13, S3: 12 },
    records,
  };
}

export function portById(
  dataset: Ehl2DiagView2PortDataset,
  id: string,
): Ehl2DiagView2Port | undefined {
  return dataset.records.find((record) => record.id === id);
}
