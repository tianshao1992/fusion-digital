export const EXL50U_DIAGVIEW2_PORT_DATASET_URL =
  '/models/exl50u-diagview2-v1/diagview2-ports.json';
export const EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION =
  'fusiondigital.exl50u.diagview2-ports.v1';
export const EXL50U_DIAGVIEW2_PORT_SOURCE = Object.freeze({
  repository: 'DiagView',
  branch: 'origin/digView2',
  branchRevision: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79',
  sourceDataCommit: 'b8f04aff8d1b3c59d5ea95a20047eb9dd968ca23',
  introducedCommit: 'b8f04aff8d1b3c59d5ea95a20047eb9dd968ca23',
  deletedCommit: '550e0801f56f110d58500b61a4415847755f4f30',
  path: 'data/EXL50U_position.xlsx',
  gitBlobSha1: '30817819689b9fff0cb047ba7deae6aa7cb0bdd0',
  byteLength: 1_365_912,
  sha256: '93395B12183048E65CCD9235D3C9F50098AC80F48A1949FB5205DA90EC28CDC6',
});

export type Exl50uDiagView2PortSection = 'U1' | 'U2' | 'S1' | 'S2' | 'S3' | 'L1' | 'L2';
export type Exl50uDiagView2PortType = 'side_flange' | 'mid_flange';
export type Exl50uDiagView2Tuple = readonly [number, number, number];

type Exl50uDiagView2PortBase = {
  id: string;
  sourceCellRange: string;
  section: Exl50uDiagView2PortSection;
  flangeType: Exl50uDiagView2PortType;
  azimuthDeg: number;
  poloidalNormalDeg: number;
  diagViewMetres: Exl50uDiagView2Tuple;
  diagViewNormal: Exl50uDiagView2Tuple;
  webMetres: Exl50uDiagView2Tuple;
  webNormal: Exl50uDiagView2Tuple;
};

export type Exl50uDiagView2SidePort = Exl50uDiagView2PortBase & {
  section: Exclude<Exl50uDiagView2PortSection, 'S2'>;
  flangeType: 'side_flange';
  sourceAuthoredMetres: { readonly r: number; readonly z: number };
};

export type Exl50uDiagView2MidPort = Exl50uDiagView2PortBase & {
  section: 'S2';
  flangeType: 'mid_flange';
  sourceAuthoredMetres: { readonly x: number; readonly y: number; readonly z: number };
};

export type Exl50uDiagView2Port = Exl50uDiagView2SidePort | Exl50uDiagView2MidPort;

