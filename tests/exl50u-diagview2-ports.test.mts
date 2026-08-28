import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  buildDiagView2PortPackage,
  DEFAULT_SOURCE_REPOSITORY,
  readPinnedWorkbookFromGit,
  SOURCE_XLSX_BYTES,
  SOURCE_XLSX_SHA256,
} from '../scripts/exl50u/build_diagview2_ports.mjs';
import {
  EXL50U_DIAGVIEW2_PORT_DATASET_URL,
  EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION,
  EXL50U_DIAGVIEW2_PORT_SOURCE,
  exl50uDiagView2PortById,
  parseExl50uDiagView2PortDataset,
} from '../app/components/device-viewer/exl50uDiagView2Ports.ts';

const packageDirectory = new URL('../public/models/exl50u-diagview2-v1/', import.meta.url);
const datasetPath = new URL('diagview2-ports.json', packageDirectory);
const manifestPath = new URL('manifest.json', packageDirectory);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function approximate(actual: readonly number[], expected: readonly number[], tolerance = 2e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance, `${value} != ${expected[index]}`);
  });
}

function numericLeaves(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numericLeaves);
  return [];
}

async function loadRaw() {
  return JSON.parse(await readFile(datasetPath, 'utf8')) as Record<string, unknown>;
}

async function loadDataset() {
  return parseExl50uDiagView2PortDataset(await loadRaw());
}

test('the committed package is a deterministic projection of the pinned historical Git blob', async (context) => {
  try {
    await access(DEFAULT_SOURCE_REPOSITORY);
  } catch {
    context.skip('the optional pinned DiagView2 audit checkout is not available in this clone');
    return;
  }
  const workbook = readPinnedWorkbookFromGit();
  assert.equal(workbook.length, SOURCE_XLSX_BYTES);
  assert.equal(createHash('sha256').update(workbook).digest('hex').toUpperCase(), SOURCE_XLSX_SHA256);
  const built = buildDiagView2PortPackage(workbook);
  assert.equal(await readFile(datasetPath, 'utf8'), built.datasetText);
  assert.equal(await readFile(manifestPath, 'utf8'), built.manifestText);
  assert.deepEqual((await readdir(packageDirectory)).sort(), ['diagview2-ports.json', 'manifest.json']);
});

test('all 84 reviewed ports retain stable sections, angles, source rows and web mapping', async () => {
  const dataset = await loadDataset();
  assert.equal(dataset.schemaVersion, EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION);
  assert.equal(EXL50U_DIAGVIEW2_PORT_DATASET_URL, '/models/exl50u-diagview2-v1/diagview2-ports.json');
  assert.deepEqual(dataset.source, EXL50U_DIAGVIEW2_PORT_SOURCE);
  assert.deepEqual(dataset.sectionOrder, ['U1', 'U2', 'S1', 'S2', 'S3', 'L1', 'L2']);
  assert.deepEqual(dataset.sectionCounts, { U1: 12, U2: 12, S1: 12, S2: 12, S3: 12, L1: 12, L2: 12 });
  assert.equal(dataset.records.length, 84);
  assert.equal(new Set(dataset.records.map((record) => record.id)).size, 84);
  assert.deepEqual(
    dataset.records.filter((record) => record.azimuthDeg === 0).map((record) => record.id),
    ['U1@0', 'U2@0', 'S1@0', 'S2@0', 'S3@0', 'L1@0', 'L2@0'],
  );
  assert.equal(exl50uDiagView2PortById(dataset, 'U1@0')?.sourceCellRange, 'side_flange!A2:E2');
  assert.equal(exl50uDiagView2PortById(dataset, 'S1@0')?.sourceCellRange, 'side_flange!A26:E26');
  assert.equal(exl50uDiagView2PortById(dataset, 'S2@0')?.sourceCellRange, 'mid_flange!A2:F2');
  assert.equal(exl50uDiagView2PortById(dataset, 'L2@330')?.sourceCellRange, 'side_flange!A73:E73');
  assert.ok(numericLeaves(dataset.records).every(Number.isFinite));
  for (const record of dataset.records) {
    assert.equal(record.azimuthDeg % 30, 0);
    approximate(record.webMetres, [record.diagViewMetres[0], record.diagViewMetres[2], -record.diagViewMetres[1]]);
    approximate(record.webNormal, [record.diagViewNormal[0], record.diagViewNormal[2], -record.diagViewNormal[1]]);
    assert.ok(Math.abs(Math.hypot(...record.diagViewNormal) - 1) < 2e-10);
  }
});

