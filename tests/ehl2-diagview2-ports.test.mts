import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildDiagView2PortDataset,
  extractDiagView2PortRecords,
  SOURCE_XLSX_BYTES,
  SOURCE_XLSX_SHA256,
} from '../scripts/ehl2/build_diagview2_ports.mjs';
import {
  EHL2_DIAGVIEW2_PORT_DATASET_URL,
  EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION,
  EHL2_DIAGVIEW2_PORT_SOURCE,
  parseEhl2DiagView2PortDataset,
  portById,
  type Ehl2DiagView2PortDataset,
  type Ehl2DiagView2Tuple,
} from '../app/components/device-viewer/ehl2DiagView2Ports.ts';

const assetPath = new URL(
  '../public/models/ehl2-preliminary-v1/diagview2-ports.json',
  import.meta.url,
);
const manifestPath = new URL(
  '../public/models/ehl2-preliminary-v1/model-manifest.json',
  import.meta.url,
);

function approximate(actual: readonly number[], expected: readonly number[], tolerance = 2e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= tolerance,
      `${value} != ${expected[index]} at component ${index}`,
    );
  });
}

function allNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(allNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allNumbers);
  return [];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function loadRaw() {
  return JSON.parse(await readFile(assetPath, 'utf8')) as Record<string, unknown>;
}

async function loadDataset() {
  return parseEhl2DiagView2PortDataset(await loadRaw());
}

test('the public numeric dataset is pinned to the exact historical workbook provenance', async () => {
  const dataset = await loadDataset();
  assert.equal(dataset.schemaVersion, EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION);
  assert.equal(dataset.recordCount, 41);
  assert.deepEqual(dataset.sectionCounts, { S1: 16, S2: 13, S3: 12 });
  assert.deepEqual(dataset.source, EHL2_DIAGVIEW2_PORT_SOURCE);
  assert.equal(dataset.source.byteLength, SOURCE_XLSX_BYTES);
  assert.equal(dataset.source.sha256, SOURCE_XLSX_SHA256);
  assert.deepEqual(dataset.publication, {
    publicNumericTableOnly: true,
    sourceWorkbookIncluded: false,
    embeddedWorkbookImageIncluded: false,
    engineeringUseAllowed: false,
  });
  assert.equal(EHL2_DIAGVIEW2_PORT_DATASET_URL, '/models/ehl2-preliminary-v1/diagview2-ports.json');
});

test('all 41 workbook rows survive with exact keys, row references and finite normalized geometry', async () => {
  const dataset = await loadDataset();
  assert.equal(new Set(dataset.records.map((record) => record.id)).size, 41);
  assert.deepEqual(
    dataset.records.slice(0, 4).map((record) => [record.id, record.sourceCellRange]),
    [
      ['S1@0', 'side_flange!A2:E2'],
      ['S1@22.5', 'side_flange!A3:E3'],
      ['S1@45', 'side_flange!A4:E4'],
      ['S1@67.5', 'side_flange!A5:E5'],
    ],
  );
  assert.equal(dataset.records[15].sourceCellRange, 'side_flange!A17:E17');
  assert.equal(dataset.records[16].sourceCellRange, 'side_flange!A18:E18');
  assert.equal(dataset.records[27].sourceCellRange, 'side_flange!A29:E29');
  assert.equal(dataset.records[28].sourceCellRange, 'mid_flange!A2:F2');
  assert.equal(dataset.records[40].sourceCellRange, 'mid_flange!A14:F14');

  assert.ok(allNumbers(dataset.records).every(Number.isFinite));
  for (const record of dataset.records) {
    approximate(record.webMetres, [
      record.diagViewMetres[0],
      record.diagViewMetres[2],
      -record.diagViewMetres[1],
    ]);
    approximate(record.webNormal, [
      record.diagViewNormal[0],
      record.diagViewNormal[2],
      -record.diagViewNormal[1],
    ]);
    assert.ok(Math.abs(Math.hypot(...record.diagViewNormal) - 1) < 2e-10);
    assert.ok(Math.abs(Math.hypot(...record.webNormal) - 1) < 2e-10);
  }
});