const PUBLICATION = Object.freeze({
  publishedCellRanges: Object.freeze(['side_flange!A:E', 'mid_flange!A:F']),
  omittedSheets: Object.freeze(['Sheet3']),
  sourceWorkbookIncluded: false,
  helperColumnsIncluded: false,
  formulasPublished: false,
  embeddedImagesIncluded: false,
  engineeringUseAllowed: false,
});
const UNIT_REVIEW = Object.freeze({
  sourceAuthoredUnit: 'metre',
  historicalParserAssumption: 'millimetre',
  historicalParserScaleFactor: 0.001,
  publishedScaleFactor: 1,
  historicalParser: Object.freeze({
    path: 'src/data_parser.py',
    gitBlobSha1: 'd005ccc306262ad785d589f45ac428efc4d5793f',
  }),
  decision: 'Publish the workbook numeric coordinates at authored metre scale; reject the historical unconditional /1000 conversion.',
  rationale: 'The 0.8-1.841 coordinate magnitudes are metre-scale and align with the current metre-based public EXL-50U CAD; applying /1000 would collapse the ports by three orders of magnitude.',
  authorityBoundary: 'This is a reviewed compatibility correction for the current public metre-based CAD, not surveyed, as-built, experimental or engineering-authoritative geometry.',
});
const FORMULA_REVIEW = Object.freeze({
  s2CanonicalRadiusMetres: 1.841,
  s2RecomputedCoordinates: Object.freeze(['X', 'Y']),
  s2RepairedCells: Object.freeze(['C4', 'C6', 'C8', 'C10', 'C12']),
  s2RejectedFormulaPattern: '$H$2*COS(Bn/PI()*180)',
  s2ReviewedFormulaPattern: '$H$2*COS(Bn/180*PI())',
  s2Decision: 'Recompute every S2 X/Y pair from azimuth and the reviewed 1.841 m canonical radius; never publish cached formula results.',
  sideReviewedCell: 'D26',
  sideReviewedFormula: '(1.1485+0.6515)/2',
  sideReviewedValueMetres: 0.9,
  sideDecision: 'Publish D26 only after verifying its cache equals 0.9 m and matches the remaining S1 Z constants D27:D37.',
});
const COORDINATE_SYSTEM = Object.freeze({
  sourceUnit: 'metre',
  publishedUnit: 'metre',
  diagViewFrame: 'right-handed XYZ; Z vertical',
  webFrame: 'right-handed XYZ; Y vertical',
  diagViewToWebPoint: '[x, y, z] -> [x, z, -y]',
  diagViewToWebDirection: '[x, y, z] -> [x, z, -y]',
  normalConvention: 'n = cos(theta) * [cos(phi), sin(phi), 0] + sin(theta) * [0, 0, 1]',
});
const SECTION_ORDER = Object.freeze(['U1', 'U2', 'S1', 'S2', 'S3', 'L1', 'L2'] as const);
const SECTION_COUNTS = Object.freeze({ U1: 12, U2: 12, S1: 12, S2: 12, S3: 12, L1: 12, L2: 12 });

export type Exl50uDiagView2PortDataset = {
  schemaVersion: typeof EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION;
  id: 'exl50u-diagview2-ports-v1';
  asOf: '2026-08-28';
  deviceId: 'EXL-50U';
  authority: 'historical-design-reference';
  source: typeof EXL50U_DIAGVIEW2_PORT_SOURCE;
  publication: typeof PUBLICATION;
  unitReview: typeof UNIT_REVIEW;
  formulaReview: typeof FORMULA_REVIEW;
  coordinateSystem: typeof COORDINATE_SYSTEM;
  sectionOrder: typeof SECTION_ORDER;
  recordCount: 84;
  sectionCounts: typeof SECTION_COUNTS;
  records: readonly Exl50uDiagView2Port[];
};

type SourceExpectation = {
  id: string;
  sourceCellRange: string;
  section: Exl50uDiagView2PortSection;
  flangeType: Exl50uDiagView2PortType;
  azimuthDeg: number;
  poloidalNormalDeg: number;
  sourceAuthoredMetres: Readonly<Record<string, number>>;
};

function clean(value: number) {
  if (Math.abs(value) < 5e-13) return 0;
  return Number(value.toFixed(12));
}

const SIDE_SECTIONS = [
  ['U1', 2, 1.43982, 1.8165, 270],
  ['U2', 14, 1.43982, 1.60099, 220],
  ['S1', 26, 1.841, 0.9, 180],
  ['S3', 38, 1.841, -0.9, 180],
  ['L1', 50, 1.43982, -1.8165, 130],
  ['L2', 62, 0.8, -1.8165, 90],
] as const;