test('S2 rejects the five broken X caches and publishes one canonical 1.841 m ring', async () => {
  const dataset = await loadDataset();
  assert.deepEqual(dataset.formulaReview.s2RepairedCells, ['C4', 'C6', 'C8', 'C10', 'C12']);
  assert.equal(dataset.formulaReview.s2RejectedFormulaPattern, '$H$2*COS(Bn/PI()*180)');
  assert.equal(dataset.formulaReview.s2ReviewedFormulaPattern, '$H$2*COS(Bn/180*PI())');
  const s2 = dataset.records.filter((record) => record.section === 'S2');
  assert.equal(s2.length, 12);
  for (const record of s2) {
    assert.ok(Math.abs(Math.hypot(record.diagViewMetres[0], record.diagViewMetres[1]) - 1.841) < 2e-12);
  }
  const repairedC4 = exl50uDiagView2PortById(dataset, 'S2@60');
  assert.ok(repairedC4);
  approximate(repairedC4.diagViewMetres, [0.9205, 1.594352768367, 0], 2e-12);
  assert.notEqual(repairedC4.diagViewMetres[0], 1.22274460312896, 'the broken C4 cache must not be published');
  assert.equal(dataset.formulaReview.sideReviewedCell, 'D26');
  assert.equal(dataset.formulaReview.sideReviewedValueMetres, 0.9);
});

test('the unit and publication contracts make the metre-scale review boundary explicit', async () => {
  const dataset = await loadDataset();
  assert.equal(dataset.unitReview.sourceAuthoredUnit, 'metre');
  assert.equal(dataset.unitReview.historicalParserScaleFactor, 0.001);
  assert.equal(dataset.unitReview.publishedScaleFactor, 1);
  assert.match(dataset.unitReview.authorityBoundary, /not surveyed, as-built, experimental or engineering-authoritative/);
  assert.deepEqual(dataset.publication.publishedCellRanges, ['side_flange!A:E', 'mid_flange!A:F']);
  assert.deepEqual(dataset.publication.omittedSheets, ['Sheet3']);
  assert.equal(dataset.publication.sourceWorkbookIncluded, false);
  assert.equal(dataset.publication.helperColumnsIncluded, false);
  assert.equal(dataset.publication.formulasPublished, false);
  assert.equal(dataset.publication.embeddedImagesIncluded, false);
  assert.equal(dataset.publication.engineeringUseAllowed, false);
  const radii = dataset.records.map((record) => Math.hypot(record.diagViewMetres[0], record.diagViewMetres[1]));
  assert.ok(Math.min(...radii) >= 0.8, 'the historical erroneous /1000 scale must not survive');
});

test('the typed parser fails closed on provenance, metadata, ordering, scaling and unknown-field drift', async () => {
  const raw = await loadRaw();
  type MutableDataset = {
    source: { sha256: string };
    unitReview: { publishedScaleFactor: number };
    formulaReview: { s2RepairedCells: string[] };
    records: Array<{ diagViewMetres: number[]; webMetres: number[]; surprise?: boolean }>;
    surprise?: boolean;
  };
  const mutations: Array<(value: MutableDataset) => void> = [
    (value) => { value.source.sha256 = '0'.repeat(64); },
    (value) => { value.unitReview.publishedScaleFactor = 0.001; },
    (value) => { value.formulaReview.s2RepairedCells.pop(); },
    (value) => { value.records[36].diagViewMetres[0] /= 1000; },
    (value) => { value.records[0].webMetres[0] += 0.01; },
    (value) => { value.records.reverse(); },
    (value) => { value.records[0].surprise = true; },
    (value) => { value.surprise = true; },
  ];
  for (const mutate of mutations) {
    const candidate = clone(raw) as MutableDataset;
    mutate(candidate);
    assert.throws(() => parseExl50uDiagView2PortDataset(candidate));
  }
});

test('manifest binds exact public bytes and repeats the non-authoritative audit contract', async () => {
  const datasetBytes = await readFile(datasetPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.dataset.path, EXL50U_DIAGVIEW2_PORT_DATASET_URL);
  assert.equal(manifest.dataset.schemaVersion, EXL50U_DIAGVIEW2_PORT_SCHEMA_VERSION);
  assert.equal(manifest.dataset.bytes, datasetBytes.length);
  assert.equal(manifest.dataset.sha256, createHash('sha256').update(datasetBytes).digest('hex').toUpperCase());
  assert.equal(manifest.dataset.recordCount, 84);
  assert.deepEqual(manifest.source, EXL50U_DIAGVIEW2_PORT_SOURCE);
  assert.equal(manifest.publication.sourceWorkbookIncluded, false);
  assert.equal(manifest.publication.helperColumnsIncluded, false);
  assert.equal(manifest.unitReview.publishedScaleFactor, 1);
  assert.deepEqual(manifest.formulaReview.s2RepairedCells, ['C4', 'C6', 'C8', 'C10', 'C12']);
});