test('representative upper, middle and lower ports reproduce DiagView2 coordinates in the web frame', async () => {
  const dataset = await loadDataset();
  const examples: ReadonlyArray<[string, Ehl2DiagView2Tuple, Ehl2DiagView2Tuple]> = [
    ['S1@0', [3.789, 2.101, 0], [-Math.sqrt(3) / 2, -0.5, 0]],
    ['S1@270', [0, 2.101, 3.789], [0, -0.5, -Math.sqrt(3) / 2]],
    ['S3@22.5', [3.500579548685, -2.101, -1.449987525231], [-0.800103145191, 0.5, 0.331413574036]],
    ['S2@90', [0, 0, -4.115], [0, 0, 1]],
    ['S2@270', [0, 0, 4.12], [0, 0, -1]],
  ];
  for (const [id, position, normal] of examples) {
    const port = portById(dataset, id);
    assert.ok(port, `missing ${id}`);
    approximate(port.webMetres, position);
    approximate(port.webNormal, normal);
  }
});

test('the typed parser fails closed on source drift, row drift, count drift and non-finite geometry', async () => {
  const raw = await loadRaw();
  type MutablePortDataset = {
    source: { branchRevision: string; sha256: string };
    recordCount: number;
    records: Array<{
      sourceMm: { r?: number };
      webMetres: number[];
    }>;
  };
  for (const mutation of [
    (value: MutablePortDataset) => { value.source.branchRevision = '0'.repeat(40); },
    (value: MutablePortDataset) => { value.source.sha256 = '0'.repeat(64); },
    (value: MutablePortDataset) => { value.recordCount = 40; },
    (value: MutablePortDataset) => { value.records[0].sourceMm.r = 3790; },
    (value: MutablePortDataset) => { value.records[0].webMetres[0] = Number.NaN; },
    (value: MutablePortDataset) => { value.records.reverse(); },
  ]) {
    const candidate = clone(raw) as MutablePortDataset;
    mutation(candidate);
    assert.throws(() => parseEhl2DiagView2PortDataset(candidate));
  }
});

