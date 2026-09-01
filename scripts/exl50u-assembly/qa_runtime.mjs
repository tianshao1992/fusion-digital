#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';
import { validateProfile } from './validate_profile.mjs';

const COMPONENT_BYTES = new Map([
  [5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4],
]);
const UNSIGNED_INDICES = new Set([5121, 5123, 5125]);
const FLOAT = 5126;
const SIGNED_BYTE = 5120;
const TRIANGLES = 4;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const GENERATOR = 'glTF-Transform v4.4.2';
const MESHOPT_EXTENSION = 'EXT_meshopt_compression';
const DEVICE_BUILD_SCHEMA = 'fusiondigital.exl50u-device-derivative-build.v1';
const MESHOPT_BUILD_SCHEMA = 'fusiondigital.exl50u-device-meshopt-build.v1';
const SHA256_PATTERN = /^[A-F0-9]{64}$/;

function parseArgs(argv) {
  const positional = [];
  let systemId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--system-id') {
      systemId = argv[++index] ?? null;
    } else if (value.startsWith('--')) {
      throw new Error(`unknown option: ${value}`);
    } else {
      positional.push(value);
    }
  }
  if (positional.length !== 3) {
    throw new Error('usage: qa_runtime.mjs <profile.json> <preview|high|system-high> <meshopt.glb> [--system-id ID]');
  }
  const [profile, role, source] = positional;
  if (!['preview', 'high', 'system-high'].includes(role)) throw new Error(`unsupported role: ${role}`);
  if (role === 'system-high' && !systemId) throw new Error('system-high requires --system-id ID');
  if (role !== 'system-high' && systemId !== null) throw new Error('--system-id is valid only for system-high');
  return { profile: resolve(profile), role, source: resolve(source), systemId };
}

