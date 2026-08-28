#!/usr/bin/env node

/**
 * Build the public EXL-50U DiagView2 port dataset from one pinned historical
 * Git blob. The source workbook, its embedded image, Sheet3 and helper columns
 * are reviewed inputs only and are never copied to the public package.
 *
 * Usage:
 *   node scripts/exl50u/build_diagview2_ports.mjs
 *   node scripts/exl50u/build_diagview2_ports.mjs --check
 *   node scripts/exl50u/build_diagview2_ports.mjs --source-repository <path>
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const DIAGVIEW2_BRANCH = 'origin/digView2';
export const DIAGVIEW2_BRANCH_REVISION = '868d74d5e0e6c9abaec0eb623bcdd13ead771c79';
export const SOURCE_INTRODUCED_COMMIT = 'b8f04aff8d1b3c59d5ea95a20047eb9dd968ca23';
export const SOURCE_DELETED_COMMIT = '550e0801f56f110d58500b61a4415847755f4f30';
export const SOURCE_GIT_BLOB_SHA1 = '30817819689b9fff0cb047ba7deae6aa7cb0bdd0';
export const SOURCE_XLSX_BYTES = 1_365_912;
export const SOURCE_XLSX_SHA256 =
  '93395B12183048E65CCD9235D3C9F50098AC80F48A1949FB5205DA90EC28CDC6';
export const SOURCE_PARSER_GIT_BLOB_SHA1 = 'd005ccc306262ad785d589f45ac428efc4d5793f';
export const PORT_SCHEMA_VERSION = 'fusiondigital.exl50u.diagview2-ports.v1';
export const PACKAGE_SCHEMA_VERSION = 'fusiondigital.exl50u.diagview2-package-manifest.v1';

const SOURCE_PATH = 'data/EXL50U_position.xlsx';
const SOURCE_PARSER_PATH = 'src/data_parser.py';
const DATASET_ID = 'exl50u-diagview2-ports-v1';
const PACKAGE_ID = 'exl50u-diagview2-v1';
const AS_OF = '2026-08-28';
const DATASET_URL = '/models/exl50u-diagview2-v1/diagview2-ports.json';
const EXPECTED_SHEETS = Object.freeze(['side_flange', 'mid_flange', 'Sheet3']);
const EXPECTED_HEADERS = Object.freeze({
  side_flange: Object.freeze(['Name', 'Angle', 'R', 'Z', 'Theta']),
  mid_flange: Object.freeze(['Name', 'Angle', 'X', 'Y', 'Z', 'Theta']),
});
const SECTION_ORDER = Object.freeze(['U1', 'U2', 'S1', 'S2', 'S3', 'L1', 'L2']);
const SECTION_COUNTS = Object.freeze({ U1: 12, U2: 12, S1: 12, S2: 12, S3: 12, L1: 12, L2: 12 });
const BAD_S2_X_CELLS = Object.freeze(['C4', 'C6', 'C8', 'C10', 'C12']);
const CANONICAL_S2_RADIUS_METRES = 1.841;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..', '..');
export const DEFAULT_SOURCE_REPOSITORY = resolve(
  REPOSITORY_ROOT,
  '..',
  '..',
  '.tmp',
  'DiagView-digView2',
);
const DEFAULT_OUTPUT_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  'public',
  'models',
  'exl50u-diagview2-v1',
);

function fail(message) {
  throw new Error(`EXL50U_position.xlsx: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function gitBlobSha1(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function gitText(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  }).trim();
}

function gitBytes(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], {
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

function close(actual, expected, label, tolerance = 2e-10) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    fail(`${label} must equal ${expected} within ${tolerance}, received ${actual}`);
  }
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
  exact(
    JSON.stringify(sheets.map((sheet) => sheet.name)),
    JSON.stringify(EXPECTED_SHEETS),
    'sheet order',
  );
  return sheets;
}

function parseFormula(body) {
  const empty = /<f\b([^>]*)\/>/.exec(body);
  const full = empty ? null : /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(body);
  const match = full ?? empty;
  if (!match) return null;
  const tag = `<f ${match[1]}>`;
  return {
    text: full ? decodeXmlEntities(full[2]) : '',
    type: xmlAttribute(tag, 't'),
    sharedIndex: xmlAttribute(tag, 'si'),
    reference: xmlAttribute(tag, 'ref'),
  };
}

function parseWorksheet(xml, sharedStrings, sheetName) {
  const rows = new Map();
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowTag = `<row ${rowMatch[1]}>`;
    const rowNumber = Number(xmlAttribute(rowTag, 'r'));
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1 || rows.has(rowNumber)) {
      fail(`${sheetName} contains an invalid or duplicate row number`);
    }
    const cells = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellTag = `<c ${cellMatch[1]}>`;
      const reference = xmlAttribute(cellTag, 'r');
      const parsedReference = reference && /^([A-Z]+)(\d+)$/.exec(reference);
      if (!parsedReference || Number(parsedReference[2]) !== rowNumber) {
        fail(`${sheetName} contains an invalid cell reference ${reference ?? '(missing)'}`);
      }
      const column = parsedReference[1];
      if (cells.has(column)) fail(`${sheetName}!${reference} is duplicated`);
      const body = cellMatch[2] ?? '';
      const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
      const type = xmlAttribute(cellTag, 't');
      let value;
      if (valueMatch && type === 's') {
        const index = Number(valueMatch[1]);
        value = sharedStrings[index];
        if (value === undefined) fail(`${sheetName}!${reference} has an invalid shared-string index`);
      } else if (valueMatch) {
        value = Number(valueMatch[1]);
        if (!Number.isFinite(value)) fail(`${sheetName}!${reference} is not a finite number`);
      }
      cells.set(column, { reference, value, formula: parseFormula(body) });
    }
    rows.set(rowNumber, cells);
  }
  return rows;
}

function cellAt(rows, rowNumber, column, sheetName) {
  const cell = rows.get(rowNumber)?.get(column);
  if (!cell) fail(`${sheetName}!${column}${rowNumber} is missing`);
  return cell;
}

function numberAt(rows, rowNumber, column, sheetName) {
  const cell = cellAt(rows, rowNumber, column, sheetName);
  if (typeof cell.value !== 'number' || !Number.isFinite(cell.value)) {
    fail(`${sheetName}!${column}${rowNumber} must be numeric`);
  }
  return cell.value;
}

function stringAt(rows, rowNumber, column, sheetName) {
  const cell = cellAt(rows, rowNumber, column, sheetName);
  if (typeof cell.value !== 'string') fail(`${sheetName}!${column}${rowNumber} must be text`);
  return cell.value;
}

function assertHeaders(sheetName, rows) {
  const expected = EXPECTED_HEADERS[sheetName];
  if (!expected) fail(`no header contract exists for ${sheetName}`);
  const actual = expected.map((_, index) =>
    stringAt(rows, 1, String.fromCharCode(65 + index), sheetName));
  exact(JSON.stringify(actual), JSON.stringify(expected), `${sheetName} headers`);
  for (let index = 0; index < expected.length; index += 1) {
    if (cellAt(rows, 1, String.fromCharCode(65 + index), sheetName).formula) {
      fail(`${sheetName} header cells must not contain formulas`);
    }
  }
}

function publicFormulaCells(rows, columns) {
  const result = [];
  for (const [rowNumber, cells] of rows) {
    for (const column of columns) {
      const cell = cells.get(column);
      if (cell?.formula) result.push(`${column}${rowNumber}`);
    }
  }
  return result;
}

function rowsWithPublicContent(rows, columns) {
  const result = [];
  for (const [rowNumber, cells] of rows) {
    if (columns.some((column) => {
      const cell = cells.get(column);
      return cell && (cell.value !== undefined || cell.formula);
    })) result.push(rowNumber);
  }
  return result;
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

function normalFor(azimuthDeg, poloidalNormalDeg) {
  const phi = azimuthDeg * Math.PI / 180;
  const theta = poloidalNormalDeg * Math.PI / 180;
  return cleanTuple(normalizedVector([
    Math.cos(theta) * Math.cos(phi),
    Math.cos(theta) * Math.sin(phi),
    Math.sin(theta),
  ]));
}

function recordForSide(rows, rowNumber) {
  const section = stringAt(rows, rowNumber, 'A', 'side_flange');
  const azimuthDeg = numberAt(rows, rowNumber, 'B', 'side_flange');
  const radiusMetres = numberAt(rows, rowNumber, 'C', 'side_flange');
  const zMetres = numberAt(rows, rowNumber, 'D', 'side_flange');
  const poloidalNormalDeg = numberAt(rows, rowNumber, 'E', 'side_flange');
  const phi = azimuthDeg * Math.PI / 180;
  const diagViewMetres = cleanTuple([
    radiusMetres * Math.cos(phi),
    radiusMetres * Math.sin(phi),
    zMetres,
  ]);
  const diagViewNormal = normalFor(azimuthDeg, poloidalNormalDeg);
  return {
    id: `${section}@${azimuthDeg}`,
    sourceCellRange: `side_flange!A${rowNumber}:E${rowNumber}`,
    section,
    flangeType: 'side_flange',
    azimuthDeg,
    poloidalNormalDeg,
    sourceAuthoredMetres: { r: radiusMetres, z: zMetres },
    diagViewMetres,
    diagViewNormal,
    webMetres: diagViewToWeb(diagViewMetres),
    webNormal: diagViewToWeb(diagViewNormal),
  };
}

function recordForS2(rows, rowNumber) {
  const section = stringAt(rows, rowNumber, 'A', 'mid_flange');
  const azimuthDeg = numberAt(rows, rowNumber, 'B', 'mid_flange');
  const zMetres = numberAt(rows, rowNumber, 'E', 'mid_flange');
  const poloidalNormalDeg = numberAt(rows, rowNumber, 'F', 'mid_flange');
  exact(section, 'S2', `mid_flange!A${rowNumber}`);
  const phi = azimuthDeg * Math.PI / 180;
  const xMetres = cleanNumber(CANONICAL_S2_RADIUS_METRES * Math.cos(phi));
  const yMetres = cleanNumber(CANONICAL_S2_RADIUS_METRES * Math.sin(phi));
  const diagViewMetres = cleanTuple([xMetres, yMetres, zMetres]);
  const diagViewNormal = normalFor(azimuthDeg, poloidalNormalDeg);
  return {
    id: `${section}@${azimuthDeg}`,
    sourceCellRange: `mid_flange!A${rowNumber}:F${rowNumber}`,
    section,
    flangeType: 'mid_flange',
    azimuthDeg,
    poloidalNormalDeg,
    sourceAuthoredMetres: { x: xMetres, y: yMetres, z: zMetres },
    diagViewMetres,
    diagViewNormal,
    webMetres: diagViewToWeb(diagViewMetres),
    webNormal: diagViewToWeb(diagViewNormal),
  };
}

function assertSourceRows(sideRows, midRows) {
  assertHeaders('side_flange', sideRows);
  assertHeaders('mid_flange', midRows);
  exact(
    JSON.stringify(rowsWithPublicContent(sideRows, ['A', 'B', 'C', 'D', 'E'])),
    JSON.stringify(Array.from({ length: 73 }, (_, index) => index + 1)),
    'side_flange public row numbers',
  );
  exact(
    JSON.stringify(rowsWithPublicContent(midRows, ['A', 'B', 'C', 'D', 'E', 'F'])),
    JSON.stringify(Array.from({ length: 13 }, (_, index) => index + 1)),
    'mid_flange public row numbers',
  );

  const sideSections = [
    ['U1', 2, 1.43982, 1.8165, 270],
    ['U2', 14, 1.43982, 1.60099, 220],
    ['S1', 26, 1.841, 0.9, 180],
    ['S3', 38, 1.841, -0.9, 180],
    ['L1', 50, 1.43982, -1.8165, 130],
    ['L2', 62, 0.8, -1.8165, 90],
  ];
  for (const [section, startRow, radius, z, theta] of sideSections) {
    for (let index = 0; index < 12; index += 1) {
      const row = startRow + index;
      exact(stringAt(sideRows, row, 'A', 'side_flange'), section, `side_flange!A${row}`);
      exact(numberAt(sideRows, row, 'B', 'side_flange'), index * 30, `side_flange!B${row}`);
      exact(numberAt(sideRows, row, 'C', 'side_flange'), radius, `side_flange!C${row}`);
      exact(numberAt(sideRows, row, 'D', 'side_flange'), z, `side_flange!D${row}`);
      exact(numberAt(sideRows, row, 'E', 'side_flange'), theta, `side_flange!E${row}`);
    }
  }
  for (let index = 0; index < 12; index += 1) {
    const row = index + 2;
    exact(stringAt(midRows, row, 'A', 'mid_flange'), 'S2', `mid_flange!A${row}`);
    exact(numberAt(midRows, row, 'B', 'mid_flange'), index * 30, `mid_flange!B${row}`);
    exact(numberAt(midRows, row, 'E', 'mid_flange'), 0, `mid_flange!E${row}`);
    exact(numberAt(midRows, row, 'F', 'mid_flange'), 180, `mid_flange!F${row}`);
  }
}

function assertFormulaReview(sideRows, midRows) {
  exact(
    JSON.stringify(publicFormulaCells(sideRows, ['A', 'B', 'C', 'D', 'E'])),
    JSON.stringify(['D26']),
    'side_flange formula cells in A:E',
  );
  const sideFormula = cellAt(sideRows, 26, 'D', 'side_flange').formula;
  exact(sideFormula?.text, '(1.1485+0.6515)/2', 'side_flange!D26 formula');
  exact(sideFormula?.type, null, 'side_flange!D26 formula type');
  exact(sideFormula?.sharedIndex, null, 'side_flange!D26 shared formula index');
  exact(sideFormula?.reference, null, 'side_flange!D26 formula reference');
  exact(numberAt(sideRows, 26, 'D', 'side_flange'), 0.9, 'side_flange!D26 cached value');
  for (let row = 27; row <= 37; row += 1) {
    exact(numberAt(sideRows, row, 'D', 'side_flange'), 0.9, `side_flange!D${row}`);
  }

  const expectedMidFormulaCells = [];
  for (let row = 2; row <= 13; row += 1) expectedMidFormulaCells.push(`C${row}`, `D${row}`);
  exact(
    JSON.stringify(publicFormulaCells(midRows, ['A', 'B', 'C', 'D', 'E', 'F'])),
    JSON.stringify(expectedMidFormulaCells),
    'mid_flange formula cells in A:F',
  );
  exact(numberAt(midRows, 2, 'H', 'mid_flange'), CANONICAL_S2_RADIUS_METRES, 'reviewed S2 radius');
  if (cellAt(midRows, 2, 'H', 'mid_flange').formula) fail('mid_flange!H2 radius must be a literal review input');

  for (let row = 2; row <= 13; row += 1) {
    const angle = numberAt(midRows, row, 'B', 'mid_flange');
    const expectedX = CANONICAL_S2_RADIUS_METRES * Math.cos(angle * Math.PI / 180);
    const expectedY = CANONICAL_S2_RADIUS_METRES * Math.sin(angle * Math.PI / 180);
    const xCell = cellAt(midRows, row, 'C', 'mid_flange');
    const yCell = cellAt(midRows, row, 'D', 'mid_flange');
    const isBadX = BAD_S2_X_CELLS.includes(`C${row}`);
    const expectedXFormula = isBadX
      ? `$H$2*COS(B${row}/PI()*180)`
      : `$H$2*COS(B${row}/180*PI())`;
    exact(xCell.formula?.text, expectedXFormula, `mid_flange!C${row} formula`);
    if (isBadX) {
      if (Math.abs(xCell.value - expectedX) < 1e-3) {
        fail(`mid_flange!C${row} bad-formula cache unexpectedly matches the canonical radius`);
      }
    } else {
      close(xCell.value, expectedX, `mid_flange!C${row} reviewed cache`, 5e-12);
    }
    if (row === 2) {
      exact(yCell.formula?.text, '$H$2*SIN(B2/180*PI())', 'mid_flange!D2 formula');
      exact(yCell.formula?.type, null, 'mid_flange!D2 formula type');
      exact(yCell.formula?.sharedIndex, null, 'mid_flange!D2 shared formula index');
      exact(yCell.formula?.reference, null, 'mid_flange!D2 formula reference');
    } else if (row === 3) {
      exact(yCell.formula?.text, '$H$2*SIN(B3/180*PI())', 'mid_flange!D3 formula');
      exact(yCell.formula?.type, 'shared', 'mid_flange!D3 formula type');
      exact(yCell.formula?.sharedIndex, '0', 'mid_flange!D3 shared formula index');
      exact(yCell.formula?.reference, 'D3:D13', 'mid_flange!D3 shared formula reference');
    } else {
      exact(yCell.formula?.text, '', `mid_flange!D${row} shared formula text`);
      exact(yCell.formula?.type, 'shared', `mid_flange!D${row} formula type`);
      exact(yCell.formula?.sharedIndex, '0', `mid_flange!D${row} shared formula index`);
      exact(yCell.formula?.reference, null, `mid_flange!D${row} shared formula reference`);
    }
    close(yCell.value, expectedY, `mid_flange!D${row} reviewed cache`, 5e-12);
  }
}

function sourceContract() {
  return {
    repository: 'DiagView',
    branch: DIAGVIEW2_BRANCH,
    branchRevision: DIAGVIEW2_BRANCH_REVISION,
    sourceDataCommit: SOURCE_INTRODUCED_COMMIT,
    introducedCommit: SOURCE_INTRODUCED_COMMIT,
    deletedCommit: SOURCE_DELETED_COMMIT,
    path: SOURCE_PATH,
    gitBlobSha1: SOURCE_GIT_BLOB_SHA1,
    byteLength: SOURCE_XLSX_BYTES,
    sha256: SOURCE_XLSX_SHA256,
  };
}

function publicationContract() {
  return {
    publishedCellRanges: ['side_flange!A:E', 'mid_flange!A:F'],
    omittedSheets: ['Sheet3'],
    sourceWorkbookIncluded: false,
    helperColumnsIncluded: false,
    formulasPublished: false,
    embeddedImagesIncluded: false,
    engineeringUseAllowed: false,
  };
}

function unitReviewContract() {
  return {
    sourceAuthoredUnit: 'metre',
    historicalParserAssumption: 'millimetre',
    historicalParserScaleFactor: 0.001,
    publishedScaleFactor: 1,
    historicalParser: {
      path: SOURCE_PARSER_PATH,
      gitBlobSha1: SOURCE_PARSER_GIT_BLOB_SHA1,
    },
    decision: 'Publish the workbook numeric coordinates at authored metre scale; reject the historical unconditional /1000 conversion.',
    rationale: 'The 0.8-1.841 coordinate magnitudes are metre-scale and align with the current metre-based public EXL-50U CAD; applying /1000 would collapse the ports by three orders of magnitude.',
    authorityBoundary: 'This is a reviewed compatibility correction for the current public metre-based CAD, not surveyed, as-built, experimental or engineering-authoritative geometry.',
  };
}

function formulaReviewContract() {
  return {
    s2CanonicalRadiusMetres: CANONICAL_S2_RADIUS_METRES,
    s2RecomputedCoordinates: ['X', 'Y'],
    s2RepairedCells: [...BAD_S2_X_CELLS],
    s2RejectedFormulaPattern: '$H$2*COS(Bn/PI()*180)',
    s2ReviewedFormulaPattern: '$H$2*COS(Bn/180*PI())',
    s2Decision: 'Recompute every S2 X/Y pair from azimuth and the reviewed 1.841 m canonical radius; never publish cached formula results.',
    sideReviewedCell: 'D26',
    sideReviewedFormula: '(1.1485+0.6515)/2',
    sideReviewedValueMetres: 0.9,
    sideDecision: 'Publish D26 only after verifying its cache equals 0.9 m and matches the remaining S1 Z constants D27:D37.',
  };
}

function coordinateSystemContract() {
  return {
    sourceUnit: 'metre',
    publishedUnit: 'metre',
    diagViewFrame: 'right-handed XYZ; Z vertical',
    webFrame: 'right-handed XYZ; Y vertical',
    diagViewToWebPoint: '[x, y, z] -> [x, z, -y]',
    diagViewToWebDirection: '[x, y, z] -> [x, z, -y]',
    normalConvention: 'n = cos(theta) * [cos(phi), sin(phi), 0] + sin(theta) * [0, 0, 1]',
  };
}

export function extractDiagView2PortRecords(xlsxBytes) {
  const bytes = Buffer.isBuffer(xlsxBytes) ? xlsxBytes : Buffer.from(xlsxBytes);
  const entries = unzipEntries(bytes);
  const sheets = parseWorkbook(entries);
  const sharedStrings = parseSharedStrings(requiredEntry(entries, 'xl/sharedStrings.xml'));
  const parsed = new Map();
  for (const sheet of sheets) {
    parsed.set(sheet.name, parseWorksheet(requiredEntry(entries, sheet.path), sharedStrings, sheet.name));
  }
  const sideRows = parsed.get('side_flange');
  const midRows = parsed.get('mid_flange');
  assertSourceRows(sideRows, midRows);
  assertFormulaReview(sideRows, midRows);

  const sideRecords = Array.from({ length: 72 }, (_, index) => recordForSide(sideRows, index + 2));
  const bySection = new Map(SECTION_ORDER.map((section) => [section, []]));
  for (const record of sideRecords) bySection.get(record.section)?.push(record);
  const s2Records = Array.from({ length: 12 }, (_, index) => recordForS2(midRows, index + 2));
  bySection.set('S2', s2Records);
  const records = SECTION_ORDER.flatMap((section) => bySection.get(section));
  exact(records.length, 84, 'published record count');
  exact(new Set(records.map((record) => record.id)).size, 84, 'unique record count');
  for (const section of SECTION_ORDER) {
    exact(bySection.get(section)?.length, 12, `${section} record count`);
  }
  return records;
}

export function buildDiagView2PortDataset(xlsxBytes) {
  const bytes = Buffer.isBuffer(xlsxBytes) ? xlsxBytes : Buffer.from(xlsxBytes);
  exact(bytes.length, SOURCE_XLSX_BYTES, 'source byte length');
  exact(sha256(bytes), SOURCE_XLSX_SHA256, 'source SHA-256');
  exact(gitBlobSha1(bytes), SOURCE_GIT_BLOB_SHA1, 'source Git blob SHA-1');
  const records = extractDiagView2PortRecords(bytes);
  return {
    schemaVersion: PORT_SCHEMA_VERSION,
    id: DATASET_ID,
    asOf: AS_OF,
    deviceId: 'EXL-50U',
    authority: 'historical-design-reference',
    source: sourceContract(),
    publication: publicationContract(),
    unitReview: unitReviewContract(),
    formulaReview: formulaReviewContract(),
    coordinateSystem: coordinateSystemContract(),
    sectionOrder: [...SECTION_ORDER],
    recordCount: records.length,
    sectionCounts: { ...SECTION_COUNTS },
    records,
  };
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildDiagView2PortPackage(xlsxBytes) {
  const dataset = buildDiagView2PortDataset(xlsxBytes);
  const datasetText = serializeJson(dataset);
  const datasetBytes = Buffer.from(datasetText, 'utf8');
  const manifest = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    id: PACKAGE_ID,
    asOf: AS_OF,
    deviceId: 'EXL-50U',
    authority: 'historical-design-reference',
    dataset: {
      path: DATASET_URL,
      format: 'application/json',
      schemaVersion: PORT_SCHEMA_VERSION,
      bytes: datasetBytes.length,
      sha256: sha256(datasetBytes),
      recordCount: 84,
      sectionCounts: { ...SECTION_COUNTS },
    },
    source: sourceContract(),
    publication: publicationContract(),
    unitReview: unitReviewContract(),
    formulaReview: formulaReviewContract(),
    generator: {
      path: 'scripts/exl50u/build_diagview2_ports.mjs',
      deterministic: true,
    },
  };
  return { dataset, datasetText, manifest, manifestText: serializeJson(manifest) };
}

export function readPinnedWorkbookFromGit(sourceRepository = DEFAULT_SOURCE_REPOSITORY) {
  const repository = resolve(sourceRepository);
  exact(gitText(repository, ['rev-parse', 'HEAD']), DIAGVIEW2_BRANCH_REVISION, 'source worktree revision');
  exact(gitText(repository, ['rev-parse', 'b8f04af']), SOURCE_INTRODUCED_COMMIT, 'introduced commit');
  exact(gitText(repository, ['rev-parse', '550e080']), SOURCE_DELETED_COMMIT, 'deleted commit');
  exact(
    gitText(repository, ['ls-tree', SOURCE_INTRODUCED_COMMIT, SOURCE_PATH]),
    `100644 blob ${SOURCE_GIT_BLOB_SHA1}\t${SOURCE_PATH}`,
    'introduced source tree entry',
  );
  exact(
    gitText(repository, ['ls-tree', `${SOURCE_DELETED_COMMIT}^`, SOURCE_PATH]),
    `100644 blob ${SOURCE_GIT_BLOB_SHA1}\t${SOURCE_PATH}`,
    'pre-deletion source tree entry',
  );
  exact(gitText(repository, ['ls-tree', SOURCE_DELETED_COMMIT, SOURCE_PATH]), '', 'deleted source tree entry');

  const historicalParser = gitBytes(repository, ['cat-file', 'blob', SOURCE_PARSER_GIT_BLOB_SHA1]).toString('utf8');
  for (const expression of [
    'self.R * np.cos(angle_rad) / 1000.0',
    'self.R * np.sin(angle_rad) / 1000.0',
    'self.Z / 1000.0',
    'self.X / 1000.0',
    'self.Y / 1000.0',
  ]) {
    if (!historicalParser.includes(expression)) fail(`historical parser review is missing ${expression}`);
  }

  const bytes = gitBytes(repository, ['cat-file', 'blob', SOURCE_GIT_BLOB_SHA1]);
  exact(bytes.length, SOURCE_XLSX_BYTES, 'source byte length');
  exact(sha256(bytes), SOURCE_XLSX_SHA256, 'source SHA-256');
  exact(gitBlobSha1(bytes), SOURCE_GIT_BLOB_SHA1, 'source Git blob SHA-1');
  return bytes;
}

function parseArguments(argv) {
  let check = false;
  let sourceRepository = process.env.DIAGVIEW2_SOURCE_REPOSITORY || DEFAULT_SOURCE_REPOSITORY;
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') check = true;
    else if (argument === '--source-repository') {
      sourceRepository = argv[++index];
      if (!sourceRepository) throw new Error('--source-repository requires a path');
    } else if (argument === '--output-directory') {
      outputDirectory = argv[++index];
      if (!outputDirectory) throw new Error('--output-directory requires a path');
    } else throw new Error(`unknown argument ${argument}`);
  }
  return { check, sourceRepository, outputDirectory: resolve(outputDirectory) };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const packageData = buildDiagView2PortPackage(readPinnedWorkbookFromGit(options.sourceRepository));
  const datasetPath = resolve(options.outputDirectory, 'diagview2-ports.json');
  const manifestPath = resolve(options.outputDirectory, 'manifest.json');
  if (options.check) {
    exact(await readFile(datasetPath, 'utf8'), packageData.datasetText, 'committed dataset text');
    exact(await readFile(manifestPath, 'utf8'), packageData.manifestText, 'committed manifest text');
  } else {
    await mkdir(options.outputDirectory, { recursive: true });
    await writeFile(datasetPath, packageData.datasetText, 'utf8');
    await writeFile(manifestPath, packageData.manifestText, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    mode: options.check ? 'check' : 'write',
    records: packageData.dataset.recordCount,
    dataset: datasetPath,
    manifest: manifestPath,
    datasetBytes: Buffer.byteLength(packageData.datasetText),
    datasetSha256: packageData.manifest.dataset.sha256,
  })}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