const sideExpectations = new Map<Exl50uDiagView2PortSection, SourceExpectation[]>();
for (const [section, startRow, radius, z, theta] of SIDE_SECTIONS) {
  sideExpectations.set(section, Array.from({ length: 12 }, (_, index) => ({
    id: `${section}@${index * 30}`,
    sourceCellRange: `side_flange!A${startRow + index}:E${startRow + index}`,
    section,
    flangeType: 'side_flange' as const,
    azimuthDeg: index * 30,
    poloidalNormalDeg: theta,
    sourceAuthoredMetres: { r: radius, z },
  })));
}
const s2Expectations = Array.from({ length: 12 }, (_, index): SourceExpectation => {
  const azimuthDeg = index * 30;
  const phi = azimuthDeg * Math.PI / 180;
  return {
    id: `S2@${azimuthDeg}`,
    sourceCellRange: `mid_flange!A${index + 2}:F${index + 2}`,
    section: 'S2',
    flangeType: 'mid_flange',
    azimuthDeg,
    poloidalNormalDeg: 180,
    sourceAuthoredMetres: {
      x: clean(1.841 * Math.cos(phi)),
      y: clean(1.841 * Math.sin(phi)),
      z: 0,
    },
  };
});
const EXPECTED_SOURCE_ROWS: readonly SourceExpectation[] = Object.freeze(
  SECTION_ORDER.flatMap((section) => section === 'S2'
    ? s2Expectations
    : sideExpectations.get(section) ?? []),
);

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
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
    for (const [key, item] of Object.entries(template)) assertExactJson(input[key], item, `${label}.${key}`);
    return;
  }
  if (value !== expected) throw new Error(`${label} must match the reviewed contract`);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function tuple(value: unknown, label: string): Exl50uDiagView2Tuple {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be a 3-vector`);
  return [finite(value[0], `${label}[0]`), finite(value[1], `${label}[1]`), finite(value[2], `${label}[2]`)];
}

function close(actual: number, expected: number, label: string, tolerance = 2e-10) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} disagrees with the reviewed DiagView2 geometry`);
  }
}

function closeTuple(actual: Exl50uDiagView2Tuple, expected: Exl50uDiagView2Tuple, label: string) {
  actual.forEach((value, index) => close(value, expected[index], `${label}[${index}]`));
}

function expectedGeometry(expectation: SourceExpectation) {
  const phi = expectation.azimuthDeg * Math.PI / 180;
  const theta = expectation.poloidalNormalDeg * Math.PI / 180;
  let x: number;
  let y: number;
  let z: number;
  if (expectation.flangeType === 'side_flange') {
    x = clean(expectation.sourceAuthoredMetres.r * Math.cos(phi));
    y = clean(expectation.sourceAuthoredMetres.r * Math.sin(phi));
    z = expectation.sourceAuthoredMetres.z;
  } else {
    x = expectation.sourceAuthoredMetres.x;
    y = expectation.sourceAuthoredMetres.y;
    z = expectation.sourceAuthoredMetres.z;
  }
  const normal = [
    clean(Math.cos(theta) * Math.cos(phi)),
    clean(Math.cos(theta) * Math.sin(phi)),
    clean(Math.sin(theta)),
  ] as Exl50uDiagView2Tuple;
  return {
    position: [x, y, z] as Exl50uDiagView2Tuple,
    normal,
    webPosition: [x, z, clean(-y)] as Exl50uDiagView2Tuple,
    webNormal: [normal[0], normal[2], clean(-normal[1])] as Exl50uDiagView2Tuple,
  };
}

function parseSourceMetres(value: unknown, expectation: SourceExpectation, label: string) {
  const input = object(value, label);
  const keys = Object.keys(expectation.sourceAuthoredMetres);
  assertKeys(input, keys, label);
  const output: Record<string, number> = {};
  for (const key of keys) {
    const parsed = finite(input[key], `${label}.${key}`);
    close(parsed, expectation.sourceAuthoredMetres[key], `${label}.${key}`);
    output[key] = parsed;
  }
  return output;
}

