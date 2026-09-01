#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const COMPONENT_TYPE = Object.freeze({
  BYTE: 5120,
  SHORT: 5122,
  FLOAT: 5126,
});
const DEVICE_BUILD_SCHEMA = 'fusiondigital.exl50u-device-derivative-build.v1';
const MESHOPT_BUILD_SCHEMA = 'fusiondigital.exl50u-device-meshopt-build.v1';
const SHA256_PATTERN = /^[A-F0-9]{64}$/;
const REVIEWED_SYSTEM_IDS = Object.freeze([
  'host-system',
  'heating-system',
  'auxiliary-system',
  'power-system',
  'control-system',
  'infrastructure',
  'measurement-reference',
  'diagnostics-system',
]);

function parseArgs(argv) {
  const positional = [];
  let quantizedPosition = false;
  let positionBits = 16;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--quantized-position') {
      quantizedPosition = true;
    } else if (value === '--position-bits') {
      positionBits = Number(argv[++index]);
    } else if (value.startsWith('--')) {
      throw new Error(`unknown option: ${value}`);
    } else {
      positional.push(value);
    }
  }

  if (positional.length !== 2) {
    throw new Error('usage: meshopt_encode.mjs <input.glb> <output.glb> [--quantized-position [--position-bits 12..16]]');
  }
  if (!Number.isSafeInteger(positionBits) || positionBits < 12 || positionBits > 16) {
    throw new Error('--position-bits must be an integer from 12 through 16');
  }
  if (!quantizedPosition && argv.includes('--position-bits')) {
    throw new Error('--position-bits requires --quantized-position');
  }

  const input = resolve(positional[0]);
  const output = resolve(positional[1]);
  if (samePath(input, output)) {
    throw new Error('input and output must be different files');
  }
  if (extname(input).toLocaleLowerCase('en-US') !== '.glb'
    || extname(output).toLocaleLowerCase('en-US') !== '.glb') {
    throw new Error('input and output must both use the .glb extension');
  }

  return { input, output, quantizedPosition, positionBits };
}

function comparablePath(pathname) {
  return process.platform === 'win32' ? pathname.toLocaleLowerCase('en-US') : pathname;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
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
      if (source[index] === '\\') index += 2;
      else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      } else index += 1;
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

