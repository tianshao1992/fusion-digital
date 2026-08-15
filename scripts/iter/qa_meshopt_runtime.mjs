#!/usr/bin/env node

/**
 * Validate a delivered ITER Meshopt GLB through the same Three.js decode path
 * used by the product viewer.  In particular, POSITION stays normalized Int16
 * while the scale-invariant triangle test runs; dequantizing to float32 first
 * can inject noise that hides integer-grid collinearity.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

const source = process.argv[2];
if (!source) {
  throw new Error('usage: node scripts/iter/qa_meshopt_runtime.mjs <meshopt.glb>');
}

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
const glbView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
let glbJson = null;
let internalBinChunks = 0;
let glbOffset = 12;
if (glbView.getUint32(0, true) !== 0x46546c67 || glbView.getUint32(4, true) !== 2) {
  throw new Error('input is not a glTF 2.0 binary container');
}
while (glbOffset + 8 <= bytes.byteLength) {
  const chunkLength = glbView.getUint32(glbOffset, true);
  const chunkType = glbView.getUint32(glbOffset + 4, true);
  const chunkStart = glbOffset + 8;
  const chunkEnd = chunkStart + chunkLength;
  if (chunkEnd > bytes.byteLength) throw new Error('GLB chunk exceeds container length');
  if (chunkType === 0x4e4f534a) {
    if (glbJson !== null) throw new Error('GLB contains more than one JSON chunk');
    glbJson = JSON.parse(new TextDecoder().decode(bytes.subarray(chunkStart, chunkEnd)).trim());
  } else if (chunkType === 0x004e4942) {
    internalBinChunks += 1;
  }
  glbOffset = chunkEnd;
}
if (glbJson === null) throw new Error('GLB has no JSON chunk');
const selfContainedBuffers =
  internalBinChunks === 1 &&
  Array.isArray(glbJson.buffers) && glbJson.buffers.length >= 1 &&
  glbJson.buffers.every((item) => item.uri === undefined);
const selfContainedImages =
  !Array.isArray(glbJson.images) ||
  glbJson.images.every((item) => item.uri === undefined && Number.isSafeInteger(item.bufferView));
const reviewedExtensions = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];
const exactExtensions =
  JSON.stringify([...(glbJson.extensionsUsed ?? [])].sort()) === JSON.stringify(reviewedExtensions) &&
  JSON.stringify([...(glbJson.extensionsRequired ?? [])].sort()) === JSON.stringify(reviewedExtensions);
const componentBytes = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const typeComponents = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4], ['MAT2', 4], ['MAT3', 9], ['MAT4', 16]]);
let decodedGeometryBytes = 0;
for (const accessor of glbJson.accessors ?? []) {
  const bytesPerComponent = componentBytes.get(accessor.componentType);
  const components = typeComponents.get(accessor.type);
  if (bytesPerComponent === undefined || components === undefined || !Number.isSafeInteger(accessor.count)) {
    throw new Error('unsupported accessor in decoded geometry byte accounting');
  }
  decodedGeometryBytes += accessor.count * bytesPerComponent * components;
}
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const { scene } = await loader.parseAsync(buffer, '');
scene.updateMatrixWorld(true);

const stableNames = new Set();
scene.traverse((object) => {
  if (typeof object.name === 'string' && object.name.startsWith('ITER_PART__')) {
    stableNames.add(object.name);
  }
});

const checkedGeometry = new Set();
const geometryOwner = new Map();
const details = [];
const positionEncodings = new Set();
const normalEncodings = new Set();
let meshInstances = 0;
let uniqueGeometryTriangles = 0;
let uniqueGeometryVertices = 0;
let sceneDrawTriangles = 0;
let sceneDrawVertices = 0;
let degenerateTriangles = 0;
let exactDegenerateTriangles = 0;
let duplicateTriangles = 0;
let finitePositions = true;
let finiteNormals = true;
let indicesInRange = true;
let ownerFailures = 0;
let positionEncodingFailures = 0;
let normalEncodingFailures = 0;
let finiteWorldMatrices = true;
let nonSingularWorldMatrices = true;
let finiteWorldPositions = true;
let worldDegenerateTriangles = 0;
let worldDuplicateTriangles = 0;
const worldBoundsMin = [Infinity, Infinity, Infinity];
const worldBoundsMax = [-Infinity, -Infinity, -Infinity];

function stableAncestorNames(object) {
  const names = [];
  for (let current = object; current; current = current.parent) {
    if (typeof current.name === 'string' && current.name.startsWith('ITER_PART__')) {
      names.push(current.name);
    }
  }
  return names;
}

function integerComponent(attribute, index, component) {
  if (attribute.isInterleavedBufferAttribute) {
    return attribute.data.array[index * attribute.data.stride + attribute.offset + component];
  }
  return attribute.array[index * attribute.itemSize + component];
}

scene.traverse((object) => {
  if (!object.isMesh) return;
  meshInstances += 1;
  const geometry = object.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const indices = geometry.getIndex();
  if (!positions || !normals || !indices || indices.count % 3 !== 0) {
    indicesInRange = false;
    return;
  }
  positionEncodings.add(
    `${positions.array?.constructor?.name ?? 'unknown'}:${positions.normalized === true ? 'normalized' : 'raw'}`,
  );
  normalEncodings.add(
    `${normals.array?.constructor?.name ?? normals.data?.array?.constructor?.name ?? 'unknown'}:${normals.normalized === true ? 'normalized' : 'raw'}`,
  );
  sceneDrawTriangles += indices.count / 3;
  sceneDrawVertices += positions.count;
  const owners = stableAncestorNames(object);
  const owner = owners.length === 1 ? owners[0] : null;
  if (owners.length !== 1) ownerFailures += 1;
  const integerPositionEncoding =
    positions.normalized === true &&
    (positions.array instanceof Int16Array || positions.data?.array instanceof Int16Array);
  if (!integerPositionEncoding) positionEncodingFailures += 1;
  const integerNormalEncoding =
    normals.normalized === true &&
    (normals.array instanceof Int8Array || normals.data?.array instanceof Int8Array);
  if (!integerNormalEncoding) normalEncodingFailures += 1;
  const matrix = object.matrixWorld.elements;
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) finiteWorldMatrices = false;
  const determinant3 =
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
  if (!Number.isFinite(determinant3) || determinant3 === 0) nonSingularWorldMatrices = false;
  if (geometryOwner.has(geometry) && geometryOwner.get(geometry) !== owner) {
    throw new Error(`geometry is shared across stable identities: ${geometryOwner.get(geometry)} / ${owner}`);
  }
  geometryOwner.set(geometry, owner);
  if (!checkedGeometry.has(geometry)) {
    checkedGeometry.add(geometry);
    uniqueGeometryTriangles += indices.count / 3;
    uniqueGeometryVertices += positions.count;
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const coordinateIds = new Map();
  const vertexCoordinateId = new Uint32Array(positions.count);
  const worldPositions = new Float64Array(positions.count * 3);
  const objectWorldMin = [Infinity, Infinity, Infinity];
  const objectWorldMax = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const x = integerComponent(positions, vertex, 0);
    const y = integerComponent(positions, vertex, 1);
    const z = integerComponent(positions, vertex, 2);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      finitePositions = false;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    const key = `${x},${y},${z}`;
    let coordinateId = coordinateIds.get(key);
    if (coordinateId === undefined) {
      coordinateId = coordinateIds.size;
      coordinateIds.set(key, coordinateId);
    }
    vertexCoordinateId[vertex] = coordinateId;
    const localX = positions.getX(vertex);
    const localY = positions.getY(vertex);
    const localZ = positions.getZ(vertex);
    const worldX = matrix[0] * localX + matrix[4] * localY + matrix[8] * localZ + matrix[12];
    const worldY = matrix[1] * localX + matrix[5] * localY + matrix[9] * localZ + matrix[13];
    const worldZ = matrix[2] * localX + matrix[6] * localY + matrix[10] * localZ + matrix[14];
    const worldOffset = vertex * 3;
    worldPositions[worldOffset] = worldX;
    worldPositions[worldOffset + 1] = worldY;
    worldPositions[worldOffset + 2] = worldZ;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(worldZ)) {
      finiteWorldPositions = false;
    } else {
      worldBoundsMin[0] = Math.min(worldBoundsMin[0], worldX);
      worldBoundsMin[1] = Math.min(worldBoundsMin[1], worldY);
      worldBoundsMin[2] = Math.min(worldBoundsMin[2], worldZ);
      worldBoundsMax[0] = Math.max(worldBoundsMax[0], worldX);
      worldBoundsMax[1] = Math.max(worldBoundsMax[1], worldY);
      worldBoundsMax[2] = Math.max(worldBoundsMax[2], worldZ);
      objectWorldMin[0] = Math.min(objectWorldMin[0], worldX);
      objectWorldMin[1] = Math.min(objectWorldMin[1], worldY);
      objectWorldMin[2] = Math.min(objectWorldMin[2], worldZ);
      objectWorldMax[0] = Math.max(objectWorldMax[0], worldX);
      objectWorldMax[1] = Math.max(objectWorldMax[1], worldY);
      objectWorldMax[2] = Math.max(objectWorldMax[2], worldZ);
    }
    if (
      !Number.isFinite(normals.getX(vertex)) ||
      !Number.isFinite(normals.getY(vertex)) ||
      !Number.isFinite(normals.getZ(vertex))
    ) {
      finiteNormals = false;
    }
  }
  const diagonalSquared =
    (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2;
  const areaThreshold = Math.max(diagonalSquared * 1e-12, 1e-18);
  const areaThresholdSquared = areaThreshold ** 2;
  const worldDiagonalSquared =
    (objectWorldMax[0] - objectWorldMin[0]) ** 2 +
    (objectWorldMax[1] - objectWorldMin[1]) ** 2 +
    (objectWorldMax[2] - objectWorldMin[2]) ** 2;
  const worldAreaThresholdSquared = Math.max(worldDiagonalSquared * 1e-12, 1e-18) ** 2;
  const seen = new Set();
  const seenWorld = new Set();
  let geometryDegenerate = 0;
  let geometryExactDegenerate = 0;
  let geometryDuplicate = 0;
  const examples = [];
  for (let offset = 0; offset < indices.count; offset += 3) {
    const ia = indices.getX(offset);
    const ib = indices.getX(offset + 1);
    const ic = indices.getX(offset + 2);
    if (
      !Number.isFinite(ia) || !Number.isFinite(ib) || !Number.isFinite(ic) ||
      !Number.isSafeInteger(ia) || !Number.isSafeInteger(ib) || !Number.isSafeInteger(ic) ||
      ia < 0 || ib < 0 || ic < 0 ||
      ia >= positions.count || ib >= positions.count || ic >= positions.count
    ) {
      indicesInRange = false;
      continue;
    }
    const ax = integerComponent(positions, ia, 0);
    const ay = integerComponent(positions, ia, 1);
    const az = integerComponent(positions, ia, 2);
    const abx = integerComponent(positions, ib, 0) - ax;
    const aby = integerComponent(positions, ib, 1) - ay;
    const abz = integerComponent(positions, ib, 2) - az;
    const acx = integerComponent(positions, ic, 0) - ax;
    const acy = integerComponent(positions, ic, 1) - ay;
    const acz = integerComponent(positions, ic, 2) - az;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const crossSquared = cx * cx + cy * cy + cz * cz;
    if (crossSquared <= areaThresholdSquared) {
      geometryDegenerate += 1;
      degenerateTriangles += 1;
      if (crossSquared === 0) {
        geometryExactDegenerate += 1;
        exactDegenerateTriangles += 1;
      }
      if (examples.length < 4) {
        examples.push({ offset, indices: [ia, ib, ic], crossSquared, areaThresholdSquared });
      }
    }
    const canonical = [
      vertexCoordinateId[ia],
      vertexCoordinateId[ib],
      vertexCoordinateId[ic],
    ].sort((left, right) => left - right).join(',');
    if (seen.has(canonical)) {
      geometryDuplicate += 1;
      duplicateTriangles += 1;
      if (examples.length < 4) {
        examples.push({ offset, indices: [ia, ib, ic], duplicateCoordinateKey: canonical });
      }
    } else {
      seen.add(canonical);
    }
    const aWorldOffset = ia * 3;
    const bWorldOffset = ib * 3;
    const cWorldOffset = ic * 3;
    const wabx = worldPositions[bWorldOffset] - worldPositions[aWorldOffset];
    const waby = worldPositions[bWorldOffset + 1] - worldPositions[aWorldOffset + 1];
    const wabz = worldPositions[bWorldOffset + 2] - worldPositions[aWorldOffset + 2];
    const wacx = worldPositions[cWorldOffset] - worldPositions[aWorldOffset];
    const wacy = worldPositions[cWorldOffset + 1] - worldPositions[aWorldOffset + 1];
    const wacz = worldPositions[cWorldOffset + 2] - worldPositions[aWorldOffset + 2];
    const wcx = waby * wacz - wabz * wacy;
    const wcy = wabz * wacx - wabx * wacz;
    const wcz = wabx * wacy - waby * wacx;
    if (wcx * wcx + wcy * wcy + wcz * wcz <= worldAreaThresholdSquared) {
      worldDegenerateTriangles += 1;
    }
    const worldCanonical = [
      `${worldPositions[aWorldOffset]},${worldPositions[aWorldOffset + 1]},${worldPositions[aWorldOffset + 2]}`,
      `${worldPositions[bWorldOffset]},${worldPositions[bWorldOffset + 1]},${worldPositions[bWorldOffset + 2]}`,
      `${worldPositions[cWorldOffset]},${worldPositions[cWorldOffset + 1]},${worldPositions[cWorldOffset + 2]}`,
    ].sort().join('|');
    if (seenWorld.has(worldCanonical)) worldDuplicateTriangles += 1;
    else seenWorld.add(worldCanonical);
  }
  if (geometryDegenerate || geometryDuplicate) {
    details.push({
      meshName: object.name,
      owner,
      arrayType: positions.array?.constructor?.name ?? null,
      normalized: positions.normalized === true,
      triangles: indices.count / 3,
      vertices: positions.count,
      degenerateTriangles: geometryDegenerate,
      exactDegenerateTriangles: geometryExactDegenerate,
      duplicateTriangles: geometryDuplicate,
      examples,
    });
  }
});

const result = {
  status:
    stableNames.size > 0 && selfContainedBuffers && selfContainedImages && exactExtensions &&
    finitePositions && finiteNormals && indicesInRange && finiteWorldMatrices &&
    nonSingularWorldMatrices && finiteWorldPositions &&
    ownerFailures === 0 && positionEncodingFailures === 0 && normalEncodingFailures === 0 &&
    degenerateTriangles === 0 && duplicateTriangles === 0 &&
    worldDegenerateTriangles === 0 && worldDuplicateTriangles === 0
      ? 'PASS'
      : 'FAIL',
  stableNodes: [...stableNames].sort(),
  selfContainedBuffers,
  selfContainedImages,
  internalBinChunks,
  exactExtensions,
  meshInstances,
  uniqueGeometries: checkedGeometry.size,
  uniqueGeometryTriangles,
  uniqueGeometryVertices,
  decodedGeometryBytes,
  sceneDrawTriangles,
  sceneDrawVertices,
  finitePositions,
  finiteNormals,
  indicesInRange,
  finiteWorldMatrices,
  nonSingularWorldMatrices,
  finiteWorldPositions,
  worldDegenerateTriangles,
  worldDuplicateTriangles,
  worldBoundsMetres: { min: worldBoundsMin, max: worldBoundsMax },
  ownerFailures,
  positionEncodingFailures,
  normalEncodingFailures,
  degenerateTriangles,
  exactDegenerateTriangles,
  duplicateTriangles,
  positionEncodings: [...positionEncodings].sort(),
  normalEncodings: [...normalEncodings].sort(),
  details,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status !== 'PASS') process.exitCode = 2;
