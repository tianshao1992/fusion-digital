#!/usr/bin/env node

/**
 * Runtime delivery gate for the EHL-2 preliminary Meshopt GLB. The model is
 * decoded through Three.js, matching the browser viewer. Degeneracy is tested
 * both on delivered Float32 positions and after world transforms.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

const source = process.argv[2];
if (!source) {
  throw new Error('usage: node scripts/ehl2/qa_ehl2_runtime.mjs <meshopt.glb>');
}

const expectedStableNodes = [
  'EHL2_PART__bellows',
  'EHL2_PART__center-post',
  'EHL2_PART__dewar',
  'EHL2_PART__divertor',
  'EHL2_PART__fixed-limiter',
  'EHL2_PART__vacuum-vessel',
];
const expectedExtensions = ['EXT_meshopt_compression'];

if (globalThis.ProgressEvent === undefined) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}

await MeshoptDecoder.ready;
const bytes = await readFile(resolve(source));
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
  throw new Error('input is not a glTF 2.0 binary container');
}

const declaredLengthMatches = view.getUint32(8, true) === bytes.byteLength;
let jsonChunks = 0;
let binChunks = 0;
let glbJson = null;
let offset = 12;
while (offset + 8 <= bytes.byteLength) {
  const chunkLength = view.getUint32(offset, true);
  const chunkType = view.getUint32(offset + 4, true);
  const start = offset + 8;
  const end = start + chunkLength;
  if (end > bytes.byteLength) throw new Error('GLB chunk exceeds container length');
  if (chunkType === 0x4e4f534a) {
    jsonChunks += 1;
    if (jsonChunks > 1) throw new Error('GLB contains more than one JSON chunk');
    glbJson = JSON.parse(new TextDecoder().decode(bytes.subarray(start, end)).trim());
  } else if (chunkType === 0x004e4942) {
    binChunks += 1;
  }
  offset = end;
}
if (glbJson === null) throw new Error('GLB has no JSON chunk');
const chunksConsumeContainer = offset === bytes.byteLength;

const selfContainedBuffers =
  jsonChunks === 1 &&
  binChunks === 1 &&
  Array.isArray(glbJson.buffers) &&
  glbJson.buffers.length >= 1 &&
  glbJson.buffers.every((buffer) => buffer.uri === undefined);
const selfContainedImages =
  !Array.isArray(glbJson.images) ||
  glbJson.images.every((image) => image.uri === undefined && Number.isSafeInteger(image.bufferView));
const exactExtensions =
  JSON.stringify([...(glbJson.extensionsUsed ?? [])].sort()) === JSON.stringify(expectedExtensions) &&
  JSON.stringify([...(glbJson.extensionsRequired ?? [])].sort()) === JSON.stringify(expectedExtensions);

const componentBytes = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const typeComponents = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4], ['MAT2', 4], ['MAT3', 9], ['MAT4', 16]]);
let decodedBytes = 0;
for (const accessor of glbJson.accessors ?? []) {
  const bytesPerComponent = componentBytes.get(accessor.componentType);
  const components = typeComponents.get(accessor.type);
  if (bytesPerComponent === undefined || components === undefined || !Number.isSafeInteger(accessor.count)) {
    throw new Error('unsupported accessor in decoded byte accounting');
  }
  decodedBytes += accessor.count * bytesPerComponent * components;
}

const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const { scene } = await loader.parseAsync(arrayBuffer, '');
scene.updateMatrixWorld(true);

const stableNodeCounts = new Map();
scene.traverse((object) => {
  if (typeof object.name === 'string' && object.name.startsWith('EHL2_PART__')) {
    stableNodeCounts.set(object.name, (stableNodeCounts.get(object.name) ?? 0) + 1);
  }
});
const stableNodes = [...stableNodeCounts.keys()].sort();
const exactStableNodes =
  JSON.stringify(stableNodes) === JSON.stringify(expectedStableNodes) &&
  expectedStableNodes.every((name) => stableNodeCounts.get(name) === 1);

function stableAncestors(object) {
  const names = [];
  for (let current = object; current; current = current.parent) {
    if (typeof current.name === 'string' && current.name.startsWith('EHL2_PART__')) names.push(current.name);
  }
  return names;
}

function encodedComponent(attribute, index, component) {
  if (attribute.isInterleavedBufferAttribute) {
    return attribute.data.array[index * attribute.data.stride + attribute.offset + component];
  }
  return attribute.array[index * attribute.itemSize + component];
}

function finiteNonSingularMatrix(matrix) {
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) return { finite: false, nonSingular: false };
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
  return { finite: true, nonSingular: Number.isFinite(determinant) && Math.abs(determinant) > 1e-15 };
}

let meshInstances = 0;
let triangles = 0;
let vertices = 0;
let finitePositions = true;
let finiteNormals = true;
let safeIndices = true;
let finiteWorldMatrices = true;
let nonSingularWorldMatrices = true;
let finiteWorldPositions = true;
let ownerFailures = 0;
let positionEncodingFailures = 0;
let normalEncodingFailures = 0;
let localDegenerateTriangles = 0;
let localDuplicateTriangles = 0;
let worldDegenerateTriangles = 0;
let worldDuplicateTriangles = 0;
const ownersWithMeshes = new Set();
const positionEncodings = new Set();
const normalEncodings = new Set();
const worldMin = [Infinity, Infinity, Infinity];
const worldMax = [-Infinity, -Infinity, -Infinity];
const details = [];

scene.traverse((object) => {
  if (!object.isMesh) return;
  meshInstances += 1;
  const geometry = object.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  if (!position || !normal || !index || index.count % 3 !== 0) {
    safeIndices = false;
    details.push({ meshName: object.name, error: 'missing indexed POSITION/NORMAL triangle geometry' });
    return;
  }

  const owners = stableAncestors(object);
  const owner = owners.length === 1 ? owners[0] : null;
  if (owner === null) ownerFailures += 1;
  else ownersWithMeshes.add(owner);
  triangles += index.count / 3;
  vertices += position.count;

  const positionArray = position.array ?? position.data?.array;
  const normalArray = normal.array ?? normal.data?.array;
  const positionEncoding = `${positionArray?.constructor?.name ?? 'unknown'}:${position.normalized === true ? 'normalized' : 'raw'}`;
  const normalEncoding = `${normalArray?.constructor?.name ?? 'unknown'}:${normal.normalized === true ? 'normalized' : 'raw'}`;
  positionEncodings.add(positionEncoding);
  normalEncodings.add(normalEncoding);
  if (!(position.normalized !== true && positionArray instanceof Float32Array)) positionEncodingFailures += 1;
  if (!(normal.normalized === true && normalArray instanceof Int8Array)) normalEncodingFailures += 1;

  const matrix = object.matrixWorld.elements;
  const matrixGate = finiteNonSingularMatrix(matrix);
  finiteWorldMatrices &&= matrixGate.finite;
  nonSingularWorldMatrices &&= matrixGate.nonSingular;

  const localMin = [Infinity, Infinity, Infinity];
  const localMax = [-Infinity, -Infinity, -Infinity];
  const objectWorldMin = [Infinity, Infinity, Infinity];
  const objectWorldMax = [-Infinity, -Infinity, -Infinity];
  const coordinateIds = new Map();
  const vertexCoordinateId = new Uint32Array(position.count);
  const worldPosition = new Float64Array(position.count * 3);

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const encoded = [
      encodedComponent(position, vertex, 0),
      encodedComponent(position, vertex, 1),
      encodedComponent(position, vertex, 2),
    ];
    if (!encoded.every(Number.isFinite)) finitePositions = false;
    for (let component = 0; component < 3; component += 1) {
      localMin[component] = Math.min(localMin[component], encoded[component]);
      localMax[component] = Math.max(localMax[component], encoded[component]);
    }
    const coordinateKey = encoded.join(',');
    let coordinateId = coordinateIds.get(coordinateKey);
    if (coordinateId === undefined) {
      coordinateId = coordinateIds.size;
      coordinateIds.set(coordinateKey, coordinateId);
    }
    vertexCoordinateId[vertex] = coordinateId;

    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    const wx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const wy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const wz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    const worldOffset = vertex * 3;
    worldPosition[worldOffset] = wx;
    worldPosition[worldOffset + 1] = wy;
    worldPosition[worldOffset + 2] = wz;
    if (![wx, wy, wz].every(Number.isFinite)) finiteWorldPositions = false;
    else {
      for (let component = 0; component < 3; component += 1) {
        const value = worldPosition[worldOffset + component];
        objectWorldMin[component] = Math.min(objectWorldMin[component], value);
        objectWorldMax[component] = Math.max(objectWorldMax[component], value);
        worldMin[component] = Math.min(worldMin[component], value);
        worldMax[component] = Math.max(worldMax[component], value);
      }
    }
    if (![normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)].every(Number.isFinite)) finiteNormals = false;
  }

  const localDiagonalSquared = localMin.reduce((sum, value, component) => sum + (localMax[component] - value) ** 2, 0);
  const localAreaThresholdSquared = Math.max(localDiagonalSquared * 1e-12, 1e-18) ** 2;
  const worldDiagonalSquared = objectWorldMin.reduce((sum, value, component) => sum + (objectWorldMax[component] - value) ** 2, 0);
  const worldAreaThresholdSquared = Math.max(worldDiagonalSquared * 1e-12, 1e-18) ** 2;
  const seenLocal = new Set();
  const seenWorld = new Set();
  const objectCounts = { localDegenerate: 0, localDuplicate: 0, worldDegenerate: 0, worldDuplicate: 0 };
  const examples = [];

  for (let triangleOffset = 0; triangleOffset < index.count; triangleOffset += 3) {
    const ia = index.getX(triangleOffset);
    const ib = index.getX(triangleOffset + 1);
    const ic = index.getX(triangleOffset + 2);
    if (
      ![ia, ib, ic].every(Number.isSafeInteger) ||
      ia < 0 || ib < 0 || ic < 0 ||
      ia >= position.count || ib >= position.count || ic >= position.count
    ) {
      safeIndices = false;
      continue;
    }

    const a = [encodedComponent(position, ia, 0), encodedComponent(position, ia, 1), encodedComponent(position, ia, 2)];
    const ab = [
      encodedComponent(position, ib, 0) - a[0],
      encodedComponent(position, ib, 1) - a[1],
      encodedComponent(position, ib, 2) - a[2],
    ];
    const ac = [
      encodedComponent(position, ic, 0) - a[0],
      encodedComponent(position, ic, 1) - a[1],
      encodedComponent(position, ic, 2) - a[2],
    ];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const localCrossSquared = cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2;
    if (localCrossSquared <= localAreaThresholdSquared) {
      objectCounts.localDegenerate += 1;
      localDegenerateTriangles += 1;
    }
    const localKey = [vertexCoordinateId[ia], vertexCoordinateId[ib], vertexCoordinateId[ic]].sort((left, right) => left - right).join(',');
    if (seenLocal.has(localKey)) {
      objectCounts.localDuplicate += 1;
      localDuplicateTriangles += 1;
    } else seenLocal.add(localKey);

    const ao = ia * 3;
    const bo = ib * 3;
    const co = ic * 3;
    const wab = [worldPosition[bo] - worldPosition[ao], worldPosition[bo + 1] - worldPosition[ao + 1], worldPosition[bo + 2] - worldPosition[ao + 2]];
    const wac = [worldPosition[co] - worldPosition[ao], worldPosition[co + 1] - worldPosition[ao + 1], worldPosition[co + 2] - worldPosition[ao + 2]];
    const worldCross = [
      wab[1] * wac[2] - wab[2] * wac[1],
      wab[2] * wac[0] - wab[0] * wac[2],
      wab[0] * wac[1] - wab[1] * wac[0],
    ];
    const worldCrossSquared = worldCross[0] ** 2 + worldCross[1] ** 2 + worldCross[2] ** 2;
    if (worldCrossSquared <= worldAreaThresholdSquared) {
      objectCounts.worldDegenerate += 1;
      worldDegenerateTriangles += 1;
    }
    const worldKey = [
      `${worldPosition[ao]},${worldPosition[ao + 1]},${worldPosition[ao + 2]}`,
      `${worldPosition[bo]},${worldPosition[bo + 1]},${worldPosition[bo + 2]}`,
      `${worldPosition[co]},${worldPosition[co + 1]},${worldPosition[co + 2]}`,
    ].sort().join('|');
    if (seenWorld.has(worldKey)) {
      objectCounts.worldDuplicate += 1;
      worldDuplicateTriangles += 1;
    } else seenWorld.add(worldKey);

    if (examples.length < 4 && (localCrossSquared <= localAreaThresholdSquared || worldCrossSquared <= worldAreaThresholdSquared)) {
      examples.push({ triangleOffset, indices: [ia, ib, ic], localCrossSquared, worldCrossSquared });
    }
  }

  if (Object.values(objectCounts).some((count) => count !== 0)) {
    details.push({ meshName: object.name, owner, triangles: index.count / 3, vertices: position.count, ...objectCounts, examples });
  }
});

const everyStableNodeOwnsMesh = expectedStableNodes.every((name) => ownersWithMeshes.has(name));
const result = {
  status: 'FAIL',
  source: resolve(source),
  glb2: true,
  declaredLengthMatches,
  chunksConsumeContainer,
  jsonChunks,
  binChunks,
  selfContainedBuffers,
  selfContainedImages,
  exactExtensions,
  stableNodes,
  stableNodeCounts: Object.fromEntries([...stableNodeCounts].sort()),
  exactStableNodes,
  everyStableNodeOwnsMesh,
  triangles,
  vertices,
  meshInstances,
  decodedBytes,
  worldBounds: { min: worldMin, max: worldMax },
  finitePositions,
  finiteNormals,
  safeIndices,
  finiteWorldMatrices,
  nonSingularWorldMatrices,
  finiteWorldPositions,
  ownerFailures,
  positionEncodingFailures,
  normalEncodingFailures,
  localDegenerateTriangles,
  localDuplicateTriangles,
  worldDegenerateTriangles,
  worldDuplicateTriangles,
  positionEncodings: [...positionEncodings].sort(),
  normalEncodings: [...normalEncodings].sort(),
  details,
};

const gates = [
  declaredLengthMatches,
  chunksConsumeContainer,
  jsonChunks === 1,
  binChunks === 1,
  selfContainedBuffers,
  selfContainedImages,
  exactExtensions,
  exactStableNodes,
  everyStableNodeOwnsMesh,
  meshInstances > 0,
  finitePositions,
  finiteNormals,
  safeIndices,
  finiteWorldMatrices,
  nonSingularWorldMatrices,
  finiteWorldPositions,
  ownerFailures === 0,
  positionEncodingFailures === 0,
  normalEncodingFailures === 0,
  localDegenerateTriangles === 0,
  localDuplicateTriangles === 0,
  worldDegenerateTriangles === 0,
  worldDuplicateTriangles === 0,
];
result.status = gates.every(Boolean) ? 'PASS' : 'FAIL';

process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status !== 'PASS') process.exitCode = 2;
