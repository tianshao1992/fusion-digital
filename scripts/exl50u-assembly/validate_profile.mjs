#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE_SCHEMA = 'fusiondigital.exl50u-assembly-public-profile.v1';
const DEVICE_ID = 'exl50u-general-assembly-20260630';
const MANIFEST_ID = 'exl50u-general-assembly-v1';
const NODE_PREFIX = 'EXL50U_GA_PART__';
const REQUIRED_EXTENSIONS = ['EXT_meshopt_compression'];
const ALLOWED_CATEGORIES = new Set(['plasma', 'tf', 'pf', 'layer', 'structure']);
const EXPECTED_BUDGETS = Object.freeze({
  posterBytes: 367_001,
  previewBytes: 12 * 1024 * 1024,
  previewTriangles: 700_000,
  previewDecodedGpuBytes: 128 * 1024 * 1024,
  highBytes: 48 * 1024 * 1024,
  highTriangles: 4_480_000,
  highDecodedGpuBytes: 384 * 1024 * 1024,
});
const EXPECTED_SYSTEM_IDENTITIES = Object.freeze([
  ['host-system', 'EXL50U-GA-HOST-SYSTEM', '主机系统', '主机', 'structure'],
  ['heating-system', 'EXL50U-GA-HEATING-SYSTEM', '加热系统', '加热', 'layer'],
  ['auxiliary-system', 'EXL50U-GA-AUXILIARY-SYSTEM', '辅助系统', '辅助', 'structure'],
  ['power-system', 'EXL50U-GA-POWER-SYSTEM', '电源系统', '电源', 'layer'],
  ['control-system', 'EXL50U-GA-CONTROL-SYSTEM', '控制系统', '控制', 'layer'],
  ['infrastructure', 'EXL50U-GA-INFRASTRUCTURE', '基础设施', '基础设施', 'structure'],
  ['measurement-reference', 'EXL50U-GA-MEASUREMENT-REFERENCE', '测量参考', '测量参考', 'layer'],
  ['diagnostics-system', 'EXL50U-GA-DIAGNOSTICS-SYSTEM', '诊断系统', '诊断', 'layer'],
]);

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has undeclared or missing fields: ${actual.join(',')}`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

export function validateProfile(profile) {
  assertExactKeys(profile, [
    'schemaVersion', 'deviceId', 'manifestId', 'stableNodePrefix', 'coordinateSystem',
    'encoding', 'budgets', 'systems', 'publication',
  ], 'profile');
  if (profile.schemaVersion !== PROFILE_SCHEMA
    || profile.deviceId !== DEVICE_ID
    || profile.manifestId !== MANIFEST_ID
    || profile.stableNodePrefix !== NODE_PREFIX) {
    throw new Error('EXL-50U integrated-assembly profile identity is invalid');
  }

  assertExactKeys(profile.coordinateSystem, [
    'linearUnit', 'sourceUpAxis', 'sourceHandedness', 'upAxis', 'handedness', 'sourceToWebScale',
  ], 'coordinateSystem');
  if (profile.coordinateSystem.linearUnit !== 'metre'
    || profile.coordinateSystem.sourceUpAxis !== 'Z'
    || profile.coordinateSystem.sourceHandedness !== 'right'
    || profile.coordinateSystem.upAxis !== 'Y'
    || profile.coordinateSystem.handedness !== 'right'
    || profile.coordinateSystem.sourceToWebScale !== 1) {
    throw new Error('EXL-50U integrated-assembly coordinate contract is invalid');
  }

  assertExactKeys(profile.encoding, ['position', 'normal', 'extensionsRequired'], 'encoding');
  if (profile.encoding.position !== 'Float32, non-normalized'
    || profile.encoding.normal !== 'normalized signed Int8'
    || !Array.isArray(profile.encoding.extensionsRequired)
    || profile.encoding.extensionsRequired.length !== REQUIRED_EXTENSIONS.length
    || profile.encoding.extensionsRequired.some((extension, index) => extension !== REQUIRED_EXTENSIONS[index])) {
    throw new Error('EXL-50U integrated-assembly encoding contract is invalid');
  }

  assertExactKeys(profile.budgets, Object.keys(EXPECTED_BUDGETS), 'budgets');
  for (const [name, expected] of Object.entries(EXPECTED_BUDGETS)) {
    positiveInteger(profile.budgets[name], `budgets.${name}`);
    if (profile.budgets[name] !== expected) throw new Error(`budgets.${name} must remain ${expected}`);
  }

  if (!Array.isArray(profile.systems) || profile.systems.length !== EXPECTED_SYSTEM_IDENTITIES.length) {
    throw new Error(`profile.systems must contain exactly ${EXPECTED_SYSTEM_IDENTITIES.length} reviewed systems`);
  }
  const ids = new Set();
  const partIds = new Set();
  const nodeNames = new Set();
  let previewTriangles = 0;
  let highTriangles = 0;
  let highBytes = 0;
  let highDecodedGpuBytes = 0;

  profile.systems.forEach((system, index) => {
    assertExactKeys(system, [
      'id', 'partId', 'nodeName', 'title', 'shortTitle', 'category', 'color',
      'previewTriangleBudget', 'highTriangleBudget', 'highByteBudget',
      'highDecodedGpuByteBudget',
    ], `systems[${index}]`);
    const [expectedId, expectedPartId, expectedTitle, expectedShortTitle, expectedCategory] = EXPECTED_SYSTEM_IDENTITIES[index];
    const expectedNodeName = NODE_PREFIX + expectedId;
    if (system.id !== expectedId
      || system.partId !== expectedPartId
      || system.nodeName !== expectedNodeName
      || system.title !== expectedTitle
      || system.shortTitle !== expectedShortTitle
      || system.category !== expectedCategory) {
      throw new Error(`systems[${index}] has an unreviewed stable identity`);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(system.id)
      || !/^[A-Z0-9][A-Z0-9-]*$/.test(system.partId)
      || ids.has(system.id)
      || partIds.has(system.partId)
      || nodeNames.has(system.nodeName)) {
      throw new Error(`systems[${index}] has an invalid or duplicate identity`);
    }
    nonEmptyString(system.title, `systems[${index}].title`);
    nonEmptyString(system.shortTitle, `systems[${index}].shortTitle`);
    if (!ALLOWED_CATEGORIES.has(system.category)) throw new Error(`systems[${index}].category is unsupported`);
    if (!/^#[A-F0-9]{6}$/i.test(system.color)) throw new Error(`systems[${index}].color must be #RRGGBB`);
    const previewBudget = positiveInteger(system.previewTriangleBudget, `systems[${index}].previewTriangleBudget`);
    const highBudget = positiveInteger(system.highTriangleBudget, `systems[${index}].highTriangleBudget`);
    const byteBudget = positiveInteger(system.highByteBudget, `systems[${index}].highByteBudget`);
    const decodedBudget = positiveInteger(system.highDecodedGpuByteBudget, `systems[${index}].highDecodedGpuByteBudget`);
    if (highBudget < previewBudget) throw new Error(`systems[${index}] high triangle budget is below preview`);
    ids.add(system.id);
    partIds.add(system.partId);
    nodeNames.add(system.nodeName);
    previewTriangles += previewBudget;
    highTriangles += highBudget;
    highBytes += byteBudget;
    highDecodedGpuBytes += decodedBudget;
  });

  if (previewTriangles !== profile.budgets.previewTriangles
    || highTriangles !== profile.budgets.highTriangles
    || highBytes !== profile.budgets.highBytes
    || highDecodedGpuBytes !== profile.budgets.highDecodedGpuBytes) {
    throw new Error('EXL-50U integrated-assembly per-system and aggregate budgets differ');
  }

  assertExactKeys(profile.publication, [
    'classification', 'authority', 'redistributionAllowed', 'engineeringUseAllowed',
    'sourceCadPublished', 'privateLabelsPublished',
  ], 'publication');
  if (profile.publication.classification !== 'PUBLIC'
    || profile.publication.authority !== 'illustrative'
    || profile.publication.redistributionAllowed !== true
    || profile.publication.engineeringUseAllowed !== false
    || profile.publication.sourceCadPublished !== false
    || profile.publication.privateLabelsPublished !== false) {
    throw new Error('EXL-50U integrated-assembly publication boundary is invalid');
  }

  return {
    systems: ids.size,
    parts: partIds.size,
    previewTriangles,
    highTriangles,
    highBytes,
    highDecodedGpuBytes,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] ?? new URL('./profile.public.json', import.meta.url);
  const profile = JSON.parse(await readFile(source, 'utf8'));
  process.stdout.write(`${JSON.stringify(validateProfile(profile))}\n`);
}