test('the manifest binds byte length and SHA-256 of the exact public port asset', async () => {
  const bytes = await readFile(assetPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const contract = manifest.diagnosticData?.ports;
  assert.equal(contract.path, EHL2_DIAGVIEW2_PORT_DATASET_URL);
  assert.equal(contract.format, 'application/json');
  assert.equal(contract.schemaVersion, EHL2_DIAGVIEW2_PORT_SCHEMA_VERSION);
  assert.equal(contract.bytes, bytes.length);
  assert.equal(contract.sha256, createHash('sha256').update(bytes).digest('hex').toUpperCase());
  assert.equal(contract.recordCount, 41);
  assert.deepEqual(contract.sectionCounts, { S1: 16, S2: 13, S3: 12 });
  assert.deepEqual(contract.source, EHL2_DIAGVIEW2_PORT_SOURCE);
});

test('neither the published dataset nor its manifest leaks the source workbook or a workstation path', async () => {
  const text = `${await readFile(assetPath, 'utf8')}\n${await readFile(manifestPath, 'utf8')}`;
  assert.doesNotMatch(text, /[A-Za-z]:(?:\\|\/(?!\/))/);
  assert.doesNotMatch(text, /file:\/\//i);
  assert.doesNotMatch(text, /(?:Users|home)[\\/][^"\s]+/i);
  assert.doesNotMatch(text, /EHL2_position\.xlsx["']?\s*:\s*["']?[A-Za-z]:/i);
  assert.doesNotMatch(text, /xl\/media\/image1\.png/i);
});

// Small in-memory XLSX writer for exercising the builder's structural gates.
// CRC fields are zero because the reviewed parser trusts them only after the
// complete source workbook has passed its pinned SHA-256 gate.
function storedZip(entries: ReadonlyArray<readonly [string, string]>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name);
    const payload = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(payload.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + payload.length;
  }
  const centralOffset = localOffset;
  const centralBytes = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

function workbookFixture(dataset: Ehl2DiagView2PortDataset, options?: { badHeader?: boolean; duplicate?: boolean }) {
  const strings = ['Name', 'Angle', 'R', 'Z', 'Theta', 'S1', 'S3', 'X', 'Y', 'S2'];
  const shared = `<sst>${strings.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`;
  const stringIndex = new Map(strings.map((value, index) => [value, index]));
  const stringCell = (ref: string, value: string) => `<c r="${ref}" t="s"><v>${stringIndex.get(value)}</v></c>`;
  const numberCell = (ref: string, value: number) => `<c r="${ref}"><v>${value}</v></c>`;
  const headers = (values: string[]) => `<row>${values.map((value, index) => stringCell(`${String.fromCharCode(65 + index)}1`, value)).join('')}</row>`;
  const sideRecords = dataset.records.filter((record) => record.flangeType === 'side_flange');
  const sideRows = sideRecords.map((record, index) => {
    const source = record.sourceMm as { r: number; z: number };
    const angle = options?.duplicate && index === 1 ? sideRecords[0].azimuthDeg : record.azimuthDeg;
    return `<row>${stringCell(`A${index + 2}`, record.section)}${numberCell(`B${index + 2}`, angle)}${numberCell(`C${index + 2}`, source.r)}${numberCell(`D${index + 2}`, source.z)}${numberCell(`E${index + 2}`, record.poloidalNormalDeg)}</row>`;
  }).join('');
  const midRecords = dataset.records.filter((record) => record.flangeType === 'mid_flange');
  const midRows = midRecords.map((record, index) => {
    const source = record.sourceMm as { x: number; y: number; z: number };
    return `<row>${stringCell(`A${index + 2}`, 'S2')}${numberCell(`B${index + 2}`, record.azimuthDeg)}${numberCell(`C${index + 2}`, source.x)}${numberCell(`D${index + 2}`, source.y)}${numberCell(`E${index + 2}`, source.z)}${numberCell(`F${index + 2}`, record.poloidalNormalDeg)}</row>`;
  }).join('');
  const workbook = '<workbook><sheets><sheet name="side_flange" r:id="rId1"/><sheet name="mid_flange" r:id="rId2"/><sheet name="Sheet3" r:id="rId3"/></sheets></workbook>';
  const relationships = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>';
  return storedZip([
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', relationships],
    ['xl/sharedStrings.xml', shared],
    ['xl/worksheets/sheet1.xml', `<worksheet><sheetData>${headers(options?.badHeader ? ['Theta', 'Angle', 'R', 'Z', 'Theta'] : ['Name', 'Angle', 'R', 'Z', 'Theta'])}${sideRows}</sheetData></worksheet>`],
    ['xl/worksheets/sheet2.xml', `<worksheet><sheetData>${headers(['Name', 'Angle', 'X', 'Y', 'Z', 'Theta'])}${midRows}</sheetData></worksheet>`],
    ['xl/worksheets/sheet3.xml', '<worksheet><sheetData/></worksheet>'],
  ]);
}

test('the builder extracts the 41-row table and its structural gates reject header and key drift', async () => {
  const dataset = await loadDataset();
  const fixture = workbookFixture(dataset);
  const extracted = extractDiagView2PortRecords(fixture);
  assert.equal(extracted.length, 41);
  assert.deepEqual(extracted.map((record) => record.id), dataset.records.map((record) => record.id));
  assert.throws(() => extractDiagView2PortRecords(workbookFixture(dataset, { badHeader: true })), /headers must be exactly/);
  assert.throws(() => extractDiagView2PortRecords(workbookFixture(dataset, { duplicate: true })), /duplicate flange key/);
  assert.throws(() => buildDiagView2PortDataset(fixture), /byte length must be/,
    'the publishable builder must reject an unpinned workbook even when its rows are structurally valid');
});