function validateDeviceBuildRecord(record, role, input, inputBytes) {
  assertExactKeys(record, ['schemaVersion', 'role', 'profileSha256', 'inputs', 'artifact'], 'device build record');
  if (record.schemaVersion !== DEVICE_BUILD_SCHEMA
    || record.role !== role
    || !SHA256_PATTERN.test(record.profileSha256)) {
    throw new Error('device build record identity is invalid');
  }
  if (!Array.isArray(record.inputs) || record.inputs.length !== REVIEWED_SYSTEM_IDS.length) {
    throw new Error('device build record must contain every reviewed system input');
  }
  const actualIds = [];
  record.inputs.forEach((item, index) => {
    assertExactKeys(item, ['systemId', 'sourceSha256', 'auditSha256', 'artifact', 'buildRecord'], `device inputs[${index}]`);
    actualIds.push(item.systemId);
    if (!SHA256_PATTERN.test(item.sourceSha256) || !SHA256_PATTERN.test(item.auditSha256)) {
      throw new Error(`device inputs[${index}] source evidence is invalid`);
    }
    validateArtifactIdentity(item.artifact, `device inputs[${index}].artifact`);
    validateArtifactIdentity(item.buildRecord, `device inputs[${index}].buildRecord`);
  });
  if (JSON.stringify(actualIds) !== JSON.stringify(REVIEWED_SYSTEM_IDS)) {
    throw new Error('device build record system order or identity is invalid');
  }

  assertExactKeys(record.artifact, [
    'basename', 'bytes', 'sha256', 'vertices', 'triangles', 'decodedGpuBytes', 'boundsMetres', 'assets',
  ], 'device artifact');
  const identity = {
    basename: record.artifact.basename,
    bytes: record.artifact.bytes,
    sha256: record.artifact.sha256,
  };
  validateArtifactIdentity(identity, 'device artifact identity');
  positiveInteger(record.artifact.vertices, 'device artifact.vertices');
  positiveInteger(record.artifact.triangles, 'device artifact.triangles');
  positiveInteger(record.artifact.decodedGpuBytes, 'device artifact.decodedGpuBytes');
  validateBounds(record.artifact.boundsMetres, 'device artifact.boundsMetres');
  if (!Array.isArray(record.artifact.assets) || record.artifact.assets.length !== REVIEWED_SYSTEM_IDS.length) {
    throw new Error('device artifact assets are incomplete');
  }
  let vertices = 0;
  let triangles = 0;
  record.artifact.assets.forEach((asset, index) => {
    assertExactKeys(asset, ['nodeName', 'vertices', 'triangles', 'boundsMetres'], `device artifact.assets[${index}]`);
    if (asset.nodeName !== `EXL50U_GA_PART__${REVIEWED_SYSTEM_IDS[index]}`) {
      throw new Error('device artifact asset order or identity is invalid');
    }
    vertices += positiveInteger(asset.vertices, `device artifact.assets[${index}].vertices`);
    triangles += positiveInteger(asset.triangles, `device artifact.assets[${index}].triangles`);
    validateBounds(asset.boundsMetres, `device artifact.assets[${index}].boundsMetres`);
  });
  if (vertices !== record.artifact.vertices || triangles !== record.artifact.triangles) {
    throw new Error('device artifact aggregate counts differ from its assets');
  }
  if (identity.basename !== basename(input)
    || identity.bytes !== inputBytes.byteLength
    || identity.sha256 !== sha256(inputBytes)) {
    throw new Error('device build record does not identify the exact meshopt input');
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
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

async function assertDirectoryAncestryOutsideGit(path, label) {
  let current = path;
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

async function assertOutsideGitCheckout(path, label) {
  await assertDirectoryAncestryOutsideGit(dirname(path), label);
  if (await pathExists(path)) {
    await assertDirectoryAncestryOutsideGit(dirname(await realpath(path)), label);
  }
}

async function readRegularNonSymlinkFile(path, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  return readFile(path);
}

async function linkNoClobber(source, destination, label) {
  try {
    await link(source, destination);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`${label} already exists; refusing to overwrite it`);
    }
    if (error?.code === 'EXDEV') {
      throw new Error(`${label} cannot be committed atomically across volumes`);
    }
    throw error;
  }
}

async function unlinkOwnedHardLink(destination, source) {
  try {
    const [destinationInfo, sourceInfo] = await Promise.all([lstat(destination), lstat(source)]);
    if (destinationInfo.isFile()
      && !destinationInfo.isSymbolicLink()
      && destinationInfo.dev === sourceInfo.dev
      && destinationInfo.ino === sourceInfo.ino) {
      await unlink(destination);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function deriveDeviceContract(options) {
  const match = /^device\.(preview|high)\.raw\.glb$/u.exec(basename(options.input));
  const deviceLikeOutput = /^device\.(?:preview|high)(?:\.|$)/u.test(basename(options.output));
  if (match === null) {
    if (deviceLikeOutput) throw new Error('device output requires an exactly named reviewed device raw input');
    return null;
  }
  const role = match[1];
  const expectedOutput = `device.${role}.meshopt.glb`;
  if (basename(options.output) !== expectedOutput
    || !samePath(dirname(options.input), dirname(options.output))) {
    throw new Error(`reviewed device output must be the same-directory artifact ${expectedOutput}`);
  }
  return {
    role,
    upstreamPath: join(dirname(options.input), `device.${role}.build.private.json`),
    recordPath: join(dirname(options.output), `device.${role}.meshopt.build.private.json`),
  };
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 28
    || view.getUint32(0, true) !== 0x46546c67
    || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('encoded output is not a complete glTF 2.0 binary container');
  }

  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  const jsonEnd = 20 + jsonLength;
  if (jsonType !== 0x4e4f534a || jsonEnd + 8 > bytes.byteLength) {
    throw new Error('encoded output has an invalid JSON chunk');
  }
  const binaryLength = view.getUint32(jsonEnd, true);
  const binaryType = view.getUint32(jsonEnd + 4, true);
  if (binaryType !== 0x004e4942 || jsonEnd + 8 + binaryLength !== bytes.byteLength) {
    throw new Error('encoded output has an invalid BIN chunk');
  }

  const jsonText = new TextDecoder().decode(bytes.subarray(20, jsonEnd));
  const jsonSource = jsonText.replace(/ +$/u, '');
  const jsonPadding = jsonText.slice(jsonSource.length);
  if (jsonSource.length === 0
    || jsonPadding.length > 3
    || jsonPadding.split('').some((value) => value !== ' ')) {
    throw new Error('encoded output JSON padding is non-canonical');
  }
  assertNoDuplicateJsonKeys(jsonSource, 'encoded GLB JSON');
  const json = JSON.parse(jsonSource);
  if (!Array.isArray(json.buffers)
    || json.buffers.length === 0
    || json.buffers.some((buffer) => typeof buffer.uri === 'string')
    || (json.images ?? []).some((image) => typeof image.uri === 'string')) {
    throw new Error('encoded output is not self-contained');
  }
  return json;
}

function exactStringSet(actual, expected) {
  return Array.isArray(actual)
    && new Set(actual).size === actual.length
    && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function verifyEncoding(json, quantizedPosition) {
  const expectedExtensions = quantizedPosition
    ? ['EXT_meshopt_compression', 'KHR_mesh_quantization']
    : ['EXT_meshopt_compression'];
  if (!exactStringSet(json.extensionsUsed, expectedExtensions)
    || !exactStringSet(json.extensionsRequired, expectedExtensions)) {
    throw new Error(`encoded output must use and require exactly ${expectedExtensions.join(', ')}`);
  }

  const accessors = json.accessors ?? [];
  const meshes = json.meshes ?? [];
  let primitiveCount = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1;
      const position = accessors[primitive.attributes?.POSITION];
      const normal = accessors[primitive.attributes?.NORMAL];
      if (!position || !normal) {
        throw new Error('every encoded primitive must have POSITION and NORMAL accessors');
      }
      if (quantizedPosition) {
        if (![COMPONENT_TYPE.BYTE, COMPONENT_TYPE.SHORT].includes(position.componentType)
          || position.normalized !== true) {
          throw new Error('experimental quantized POSITION must use normalized signed integer storage');
        }
      } else if (position.componentType !== COMPONENT_TYPE.FLOAT || position.normalized === true) {
        throw new Error('default POSITION must remain non-normalized Float32');
      }
      if (normal.componentType !== COMPONENT_TYPE.BYTE || normal.normalized !== true) {
        throw new Error('NORMAL must use normalized signed Int8 storage');
      }
    }
  }
  if (primitiveCount === 0) throw new Error('encoded output contains no mesh primitives');
}

async function main() {
const options = parseArgs(process.argv.slice(2));
const deviceContract = deriveDeviceContract(options);
if (deviceContract !== null && options.quantizedPosition) {
  throw new Error('reviewed device artifacts must retain non-normalized Float32 POSITION storage');
}
await Promise.all([
  assertOutsideGitCheckout(options.input, 'meshopt input'),
  assertOutsideGitCheckout(options.output, 'meshopt output'),
  ...(deviceContract === null ? [] : [
    assertOutsideGitCheckout(deviceContract.upstreamPath, 'device build record'),
    assertOutsideGitCheckout(deviceContract.recordPath, 'meshopt build record'),
  ]),
]);
const inputBytes = await readRegularNonSymlinkFile(options.input, 'meshopt input');
let upstreamRecordBytes = null;
let upstreamRecord = null;
if (deviceContract !== null) {
  upstreamRecordBytes = await readRegularNonSymlinkFile(deviceContract.upstreamPath, 'device build record');
  const upstreamRecordSource = upstreamRecordBytes.toString('utf8');
  assertNoDuplicateJsonKeys(upstreamRecordSource, 'device build record');
  upstreamRecord = JSON.parse(upstreamRecordSource);
  validateDeviceBuildRecord(upstreamRecord, deviceContract.role, options.input, inputBytes);
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
const document = await io.read(options.input);
const pattern = options.quantizedPosition
  ? /^(POSITION|NORMAL|TANGENT)(_\d+)?$/
  : /^(NORMAL|TANGENT)(_\d+)?$/;
const quantizeOptions = {
  pattern,
  patternTargets: pattern,
  quantizeNormal: 8,
};
if (options.quantizedPosition) quantizeOptions.quantizePosition = options.positionBits;

await document.transform(
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize(quantizeOptions),
);
document
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
if (options.quantizedPosition) {
  document.createExtension(KHRMeshQuantization).setRequired(true);
}

await mkdir(dirname(options.output), { recursive: true });
await assertOutsideGitCheckout(options.output, 'meshopt output');
const temporaryRoot = await mkdtemp(join(
  dirname(options.output),
  `.${basename(options.output)}.${process.pid}.partial-`,
));
const temporary = join(temporaryRoot, 'encoded.glb');
const temporaryRecord = deviceContract === null
  ? null
  : join(temporaryRoot, 'meshopt-build-record.json');
let outputLinked = false;
let recordLinked = deviceContract === null;
let commitComplete = false;
try {
  await io.write(temporary, document);
  const encoded = await readFile(temporary);
  const json = parseGlb(encoded);
  verifyEncoding(json, options.quantizedPosition);
  await io.read(temporary);
  let buildRecord = null;
  if (deviceContract !== null) {
    buildRecord = {
      schemaVersion: MESHOPT_BUILD_SCHEMA,
      role: deviceContract.role,
      profileSha256: upstreamRecord.profileSha256,
      input: {
        basename: basename(options.input),
        bytes: inputBytes.byteLength,
        sha256: sha256(inputBytes),
      },
      upstreamRecordSha256: sha256(upstreamRecordBytes),
      output: {
        basename: basename(options.output),
        bytes: encoded.byteLength,
        sha256: sha256(encoded),
      },
    };
    await writeFile(temporaryRecord, `${JSON.stringify(buildRecord)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  await linkNoClobber(temporary, options.output, 'output');
  outputLinked = true;
  if (deviceContract !== null) {
    await linkNoClobber(temporaryRecord, deviceContract.recordPath, 'meshopt build record');
    recordLinked = true;
  }
  commitComplete = true;
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    output: basename(options.output),
    bytes: encoded.byteLength,
    position: options.quantizedPosition ? `normalized signed Int${options.positionBits}` : 'Float32, non-normalized',
    normal: 'normalized signed Int8',
    extensionsRequired: options.quantizedPosition
      ? ['EXT_meshopt_compression', 'KHR_mesh_quantization']
      : ['EXT_meshopt_compression'],
    ...(deviceContract === null ? {} : {
      buildRecord: basename(deviceContract.recordPath),
      upstreamRecordSha256: sha256(upstreamRecordBytes),
    }),
  })}\n`);
} finally {
  if (!commitComplete) {
    if (recordLinked && temporaryRecord !== null) {
      await unlinkOwnedHardLink(deviceContract.recordPath, temporaryRecord);
    }
    if (outputLinked) await unlinkOwnedHardLink(options.output, temporary);
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
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