function parsePort(value: unknown, expectation: SourceExpectation, index: number): Exl50uDiagView2Port {
  const label = `records[${index}]`;
  const input = object(value, label);
  assertKeys(input, [
    'id', 'sourceCellRange', 'section', 'flangeType', 'azimuthDeg', 'poloidalNormalDeg',
    'sourceAuthoredMetres', 'diagViewMetres', 'diagViewNormal', 'webMetres', 'webNormal',
  ], label);
  exact(input.id, expectation.id, `${label}.id`);
  exact(input.sourceCellRange, expectation.sourceCellRange, `${label}.sourceCellRange`);
  exact(input.section, expectation.section, `${label}.section`);
  exact(input.flangeType, expectation.flangeType, `${label}.flangeType`);
  exact(input.azimuthDeg, expectation.azimuthDeg, `${label}.azimuthDeg`);
  exact(input.poloidalNormalDeg, expectation.poloidalNormalDeg, `${label}.poloidalNormalDeg`);
  const sourceAuthoredMetres = parseSourceMetres(input.sourceAuthoredMetres, expectation, `${label}.sourceAuthoredMetres`);
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
  if (expectation.section === 'S2') {
    close(Math.hypot(diagViewMetres[0], diagViewMetres[1]), 1.841, `${label}.S2 radius`, 2e-12);
  }
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
  if (expectation.flangeType === 'mid_flange') {
    return {
      ...common,
      section: 'S2',
      flangeType: 'mid_flange',
      sourceAuthoredMetres: sourceAuthoredMetres as Exl50uDiagView2MidPort['sourceAuthoredMetres'],
    };
  }
  return {
    ...common,
    section: expectation.section as Exl50uDiagView2SidePort['section'],
    flangeType: 'side_flange',
    sourceAuthoredMetres: sourceAuthoredMetres as Exl50uDiagView2SidePort['sourceAuthoredMetres'],
  };
}

export function parseExl50uDiagView2PortDataset(value: unknown): Exl50uDiagView2PortDataset {
  const root = object(value, 'EXL-50U DiagView2 port dataset');
  assertKeys(root, [
    'schemaVersion', 'id', 'asOf', 'deviceId', 'authority', 'source', 'publication',
    'unitReview', 'formulaReview', 'coordinateSystem', 'sectionOrder', 'recordCount',
    'sectionCounts', 'records',
  ], 'EXL-50U DiagView2 port dataset');
  exact(root.schemaVersion, EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION, 'schemaVersion');
  exact(root.id, 'exl50u-diagview2-ports-v1', 'id');
  exact(root.asOf, '2026-08-28', 'asOf');
  exact(root.deviceId, 'EXL-50U', 'deviceId');
  exact(root.authority, 'historical-design-reference', 'authority');
  assertExactJson(root.source, EXL50U_DIAGVIEW2_PORT_SOURCE, 'source');
  assertExactJson(root.publication, PUBLICATION, 'publication');
  assertExactJson(root.unitReview, UNIT_REVIEW, 'unitReview');
  assertExactJson(root.formulaReview, FORMULA_REVIEW, 'formulaReview');
  assertExactJson(root.coordinateSystem, COORDINATE_SYSTEM, 'coordinateSystem');
  assertExactJson(root.sectionOrder, SECTION_ORDER, 'sectionOrder');
  exact(root.recordCount, 84, 'recordCount');
  assertExactJson(root.sectionCounts, SECTION_COUNTS, 'sectionCounts');
  if (!Array.isArray(root.records) || root.records.length !== EXPECTED_SOURCE_ROWS.length) {
    throw new Error('records must contain exactly 84 reviewed flange rows');
  }
  const records = root.records.map((record, index) => parsePort(record, EXPECTED_SOURCE_ROWS[index], index));
  if (new Set(records.map((record) => record.id)).size !== 84) {
    throw new Error('records contain duplicate port ids');
  }
  return {
    schemaVersion: EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION,
    id: 'exl50u-diagview2-ports-v1',
    asOf: '2026-08-28',
    deviceId: 'EXL-50U',
    authority: 'historical-design-reference',
    source: EXL50U_DIAGVIEW2_PORT_SOURCE,
    publication: PUBLICATION,
    unitReview: UNIT_REVIEW,
    formulaReview: FORMULA_REVIEW,
    coordinateSystem: COORDINATE_SYSTEM,
    sectionOrder: SECTION_ORDER,
    recordCount: 84,
    sectionCounts: SECTION_COUNTS,
    records,
  };
}

export function exl50uDiagView2PortById(
  dataset: Exl50uDiagView2PortDataset,
  id: string,
): Exl50uDiagView2Port | undefined {
  return dataset.records.find((record) => record.id === id);
}