function deriveContract(profile, role, systemId) {
  validateProfile(profile);
  const systems = role === 'system-high'
    ? profile.systems.filter((candidate) => candidate.id === systemId)
    : profile.systems;
  if (systems.length !== (role === 'system-high' ? 1 : profile.systems.length)) {
    throw new Error(`unknown system-id: ${systemId}`);
  }
  return {
    systems: systems.map((system) => ({
      id: system.id,
      nodeName: system.nodeName,
      color: system.color.toUpperCase(),
      maximumTriangles: role === 'preview' ? system.previewTriangleBudget : system.highTriangleBudget,
      maximumDecodedGpuBytes: system.highDecodedGpuByteBudget,
    })),
    maximumBytes: role === 'preview'
      ? profile.budgets.previewBytes
      : role === 'high'
        ? profile.budgets.highBytes
        : systems[0].highByteBudget,
    maximumTriangles: role === 'preview'
      ? profile.budgets.previewTriangles
      : role === 'high'
        ? profile.budgets.highTriangles
        : systems[0].highTriangleBudget,
    maximumDecodedGpuBytes: role === 'preview'
      ? profile.budgets.previewDecodedGpuBytes
      : role === 'high'
        ? profile.budgets.highDecodedGpuBytes
        : systems[0].highDecodedGpuByteBudget,
  };
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has undeclared or missing fields`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}

function exactStringSet(actual, expected) {
  return Array.isArray(actual)
    && new Set(actual).size === actual.length
    && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function assertNoDuplicateJsonKeys(source, label) {
  let index = 0;
  const skipWhitespace = () => {
    while (index < source.length && /\s/u.test(source[index])) index += 1;
  };
  const parseString = () => {
    if (source[index] !== '"') throw new Error(`${label} contains invalid JSON`);
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
      } else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      } else {
        index += 1;
      }
    }
    throw new Error(`${label} contains an unterminated JSON string`);
  };
  const parseValue = () => {
    skipWhitespace();
    if (source[index] === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[index] === '}') {
        index += 1;
        return;
      }
      while (index < source.length) {
        const key = parseString();
        if (keys.has(key)) throw new Error(`${label} contains a duplicate JSON object key`);
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ':') throw new Error(`${label} contains invalid JSON`);
        index += 1;
        parseValue();
        skipWhitespace();
        if (source[index] === '}') {
          index += 1;
          return;
        }
        if (source[index] !== ',') throw new Error(`${label} contains invalid JSON`);
        index += 1;
        skipWhitespace();
      }
      throw new Error(`${label} contains an unterminated JSON object`);
    }
    if (source[index] === '[') {
      index += 1;
      skipWhitespace();
      if (source[index] === ']') {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue();
        skipWhitespace();
        if (source[index] === ']') {
          index += 1;
          return;
        }
        if (source[index] !== ',') throw new Error(`${label} contains invalid JSON`);
        index += 1;
      }
      throw new Error(`${label} contains an unterminated JSON array`);
    }
    if (source[index] === '"') {
      parseString();
      return;
    }
    const start = index;
    while (index < source.length && !/[\s,}\]]/u.test(source[index])) index += 1;
    if (start === index) throw new Error(`${label} contains invalid JSON`);
    JSON.parse(source.slice(start, index));
  };
  parseValue();
  skipWhitespace();
  if (index !== source.length) throw new Error(`${label} contains trailing JSON data`);
}

function uppercaseSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function validateArtifactIdentity(value, label) {
  assertExactKeys(value, ['basename', 'bytes', 'sha256'], label);
  if (typeof value.basename !== 'string' || basename(value.basename) !== value.basename || value.basename.length === 0) {
    throw new Error(`${label}.basename is invalid`);
  }
  positiveInteger(value.bytes, `${label}.bytes`);
  if (!SHA256_PATTERN.test(value.sha256)) throw new Error(`${label}.sha256 is invalid`);
}

function validateBounds(value, label) {
  assertExactKeys(value, ['min', 'max'], label);
  if (![value.min, value.max].every((entry) => Array.isArray(entry)
    && entry.length === 3
    && entry.every(Number.isFinite))) {
    throw new Error(`${label} must contain finite three-component bounds`);
  }
  if (value.min.some((component, index) => component > value.max[index])) {
    throw new Error(`${label} has reversed bounds`);
  }
}

function validateDeviceBuildRecord(record, profile, role) {
  assertExactKeys(record, ['schemaVersion', 'role', 'profileSha256', 'inputs', 'artifact'], 'device build record');
  if (record.schemaVersion !== DEVICE_BUILD_SCHEMA || record.role !== role || !SHA256_PATTERN.test(record.profileSha256)) {
    throw new Error('device build record identity is invalid');
  }
  if (!Array.isArray(record.inputs) || record.inputs.length !== profile.systems.length) {
    throw new Error('device build record must contain every reviewed system input');
  }
  const expectedIds = profile.systems.map((system) => system.id);
  const actualIds = [];
  record.inputs.forEach((input, index) => {
    assertExactKeys(input, ['systemId', 'sourceSha256', 'auditSha256', 'artifact', 'buildRecord'], `device inputs[${index}]`);
    if (typeof input.systemId !== 'string') throw new Error(`device inputs[${index}].systemId is invalid`);
    actualIds.push(input.systemId);
    if (!SHA256_PATTERN.test(input.sourceSha256) || !SHA256_PATTERN.test(input.auditSha256)) {
      throw new Error(`device inputs[${index}] source evidence is invalid`);
    }
    validateArtifactIdentity(input.artifact, `device inputs[${index}].artifact`);
    validateArtifactIdentity(input.buildRecord, `device inputs[${index}].buildRecord`);
  });
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error('device build record system order or identity differs from the profile');
  }

  assertExactKeys(record.artifact, [
    'basename', 'bytes', 'sha256', 'vertices', 'triangles', 'decodedGpuBytes', 'boundsMetres', 'assets',
  ], 'device artifact');
  validateArtifactIdentity({
    basename: record.artifact.basename,
    bytes: record.artifact.bytes,
    sha256: record.artifact.sha256,
  }, 'device artifact identity');
  positiveInteger(record.artifact.vertices, 'device artifact.vertices');
  positiveInteger(record.artifact.triangles, 'device artifact.triangles');
  positiveInteger(record.artifact.decodedGpuBytes, 'device artifact.decodedGpuBytes');
  validateBounds(record.artifact.boundsMetres, 'device artifact.boundsMetres');
  if (!Array.isArray(record.artifact.assets) || record.artifact.assets.length !== profile.systems.length) {
    throw new Error('device artifact assets are incomplete');
  }
  let vertices = 0;
  let triangles = 0;
  record.artifact.assets.forEach((asset, index) => {
    assertExactKeys(asset, ['nodeName', 'vertices', 'triangles', 'boundsMetres'], `device artifact.assets[${index}]`);
    if (asset.nodeName !== profile.systems[index].nodeName) {
      throw new Error('device artifact asset order or identity differs from the profile');
    }
    vertices += positiveInteger(asset.vertices, `device artifact.assets[${index}].vertices`);
    triangles += positiveInteger(asset.triangles, `device artifact.assets[${index}].triangles`);
    validateBounds(asset.boundsMetres, `device artifact.assets[${index}].boundsMetres`);
  });
  if (vertices !== record.artifact.vertices || triangles !== record.artifact.triangles) {
    throw new Error('device artifact aggregate counts differ from its assets');
  }
}

function validateMeshoptBuildRecord(record, role) {
  assertExactKeys(record, [
    'schemaVersion', 'role', 'profileSha256', 'input', 'upstreamRecordSha256', 'output',
  ], 'meshopt build record');
  if (record.schemaVersion !== MESHOPT_BUILD_SCHEMA
    || record.role !== role
    || !SHA256_PATTERN.test(record.profileSha256)
    || !SHA256_PATTERN.test(record.upstreamRecordSha256)) {
    throw new Error('meshopt build record identity is invalid');
  }
  validateArtifactIdentity(record.input, 'meshopt build record.input');
  validateArtifactIdentity(record.output, 'meshopt build record.output');
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertOutsideGitCheckout(path, label) {
  let current = path;
  if (!(await pathExists(current)) || !(await lstat(current)).isDirectory()) current = dirname(current);
  while (!(await pathExists(current))) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  current = await realpath(current);
  while (true) {
    if (await pathExists(join(current, '.git'))) {
      throw new Error(`${label} must remain outside every Git checkout`);
    }
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) break;
    current = parent;
  }
}

async function verifyBuildEvidence(options, profile, profileBytes, sourceBytes) {
  if (options.role === 'system-high') return null;
  const expectedSource = `device.${options.role}.meshopt.glb`;
  if (basename(options.source) !== expectedSource) {
    throw new Error(`${options.role} QA requires the exact reviewed aggregate filename ${expectedSource}`);
  }
  const directory = dirname(options.source);
  const meshoptRecordPath = join(directory, `device.${options.role}.meshopt.build.private.json`);
  const upstreamRecordPath = join(directory, `device.${options.role}.build.private.json`);
  await Promise.all([
    assertOutsideGitCheckout(options.source, 'reviewed aggregate'),
    assertOutsideGitCheckout(meshoptRecordPath, 'meshopt build record'),
    assertOutsideGitCheckout(upstreamRecordPath, 'device build record'),
  ]);
  const [meshoptRecordBytes, upstreamRecordBytes] = await Promise.all([
    readFile(meshoptRecordPath),
    readFile(upstreamRecordPath),
  ]);
  const meshoptRecordSource = meshoptRecordBytes.toString('utf8');
  const upstreamRecordSource = upstreamRecordBytes.toString('utf8');
  assertNoDuplicateJsonKeys(meshoptRecordSource, 'meshopt build record');
  assertNoDuplicateJsonKeys(upstreamRecordSource, 'device build record');
  const meshoptRecord = JSON.parse(meshoptRecordSource);
  const upstreamRecord = JSON.parse(upstreamRecordSource);
  validateMeshoptBuildRecord(meshoptRecord, options.role);
  validateDeviceBuildRecord(upstreamRecord, profile, options.role);

  const profileSha256 = uppercaseSha256(profileBytes);
  const sourceSha256 = uppercaseSha256(sourceBytes);
  const upstreamRecordSha256 = uppercaseSha256(upstreamRecordBytes);
  if (meshoptRecord.profileSha256 !== profileSha256
    || upstreamRecord.profileSha256 !== profileSha256
    || meshoptRecord.upstreamRecordSha256 !== upstreamRecordSha256) {
    throw new Error('profile or upstream build-record provenance differs from the QA inputs');
  }
  const expectedInput = `device.${options.role}.raw.glb`;
  if (meshoptRecord.input.basename !== expectedInput
    || upstreamRecord.artifact.basename !== expectedInput
    || meshoptRecord.input.bytes !== upstreamRecord.artifact.bytes
    || meshoptRecord.input.sha256 !== upstreamRecord.artifact.sha256) {
    throw new Error('meshopt input provenance differs from the device build artifact');
  }
  if (meshoptRecord.output.basename !== expectedSource
    || meshoptRecord.output.bytes !== sourceBytes.byteLength
    || meshoptRecord.output.sha256 !== sourceSha256) {
    throw new Error('meshopt output provenance differs from the QA artifact');
  }
  return {
    meshoptRecord: basename(meshoptRecordPath),
    meshoptRecordSha256: uppercaseSha256(meshoptRecordBytes),
    upstreamRecord: basename(upstreamRecordPath),
    upstreamRecordSha256,
  };
}

async function readSourceWithinBudget(options, contract) {
  const sourceStat = await lstat(options.source, { bigint: true });
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error('QA source must be a regular non-symbolic-link file');
  }
  const maximumBytes = BigInt(contract.maximumBytes);
  if (sourceStat.size > maximumBytes) {
    throw new Error(`QA source bytes exceed the ${options.role} role budget before file read`);
  }
  const bytes = await readFile(options.source);
  if (bytes.byteLength > contract.maximumBytes) {
    throw new Error(`QA source bytes exceed the ${options.role} role budget after file read`);
  }
  return bytes;
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 28
    || view.getUint32(0, true) !== 0x46546c67
    || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('input is not a complete glTF 2.0 binary container');
  }
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (length % 4 !== 0 || end > bytes.byteLength) throw new Error('GLB has an invalid chunk table');
    chunks.push({ type, start, end, length });
    offset = end;
  }
  if (offset !== bytes.byteLength
    || chunks.length !== 2
    || chunks[0].type !== 0x4e4f534a
    || chunks[1].type !== 0x004e4942) {
    throw new Error('GLB must contain exactly one JSON chunk followed by one BIN chunk');
  }
  const jsonText = new TextDecoder('utf-8', { fatal: true })
    .decode(bytes.subarray(chunks[0].start, chunks[0].end));
  const jsonSource = jsonText.replace(/ +$/u, '');
  const jsonPadding = jsonText.slice(jsonSource.length);
  if (jsonSource.length === 0
    || jsonPadding.length > 3
    || jsonPadding.split('').some((value) => value !== ' ')) {
    throw new Error('GLB JSON padding must contain zero through three ASCII spaces');
  }
  assertNoDuplicateJsonKeys(jsonSource, 'GLB JSON');
  return {
    json: JSON.parse(jsonSource),
    binary: bytes.subarray(chunks[1].start, chunks[1].end),
  };
}

function verifyZeroPadding(binary, start, end, label) {
  if (end < start || end - start > 3) throw new Error(`${label} has non-canonical padding`);
  for (let index = start; index < end; index += 1) {
    if (binary[index] !== 0) throw new Error(`${label} contains non-zero unconsumed BIN bytes`);
  }
}

function verifyRangeCoverage(ranges, length, binary, label) {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  for (const range of sorted) {
    if (range.start < cursor || range.end <= range.start || range.end > length) {
      throw new Error(`${label} ranges overlap or exceed their buffer`);
    }
    if (binary === null) {
      if (range.start - cursor > 3) throw new Error(`${label} contains an unreferenced range`);
    } else {
      verifyZeroPadding(binary, cursor, range.start, label);
    }
    cursor = range.end;
  }
  if (binary === null) {
    if (length - cursor > 3) throw new Error(`${label} has an unreferenced tail`);
  } else {
    verifyZeroPadding(binary, cursor, length, label);
  }
}

function componentStride(componentType) {
  const value = COMPONENT_BYTES.get(componentType);
  if (value === undefined) throw new Error('unsupported accessor component type');
  return value;
}

function validateAccessor(accessor, semantic, label) {
  const expectedKeys = semantic === 'POSITION'
    ? ['type', 'componentType', 'count', 'max', 'min', 'normalized', 'byteOffset', 'bufferView']
    : ['type', 'componentType', 'count', 'normalized', 'byteOffset', 'bufferView'];
  assertExactKeys(accessor, expectedKeys, label);
  positiveInteger(accessor.count, `${label}.count`);
  nonNegativeInteger(accessor.bufferView, `${label}.bufferView`);
  nonNegativeInteger(accessor.byteOffset, `${label}.byteOffset`);
  if (accessor.byteOffset % componentStride(accessor.componentType) !== 0) {
    throw new Error(`${label} byte offset is not component-aligned`);
  }
  if (semantic === 'POSITION') {
    if (accessor.type !== 'VEC3' || accessor.componentType !== FLOAT || accessor.normalized !== false) {
      throw new Error(`${label} POSITION encoding is invalid`);
    }
    if (![accessor.min, accessor.max].every((entry) => Array.isArray(entry)
      && entry.length === 3
      && entry.every(Number.isFinite))) {
      throw new Error(`${label} POSITION bounds are invalid`);
    }
  } else if (semantic === 'NORMAL') {
    if (accessor.type !== 'VEC3' || accessor.componentType !== SIGNED_BYTE || accessor.normalized !== true) {
      throw new Error(`${label} NORMAL encoding is invalid`);
    }
  } else if (semantic === 'INDICES') {
    if (accessor.type !== 'SCALAR'
      || !UNSIGNED_INDICES.has(accessor.componentType)
      || accessor.normalized !== false
      || accessor.count % 3 !== 0) {
      throw new Error(`${label} index encoding is invalid`);
    }
  } else {
    throw new Error(`unsupported accessor semantic: ${semantic}`);
  }
}

function validateBufferView(view, accessor, semantic, label) {
  const expectedStride = semantic === 'POSITION'
    ? 12
    : semantic === 'NORMAL'
      ? 4
      : componentStride(accessor.componentType);
  const expectedKeys = semantic === 'INDICES'
    ? ['buffer', 'byteOffset', 'byteLength', 'target', 'extensions']
    : ['buffer', 'byteOffset', 'byteLength', 'byteStride', 'target', 'extensions'];
  assertExactKeys(view, expectedKeys, label);
  if (view.buffer !== 1
    || view.byteOffset % 4 !== 0
    || !Number.isSafeInteger(view.byteLength)
    || view.byteLength <= 0
    || view.byteLength % expectedStride !== 0
    || view.target !== (semantic === 'INDICES' ? ELEMENT_ARRAY_BUFFER : ARRAY_BUFFER)
    || (semantic !== 'INDICES' && view.byteStride !== expectedStride)) {
    throw new Error(`${label} fallback layout is invalid`);
  }
  assertExactKeys(view.extensions, [MESHOPT_EXTENSION], `${label}.extensions`);
  const extension = view.extensions[MESHOPT_EXTENSION];
  const expectedExtensionKeys = semantic === 'NORMAL'
    ? ['buffer', 'byteOffset', 'byteLength', 'byteStride', 'count', 'mode', 'filter']
    : ['buffer', 'byteOffset', 'byteLength', 'byteStride', 'count', 'mode'];
  assertExactKeys(extension, expectedExtensionKeys, `${label}.${MESHOPT_EXTENSION}`);
  if (extension.buffer !== 0
    || !Number.isSafeInteger(extension.byteOffset)
    || extension.byteOffset < 0
    || extension.byteOffset % 4 !== 0
    || !Number.isSafeInteger(extension.byteLength)
    || extension.byteLength <= 0
    || extension.byteStride !== expectedStride
    || extension.count * expectedStride !== view.byteLength
    || extension.mode !== (semantic === 'INDICES' ? 'TRIANGLES' : 'ATTRIBUTES')
    || (semantic === 'NORMAL' && extension.filter !== 'OCTAHEDRAL')) {
    throw new Error(`${label} meshopt layout is invalid`);
  }
  return { extension, expectedStride };
}

function colorComponents(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function approximatelyEqual(actual, expected) {
  return Number.isFinite(actual)
    && Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-6);
}

function validateMaterial(material, system, label) {
  assertExactKeys(material, ['name', 'doubleSided', 'pbrMetallicRoughness'], label);
  if (material.name !== `material_${system.nodeName}` || material.doubleSided !== true) {
    throw new Error(`${label} identity is invalid`);
  }
  const pbr = material.pbrMetallicRoughness;
  assertExactKeys(pbr, ['baseColorFactor', 'metallicFactor', 'roughnessFactor'], `${label}.pbrMetallicRoughness`);
  const expectedColor = [...colorComponents(system.color), 1];
  if (!Array.isArray(pbr.baseColorFactor)
    || pbr.baseColorFactor.length !== 4
    || pbr.baseColorFactor.some((value, index) => !approximatelyEqual(value, expectedColor[index]))
    || !approximatelyEqual(pbr.metallicFactor, 0.34)
    || !approximatelyEqual(pbr.roughnessFactor, 0.46)) {
    throw new Error(`${label} appearance differs from the reviewed profile`);
  }
}

function validateDocument(json, binary, contract, expectedExtensions) {
  assertExactKeys(json, [
    'asset', 'accessors', 'bufferViews', 'buffers', 'materials', 'meshes', 'nodes',
    'scenes', 'scene', 'extensionsUsed', 'extensionsRequired',
  ], 'glTF document');
  assertExactKeys(json.asset, ['generator', 'version'], 'asset');
  if (json.asset.version !== '2.0' || json.asset.generator !== GENERATOR) {
    throw new Error('glTF asset identity is not the reviewed encoder');
  }
  if (!exactStringSet(json.extensionsUsed, expectedExtensions)
    || !exactStringSet(json.extensionsRequired, expectedExtensions)) {
    throw new Error('glTF extensions differ from the reviewed encoding contract');
  }
  if (json.scene !== 0 || !Array.isArray(json.scenes) || json.scenes.length !== 1) {
    throw new Error('glTF must contain exactly one default scene');
  }
  assertExactKeys(json.scenes[0], ['nodes'], 'scenes[0]');
  const expectedNodeIndexes = contract.systems.map((_, index) => index);
  if (JSON.stringify(json.scenes[0].nodes) !== JSON.stringify(expectedNodeIndexes)) {
    throw new Error('default scene roots differ from the reviewed system order');
  }

  const count = contract.systems.length;
  for (const [name, values] of [
    ['nodes', json.nodes], ['meshes', json.meshes], ['materials', json.materials],
  ]) {
    if (!Array.isArray(values) || values.length !== count) {
      throw new Error(`glTF ${name} count differs from the exact reviewed resource graph`);
    }
  }
  if (!Array.isArray(json.accessors)
    || !Array.isArray(json.bufferViews)
    || json.accessors.length < 3
    || json.accessors.length > count * 3
    || json.bufferViews.length < 3
    || json.bufferViews.length > count * 3) {
    throw new Error('glTF accessor or buffer-view count is outside the reviewed deduplication range');
  }
  if (!Array.isArray(json.buffers) || json.buffers.length !== 2) {
    throw new Error('meshopt GLB must contain exactly one compressed buffer and one virtual fallback buffer');
  }
  assertExactKeys(json.buffers[0], ['byteLength'], 'buffers[0]');
  assertExactKeys(json.buffers[1], ['byteLength', 'extensions'], 'buffers[1]');
  positiveInteger(json.buffers[0].byteLength, 'buffers[0].byteLength');
  positiveInteger(json.buffers[1].byteLength, 'buffers[1].byteLength');
  assertExactKeys(json.buffers[1].extensions, [MESHOPT_EXTENSION], 'buffers[1].extensions');
  assertExactKeys(json.buffers[1].extensions[MESHOPT_EXTENSION], ['fallback'], 'buffers[1].meshopt');
  if (json.buffers[1].extensions[MESHOPT_EXTENSION].fallback !== true) {
    throw new Error('meshopt virtual fallback buffer declaration is invalid');
  }
  if (json.buffers[0].byteLength > binary.byteLength
    || binary.byteLength - json.buffers[0].byteLength > 3) {
    throw new Error('physical BIN chunk differs from its declared compressed buffer');
  }
  verifyZeroPadding(binary, json.buffers[0].byteLength, binary.byteLength, 'physical BIN tail');

  const usedMeshes = new Set();
  const usedMaterials = new Set();
  const usedAccessors = new Set();
  const usedViews = new Set();
  const accessorSemantics = new Map();
  const accessorResources = new Map();
  const viewSemantics = new Map();
  const viewResources = new Map();
  const compressedRanges = [];
  const fallbackRanges = [];
  const resources = [];
  contract.systems.forEach((system, systemIndex) => {
    const node = json.nodes[systemIndex];
    assertExactKeys(node, ['name', 'mesh'], `nodes[${systemIndex}]`);
    if (node.name !== system.nodeName || !Number.isSafeInteger(node.mesh) || usedMeshes.has(node.mesh)) {
      throw new Error(`nodes[${systemIndex}] does not own one unique reviewed mesh`);
    }
    usedMeshes.add(node.mesh);
    const mesh = json.meshes[node.mesh];
    if (!mesh) throw new Error(`nodes[${systemIndex}] references a missing mesh`);
    assertExactKeys(mesh, ['name', 'primitives'], `meshes[${node.mesh}]`);
    if (mesh.name !== system.nodeName || !Array.isArray(mesh.primitives) || mesh.primitives.length !== 1) {
      throw new Error(`meshes[${node.mesh}] differs from the one-primitive system contract`);
    }
    const primitive = mesh.primitives[0];
    assertExactKeys(primitive, ['attributes', 'mode', 'material', 'indices'], `meshes[${node.mesh}].primitives[0]`);
    assertExactKeys(primitive.attributes, ['POSITION', 'NORMAL'], `meshes[${node.mesh}].attributes`);
    if (primitive.mode !== TRIANGLES
      || !Number.isSafeInteger(primitive.material)
      || usedMaterials.has(primitive.material)) {
      throw new Error(`meshes[${node.mesh}] primitive ownership or topology is invalid`);
    }
    usedMaterials.add(primitive.material);
    const material = json.materials[primitive.material];
    if (!material) throw new Error(`meshes[${node.mesh}] references a missing material`);
    validateMaterial(material, system, `materials[${primitive.material}]`);

    const semantics = [
      ['INDICES', primitive.indices],
      ['POSITION', primitive.attributes.POSITION],
      ['NORMAL', primitive.attributes.NORMAL],
    ];
    const systemResources = {};
    for (const [semantic, accessorIndex] of semantics) {
      if (!Number.isSafeInteger(accessorIndex)) {
        throw new Error(`${system.nodeName} has an invalid ${semantic} accessor`);
      }
      usedAccessors.add(accessorIndex);
      const accessor = json.accessors[accessorIndex];
      if (!accessor) throw new Error(`${system.nodeName} references a missing ${semantic} accessor`);
      const priorSemantic = accessorSemantics.get(accessorIndex);
      if (priorSemantic !== undefined && priorSemantic !== semantic) {
        throw new Error('one accessor is reused across incompatible semantics');
      }
      if (priorSemantic === undefined) {
        accessorSemantics.set(accessorIndex, semantic);
        validateAccessor(accessor, semantic, `accessors[${accessorIndex}]`);
        usedViews.add(accessor.bufferView);
        const bufferView = json.bufferViews[accessor.bufferView];
        if (!bufferView) throw new Error(`${system.nodeName} references a missing buffer view`);
        const priorViewSemantic = viewSemantics.get(accessor.bufferView);
        if (priorViewSemantic !== undefined && priorViewSemantic !== semantic) {
          throw new Error('one buffer view is reused across incompatible semantics');
        }
        let viewResource = viewResources.get(accessor.bufferView);
        if (viewResource === undefined) {
          viewSemantics.set(accessor.bufferView, semantic);
          const { extension, expectedStride } = validateBufferView(
            bufferView,
            accessor,
            semantic,
            `bufferViews[${accessor.bufferView}]`,
          );
          viewResource = {
            bufferView,
            bufferViewIndex: accessor.bufferView,
            extension,
            expectedStride,
            accessorRanges: [],
          };
          viewResources.set(accessor.bufferView, viewResource);
          fallbackRanges.push({ start: bufferView.byteOffset, end: bufferView.byteOffset + bufferView.byteLength });
          compressedRanges.push({ start: extension.byteOffset, end: extension.byteOffset + extension.byteLength });
        }
        const accessorStride = semantic === 'POSITION'
          ? 12
          : semantic === 'NORMAL'
            ? 4
            : componentStride(accessor.componentType);
        if (accessorStride !== viewResource.expectedStride
          || accessor.byteOffset % viewResource.expectedStride !== 0) {
          throw new Error('accessors sharing a buffer view use incompatible storage strides');
        }
        const accessorByteLength = accessor.count * viewResource.expectedStride;
        if (accessor.byteOffset + accessorByteLength > bufferView.byteLength) {
          throw new Error(`accessors[${accessorIndex}] exceeds its decoded buffer view`);
        }
        viewResource.accessorRanges.push({
          start: accessor.byteOffset,
          end: accessor.byteOffset + accessorByteLength,
        });
        accessorResources.set(accessorIndex, {
          accessor,
          accessorIndex,
          ...viewResource,
        });
      }
      systemResources[semantic] = accessorResources.get(accessorIndex);
    }
    if (systemResources.POSITION.accessor.count !== systemResources.NORMAL.accessor.count) {
      throw new Error(`${system.nodeName} POSITION and NORMAL counts differ`);
    }
    resources.push({ system, ...systemResources });
  });

  if (usedMeshes.size !== json.meshes.length
    || usedMaterials.size !== json.materials.length
    || usedAccessors.size !== json.accessors.length
    || usedViews.size !== json.bufferViews.length) {
    throw new Error('glTF contains unreachable or multiply-referenced resources');
  }
  for (const [viewIndex, resource] of viewResources) {
    verifyRangeCoverage(
      resource.accessorRanges,
      resource.bufferView.byteLength,
      null,
      `decoded bufferViews[${viewIndex}]`,
    );
  }
  verifyRangeCoverage(compressedRanges, json.buffers[0].byteLength, binary, 'compressed buffer');
  verifyRangeCoverage(fallbackRanges, json.buffers[1].byteLength, null, 'virtual fallback buffer');
  return resources;
}

function decodeBufferView(binary, resource) {
  const {
    accessor, accessorRanges, bufferView, bufferViewIndex, expectedStride, extension,
  } = resource;
  const source = binary.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength);
  const decoded = new Uint8Array(bufferView.byteLength);
  MeshoptDecoder.decodeGltfBuffer(
    decoded,
    extension.count,
    extension.byteStride,
    source,
    extension.mode,
    extension.filter,
  );
  verifyRangeCoverage(
    accessorRanges,
    decoded.byteLength,
    decoded,
    `decoded bufferViews[${bufferViewIndex}]`,
  );
  const start = accessor.byteOffset;
  return decoded.slice(start, start + accessor.count * expectedStride);
}

function decodeIndices(bytes, componentType, count) {
  if (componentType === 5121) return new Uint8Array(bytes.buffer, bytes.byteOffset, count);
  if (componentType === 5123) return new Uint16Array(bytes.buffer, bytes.byteOffset, count);
  if (componentType === 5125) return new Uint32Array(bytes.buffer, bytes.byteOffset, count);
  throw new Error('unsupported index component type');
}

function radixSortTupleIndexes(keys, tupleWidth, count) {
  if (!Number.isSafeInteger(count) || count < 0 || count > 0xffff_ffff) {
    throw new Error('numeric QA sorter exceeds its reviewed Uint32 range');
  }
  let current = new Uint32Array(count);
  let next = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) current[index] = index;
  const buckets = new Uint32Array(256);
  for (let component = tupleWidth - 1; component >= 0; component -= 1) {
    for (let shift = 0; shift < 32; shift += 8) {
      buckets.fill(0);
      for (let index = 0; index < count; index += 1) {
        buckets[(keys[current[index] * tupleWidth + component] >>> shift) & 0xff] += 1;
      }
      let cursor = 0;
      for (let bucket = 0; bucket < buckets.length; bucket += 1) {
        const size = buckets[bucket];
        buckets[bucket] = cursor;
        cursor += size;
      }
      for (let index = 0; index < count; index += 1) {
        const item = current[index];
        const bucket = (keys[item * tupleWidth + component] >>> shift) & 0xff;
        next[buckets[bucket]] = item;
        buckets[bucket] += 1;
      }
      [current, next] = [next, current];
    }
  }
  return current;
}

function tupleEqual(keys, tupleWidth, left, right) {
  const leftOffset = left * tupleWidth;
  const rightOffset = right * tupleWidth;
  for (let component = 0; component < tupleWidth; component += 1) {
    if (keys[leftOffset + component] !== keys[rightOffset + component]) return false;
  }
  return true;
}

function coordinateIds(positions) {
  const count = positions.length / 3;
  const bits = new Uint32Array(count * 3);
  const scratchFloat = new Float32Array(1);
  const scratchBits = new Uint32Array(scratchFloat.buffer);
  for (let index = 0; index < positions.length; index += 1) {
    const value = positions[index];
    if (value === 0) bits[index] = 0;
    else {
      scratchFloat[0] = value;
      bits[index] = scratchBits[0];
    }
  }
  const sorted = radixSortTupleIndexes(bits, 3, count);
  const ids = new Uint32Array(count);
  let nextId = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && !tupleEqual(bits, 3, sorted[index - 1], sorted[index])) nextId += 1;
    ids[sorted[index]] = nextId;
  }
  return ids;
}

function sortedTriple(first, second, third) {
  let low = first;
  let middle = second;
  let high = third;
  if (low > middle) [low, middle] = [middle, low];
  if (middle > high) [middle, high] = [high, middle];
  if (low > middle) [low, middle] = [middle, low];
  return [low, middle, high];
}

function inspectGeometry(resource, binary) {
  const indexBytes = decodeBufferView(binary, resource.INDICES);
  const positionBytes = decodeBufferView(binary, resource.POSITION);
  const normalBytes = decodeBufferView(binary, resource.NORMAL);
  const indices = decodeIndices(
    indexBytes,
    resource.INDICES.accessor.componentType,
    resource.INDICES.accessor.count,
  );
  const positions = new Float32Array(
    positionBytes.buffer,
    positionBytes.byteOffset,
    resource.POSITION.accessor.count * 3,
  );
  const normals = new Int8Array(
    normalBytes.buffer,
    normalBytes.byteOffset,
    resource.NORMAL.accessor.count * 4,
  );
  const vertexCount = resource.POSITION.accessor.count;
  const triangleCount = resource.INDICES.accessor.count / 3;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  let finiteValueFailures = 0;
  let invalidNormalCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const normalOffset = vertex * 4;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (![x, y, z].every(Number.isFinite)) finiteValueFailures += 1;
    low[0] = Math.min(low[0], x); low[1] = Math.min(low[1], y); low[2] = Math.min(low[2], z);
    high[0] = Math.max(high[0], x); high[1] = Math.max(high[1], y); high[2] = Math.max(high[2], z);
    const nx = normals[normalOffset];
    const ny = normals[normalOffset + 1];
    const nz = normals[normalOffset + 2];
    if ((nx === 0 && ny === 0 && nz === 0) || normals[normalOffset + 3] !== 0) invalidNormalCount += 1;
  }
  for (const component of [0, 1, 2]) {
    if (!approximatelyEqual(low[component], resource.POSITION.accessor.min[component])
      || !approximatelyEqual(high[component], resource.POSITION.accessor.max[component])) {
      throw new Error(`${resource.system.nodeName} decoded POSITION bounds differ from its accessor`);
    }
  }

  const ids = coordinateIds(positions);
  const faceKeys = new Uint32Array(triangleCount * 3);
  const diagonalSquared = low.reduce((sum, value, component) => sum + (high[component] - value) ** 2, 0);
  const areaThresholdSquared = Math.max(diagonalSquared * 1e-12, 1e-18) ** 2;
  let invalidIndexCount = 0;
  let degenerateTriangles = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const indexOffset = triangle * 3;
    const ia = indices[indexOffset];
    const ib = indices[indexOffset + 1];
    const ic = indices[indexOffset + 2];
    if (ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) {
      invalidIndexCount += 1;
      continue;
    }
    const [first, second, third] = sortedTriple(ids[ia], ids[ib], ids[ic]);
    faceKeys[indexOffset] = first;
    faceKeys[indexOffset + 1] = second;
    faceKeys[indexOffset + 2] = third;

    const a = ia * 3;
    const b = ib * 3;
    const c = ic * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    if (crossX * crossX + crossY * crossY + crossZ * crossZ <= areaThresholdSquared) {
      degenerateTriangles += 1;
    }
  }

  const sortedFaces = radixSortTupleIndexes(faceKeys, 3, triangleCount);
  let duplicateTriangles = 0;
  for (let index = 1; index < sortedFaces.length; index += 1) {
    if (tupleEqual(faceKeys, 3, sortedFaces[index - 1], sortedFaces[index])) duplicateTriangles += 1;
  }
  const decodedGpuBytes = [resource.INDICES, resource.POSITION, resource.NORMAL]
    .reduce((total, value) => total + value.accessor.count * value.expectedStride, 0);
  return {
    nodeName: resource.system.nodeName,
    triangles: triangleCount,
    maximumTriangles: resource.system.maximumTriangles,
    vertices: vertexCount,
    decodedGpuBytes,
    maximumDecodedGpuBytes: resource.system.maximumDecodedGpuBytes,
    boundsMetres: { min: low, max: high },
    finiteValueFailures,
    invalidNormalCount,
    invalidIndexCount,
    degenerateTriangles,
    duplicateTriangles,
  };
}

function mergeBounds(stats) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const stat of stats) {
    for (let component = 0; component < 3; component += 1) {
      min[component] = Math.min(min[component], stat.boundsMetres.min[component]);
      max[component] = Math.max(max[component], stat.boundsMetres.max[component]);
    }
  }
  return { min, max };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const profileBytes = await readFile(options.profile);
  const profileSource = profileBytes.toString('utf8');
  assertNoDuplicateJsonKeys(profileSource, 'profile');
  const profile = JSON.parse(profileSource);
  const contract = deriveContract(profile, options.role, options.systemId);
  const bytes = await readSourceWithinBudget(options, contract);
  const evidence = await verifyBuildEvidence(options, profile, profileBytes, bytes);
  const sha256 = uppercaseSha256(bytes);
  const { json, binary } = parseGlb(bytes);
  const resources = validateDocument(json, binary, contract, profile.encoding.extensionsRequired);

  await MeshoptDecoder.ready;
  const systemStats = resources.map((resource) => inspectGeometry(resource, binary));
  const triangles = systemStats.reduce((total, value) => total + value.triangles, 0);
  const vertices = systemStats.reduce((total, value) => total + value.vertices, 0);
  const uniqueAccessors = new Map();
  for (const resource of resources) {
    uniqueAccessors.set(resource.INDICES.accessor, resource.INDICES.expectedStride);
    uniqueAccessors.set(resource.POSITION.accessor, resource.POSITION.expectedStride);
    uniqueAccessors.set(resource.NORMAL.accessor, resource.NORMAL.expectedStride);
  }
  const decodedGpuBytes = [...uniqueAccessors].reduce(
    (total, [accessor, stride]) => total + accessor.count * stride,
    0,
  );
  const violations = {
    nonFiniteValues: systemStats.reduce((total, value) => total + value.finiteValueFailures, 0),
    invalidNormals: systemStats.reduce((total, value) => total + value.invalidNormalCount, 0),
    invalidIndices: systemStats.reduce((total, value) => total + value.invalidIndexCount, 0),
    degenerateTriangles: systemStats.reduce((total, value) => total + value.degenerateTriangles, 0),
    duplicateFaces: systemStats.reduce((total, value) => total + value.duplicateTriangles, 0),
  };
  const checks = {
    byteBudget: bytes.byteLength <= contract.maximumBytes,
    triangleBudget: triangles <= contract.maximumTriangles,
    decodedGpuBudget: decodedGpuBytes <= contract.maximumDecodedGpuBytes,
    perSystemTriangleBudgets: systemStats.every((value) => value.triangles <= value.maximumTriangles),
    perSystemDecodedGpuBudgets: systemStats.every((value) => value.decodedGpuBytes <= value.maximumDecodedGpuBytes),
    exactEncodingAndResourceGraph: true,
    finiteValuesAndBounds: violations.nonFiniteValues === 0,
    validNormals: violations.invalidNormals === 0,
    validIndices: violations.invalidIndices === 0,
    noDegenerateTriangles: violations.degenerateTriangles === 0,
    noDuplicateFaces: violations.duplicateFaces === 0,
    provenance: options.role === 'system-high' || evidence !== null,
  };
  const result = {
    status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    source: basename(options.source),
    sha256,
    role: options.role,
    ...(options.systemId === null ? {} : { systemId: options.systemId }),
    bytes: bytes.byteLength,
    maximumBytes: contract.maximumBytes,
    triangles,
    maximumTriangles: contract.maximumTriangles,
    vertices,
    meshInstances: systemStats.length,
    decodedGpuBytes,
    maximumDecodedGpuBytes: contract.maximumDecodedGpuBytes,
    boundsMetres: mergeBounds(systemStats),
    stableNodes: systemStats.map((value) => value.nodeName),
    systemStats,
    ...(evidence === null ? {} : { evidence }),
    violations,
    checks,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'PASS') process.exitCode = 2;
}

function sanitizedMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z]:[\\/][^\s'"`]+/g, '<path>')
    .replace(/file:\/\/[^\s'"`]+/gi, '<path>');
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ status: 'FAIL', error: sanitizedMessage(error) })}\n`);
  process.exitCode = 2;
});
