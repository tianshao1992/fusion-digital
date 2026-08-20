#!/usr/bin/env node

/**
 * Build the public EHL-2 DiagView2 flange/port dataset from the reviewed
 * historical workbook. The workbook itself is a controlled input and is not
 * copied into the public site.
 *
 * Usage:
 *   node scripts/ehl2/build_diagview2_ports.mjs <EHL2_position.xlsx> <output.json>
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const DIAGVIEW2_BRANCH = 'origin/digView2';
export const DIAGVIEW2_BRANCH_REVISION = '868d74d5e0e6c9abaec0eb623bcdd13ead771c79';
export const SOURCE_DATA_COMMIT = '94c1a21285b5a832beea24d94066f8cdb4873eee';
export const SOURCE_INTRODUCED_COMMIT = '42973f14913f80fb9fd35c51f971005ee46aa1aa';
export const SOURCE_GIT_BLOB_SHA1 = 'a2dd0fb815612b2c4735a39ff6d1e0a51c9dbdb5';
export const SOURCE_XLSX_BYTES = 1_364_538;
export const SOURCE_XLSX_SHA256 = '159DC5D5E2718A84C76AAF479D6AD14B8A2D3E1FDA8B77BF5EBA389D3AFC5ABC';
export const PORT_SCHEMA_VERSION = 'fusiondigital.ehl2.diagview2-ports.v1';

const EXPECTED_SHEETS = ['side_flange', 'mid_flange', 'Sheet3'];
const EXPECTED_HEADERS = Object.freeze({
  side_flange: ['Name', 'Angle', 'R', 'Z', 'Theta'],
  mid_flange: ['Name', 'Angle', 'X', 'Y', 'Z', 'Theta'],
});
const EXPECTED_SECTION_COUNTS = Object.freeze({ S1: 16, S2: 13, S3: 12 });

function fail(message) {
  throw new Error(`EHL2_position.xlsx: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function decodeXmlEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (token, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[entity]) return named[entity];
    const codePoint = entity.startsWith('#x')
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    if (!Number.isSafeInteger(codePoint)) fail(`invalid XML entity ${token}`);
    return String.fromCodePoint(codePoint);
  });
}

function xmlAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`).exec(tag);
  return match ? decodeXmlEntities(match[1]) : null;
}

function unzipEntries(bytes) {
  const minimumEocdBytes = 22;
  const maximumCommentBytes = 65_535;
  let eocd = -1;
  for (
    let offset = bytes.length - minimumEocdBytes;
    offset >= Math.max(0, bytes.length - minimumEocdBytes - maximumCommentBytes);
    offset -= 1
  ) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) fail('ZIP end-of-central-directory record is missing');
  if (bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) {
    fail('multi-disk ZIP workbooks are not supported');
  }
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralBytes = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (centralOffset + centralBytes > eocd) fail('ZIP central directory exceeds the container');

  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      fail(`invalid ZIP central-directory entry ${index}`);
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedBytes = bytes.readUInt32LE(offset + 20);
    const uncompressedBytes = bytes.readUInt32LE(offset + 24);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const commentBytes = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameBytes;
    if (nameEnd + extraBytes + commentBytes > bytes.length) fail('ZIP entry metadata is truncated');
    if ((flags & 0x1) !== 0) fail('encrypted workbook entries are not supported');
    const name = bytes.subarray(nameStart, nameEnd).toString('utf8').replaceAll('\\', '/');
    if (entries.has(name)) fail(`duplicate ZIP entry ${name}`);
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      fail(`invalid local ZIP header for ${name}`);
    }
    const localNameBytes = bytes.readUInt16LE(localOffset + 26);
    const localExtraBytes = bytes.readUInt16LE(localOffset + 28);
    const payloadStart = localOffset + 30 + localNameBytes + localExtraBytes;
    const payloadEnd = payloadStart + compressedBytes;
    if (payloadEnd > bytes.length) fail(`compressed payload for ${name} is truncated`);
    const payload = bytes.subarray(payloadStart, payloadEnd);
    let output;
    if (compression === 0) output = Buffer.from(payload);
    else if (compression === 8) output = inflateRawSync(payload);
    else fail(`unsupported ZIP compression method ${compression} for ${name}`);
    if (output.length !== uncompressedBytes) fail(`uncompressed byte length mismatch for ${name}`);
    entries.set(name, output);
    offset = nameEnd + extraBytes + commentBytes;
  }
  if (offset !== centralOffset + centralBytes) fail('ZIP central-directory size mismatch');
  return entries;
}

function requiredEntry(entries, name) {
  const entry = entries.get(name);
  if (!entry) fail(`required workbook entry ${name} is missing`);
  return entry.toString('utf8');
}

function parseSharedStrings(xml) {
  const values = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const fragments = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((item) => decodeXmlEntities(item[1]));
    values.push(fragments.join(''));
  }
  return values;
}

function parseWorkbook(entries) {
  const workbook = requiredEntry(entries, 'xl/workbook.xml');
  const relationships = requiredEntry(entries, 'xl/_rels/workbook.xml.rels');
  const relationTargets = new Map();
  for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
    const id = xmlAttribute(match[0], 'Id');
    const target = xmlAttribute(match[0], 'Target');
    if (id && target) relationTargets.set(id, target);
  }
  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?\s*>/g)) {
    const name = xmlAttribute(match[0], 'name');
    const relationshipId = xmlAttribute(match[0], 'r:id');
    if (!name || !relationshipId) fail('workbook sheet metadata is incomplete');
    const target = relationTargets.get(relationshipId);
    if (!target) fail(`workbook relationship ${relationshipId} is missing`);
    const normalized = target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`;
    sheets.push({ name, path: normalized });
  }
  if (JSON.stringify(sheets.map((sheet) => sheet.name)) !== JSON.stringify(EXPECTED_SHEETS)) {
    fail(`expected sheets ${EXPECTED_SHEETS.join(', ')}`);
  }
  return sheets;
}

function parseWorksheet(xml, sharedStrings, sheetName) {
  if (/<f(?:\s|>)/.test(xml)) fail(`${sheetName} must not contain formulas`);
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const cellTag = `<c ${cellMatch[1]}>`;
      const reference = xmlAttribute(cellTag, 'r');
      if (!reference) fail(`${sheetName} contains a cell without a reference`);
      const column = /^([A-Z]+)\d+$/.exec(reference)?.[1];
      if (!column || column.length !== 1) fail(`${sheetName} contains an unsupported cell ${reference}`);
      const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellMatch[2]);
      if (!valueMatch) continue;
      const type = xmlAttribute(cellTag, 't');
      let value;
      if (type === 's') {
        const index = Number(valueMatch[1]);
        value = sharedStrings[index];
        if (value === undefined) fail(`${sheetName}!${reference} has an invalid shared-string index`);
      } else {
        value = Number(valueMatch[1]);
        if (!Number.isFinite(value)) fail(`${sheetName}!${reference} is not a finite number`);
      }
      cells.set(column, value);
    }
    if (cells.size > 0) rows.push(cells);
  }
  return rows;
}

function assertHeaders(sheetName, rows) {
  const expected = EXPECTED_HEADERS[sheetName];
  if (!expected || rows.length === 0) fail(`${sheetName} is empty`);
  const actual = expected.map((_, index) => rows[0].get(String.fromCharCode(65 + index)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${sheetName} headers must be exactly ${expected.join(', ')}`);
  }
  if (rows[0].size !== expected.length) fail(`${sheetName} contains unexpected header columns`);
}

function normalizedVector(vector) {
  const length = Math.hypot(...vector);
  if (!(length > 1e-12)) fail('derived normal is singular');
  return vector.map((value) => value / length);
}

function cleanNumber(value) {
  if (!Number.isFinite(value)) fail('derived geometry contains a non-finite number');
  if (Math.abs(value) < 5e-13) return 0;
  return Number(value.toFixed(12));
}

function cleanTuple(values) {
  return values.map(cleanNumber);
}

function diagViewToWeb(tuple) {
  return cleanTuple([tuple[0], tuple[2], -tuple[1]]);
}

function recordForSide(row, sourceRow) {
  const section = row.get('A');
  const azimuthDeg = row.get('B');
  const radiusMm = row.get('C');
  const zMm = row.get('D');
  const poloidalNormalDeg = row.get('E');
  if (typeof section !== 'string' || !['S1', 'S3'].includes(section)) {
    fail(`side_flange row ${sourceRow} has an unsupported section`);
  }
  if (![azimuthDeg, radiusMm, zMm, poloidalNormalDeg].every(Number.isFinite) || row.size !== 5) {
    fail(`side_flange row ${sourceRow} does not match Name,Angle,R,Z,Theta`);
  }
  const phi = azimuthDeg * Math.PI / 180;
  const theta = poloidalNormalDeg * Math.PI / 180;
  const diagViewMetres = cleanTuple([
    radiusMm * Math.cos(phi) / 1000,
    radiusMm * Math.sin(phi) / 1000,
    zMm / 1000,
  ]);
  const diagViewNormal = cleanTuple(normalizedVector([
    Math.cos(theta) * Math.cos(phi),
    Math.cos(theta) * Math.sin(phi),
    Math.sin(theta),
  ]));
  return {
    id: `${section}@${azimuthDeg}`,
    sourceCellRange: `side_flange!A${sourceRow}:E${sourceRow}`,
    section,
    flangeType: 'side_flange',
    azimuthDeg,
    poloidalNormalDeg,
    sourceMm: { r: radiusMm, z: zMm },
    diagViewMetres,
    diagViewNormal,
    webMetres: diagViewToWeb(diagViewMetres),
    webNormal: diagViewToWeb(diagViewNormal),
  };
}

function recordForMid(row, sourceRow) {
  const section = row.get('A');
  const azimuthDeg = row.get('B');
  const xMm = row.get('C');
  const yMm = row.get('D');
  const zMm = row.get('E');
  const poloidalNormalDeg = row.get('F');
  if (section !== 'S2') fail(`mid_flange row ${sourceRow} has an unsupported section`);
  if (![azimuthDeg, xMm, yMm, zMm, poloidalNormalDeg].every(Number.isFinite) || row.size !== 6) {
    fail(`mid_flange row ${sourceRow} does not match Name,Angle,X,Y,Z,Theta`);
  }
  const radialLength = Math.hypot(xMm, yMm);
  if (!(radialLength > 1e-9)) fail(`mid_flange row ${sourceRow} has no radial direction`);
  const theta = poloidalNormalDeg * Math.PI / 180;
  const diagViewMetres = cleanTuple([xMm / 1000, yMm / 1000, zMm / 1000]);
  const diagViewNormal = cleanTuple(normalizedVector([
    Math.cos(theta) * xMm / radialLength,
    Math.cos(theta) * yMm / radialLength,
    Math.sin(theta),
  ]));
  return {
    id: `${section}@${azimuthDeg}`,
    sourceCellRange: `mid_flange!A${sourceRow}:F${sourceRow}`,
    section,
    flangeType: 'mid_flange',
    azimuthDeg,
    poloidalNormalDeg,
    sourceMm: { x: xMm, y: yMm, z: zMm },
    diagViewMetres,
    diagViewNormal,
    webMetres: diagViewToWeb(diagViewMetres),
    webNormal: diagViewToWeb(diagViewNormal),
  };
}

function assertDatasetRows(records) {
  if (records.length !== 41) fail(`expected 41 flange records, received ${records.length}`);
  const ids = new Set();
  const counts = { S1: 0, S2: 0, S3: 0 };
  for (const record of records) {
    if (ids.has(record.id)) fail(`duplicate flange key ${record.id}`);
    ids.add(record.id);
    counts[record.section] += 1;
  }
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_SECTION_COUNTS)) {
    fail(`section counts do not match ${JSON.stringify(EXPECTED_SECTION_COUNTS)}`);
  }
}

export function extractDiagView2PortRecords(xlsxBytes) {
  const bytes = Buffer.isBuffer(xlsxBytes) ? xlsxBytes : Buffer.from(xlsxBytes);
  const entries = unzipEntries(bytes);
  const sheets = parseWorkbook(entries);
  const sharedStrings = parseSharedStrings(requiredEntry(entries, 'xl/sharedStrings.xml'));
  const parsed = new Map();
  for (const sheet of sheets) {
    parsed.set(
      sheet.name,
      parseWorksheet(requiredEntry(entries, sheet.path), sharedStrings, sheet.name),
    );
  }
  const sideRows = parsed.get('side_flange');
  const midRows = parsed.get('mid_flange');
  const unusedRows = parsed.get('Sheet3');
  assertHeaders('side_flange', sideRows);
  assertHeaders('mid_flange', midRows);
  if (unusedRows.length !== 0) fail('Sheet3 must not contain published numeric records');

  const records = [
    ...sideRows.slice(1).map((row, index) => recordForSide(row, index + 2)),
    ...midRows.slice(1).map((row, index) => recordForMid(row, index + 2)),
  ];
  assertDatasetRows(records);
  return records;
}

export function buildDiagView2PortDataset(xlsxBytes) {
  const bytes = Buffer.isBuffer(xlsxBytes) ? xlsxBytes : Buffer.from(xlsxBytes);
  if (bytes.length !== SOURCE_XLSX_BYTES) fail(`byte length must be ${SOURCE_XLSX_BYTES}`);
  const digest = sha256(bytes);
  if (digest !== SOURCE_XLSX_SHA256) fail(`SHA-256 must be ${SOURCE_XLSX_SHA256}`);
  const records = extractDiagView2PortRecords(bytes);

  return {
    schemaVersion: PORT_SCHEMA_VERSION,
    id: 'ehl2-diagview2-ports-v1',
    asOf: '2026-08-21',
    authority: 'historical-design-reference',
    source: {
      repository: 'DiagView',
      branch: DIAGVIEW2_BRANCH,
      branchRevision: DIAGVIEW2_BRANCH_REVISION,
      sourceDataCommit: SOURCE_DATA_COMMIT,
      introducedCommit: SOURCE_INTRODUCED_COMMIT,
      path: 'data/EHL2_position.xlsx',
      gitBlobSha1: SOURCE_GIT_BLOB_SHA1,
      byteLength: SOURCE_XLSX_BYTES,
      sha256: SOURCE_XLSX_SHA256,
    },
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
      normalConvention: 'n = cos(theta) * normalize([x, y, 0]) + sin(theta) * [0, 0, 1]',
    },
    offsetCompatibility: {
      mode: 'diagview2-apply_fine_tune-legacy-v1',
      sourceRevision: DIAGVIEW2_BRANCH_REVISION,
      localBasis: {
        normal: 'n',
        toroidal: 't_phi = [-sin(phi), cos(phi), 0]',
        poloidal: 't_theta = [-sin(theta)cos(phi), -sin(theta)sin(phi), cos(theta)]',
      },
      localOffsetMm: '(-dR * n + dY * t_phi + dZ * t_theta) / 1000',
      worldOffsetMm: '[dX_world, dY_world, dZ_world] / 1000',
      warning: 'The historical dR sign is retained only for DiagView2 configuration compatibility; it is not an independently surveyed engineering convention.',
    },
    recordCount: records.length,
    sectionCounts: { ...EXPECTED_SECTION_COUNTS },
    records,
  };
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    throw new Error('usage: node scripts/ehl2/build_diagview2_ports.mjs <EHL2_position.xlsx> <output.json>');
  }
  const sourcePath = resolve(input);
  const outputPath = resolve(output);
  const dataset = buildDiagView2PortDataset(await readFile(sourcePath));
  const serialized = `${JSON.stringify(dataset, null, 2)}\n`;
  await writeFile(outputPath, serialized, 'utf8');
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    source: sourcePath,
    output: outputPath,
    records: dataset.recordCount,
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(Buffer.from(serialized)),
  })}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
