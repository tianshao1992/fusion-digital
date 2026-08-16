#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicManifestPath = path.join(repoRoot, 'public', 'models', 'iter-public-simplified', 'model-manifest.json');
const workerContractPath = path.join(repoRoot, 'worker', 'iter-high-assets.generated.ts');
const maxDecodedBytes = 512 * 1024 * 1024;
const releaseBase = 'https://github.com/tianshao1992/fusion-physics-atlas-assets/releases/download/iter-education-hd-v1';
const publicGlbGenerator = 'glTF-Transform v4.4.2';
const publicGlbStatus = 'PUBLIC_VISUALIZATION_DERIVATIVE_REVIEWED';
const reviewedGlbFormat = 'glTF 2.0 binary + EXT_meshopt_compression + KHR_mesh_quantization; POSITION normalized Int16 per mesh; NORMAL normalized Int8 (8-bit)';
const execFileAsync = promisify(execFile);
const runtimeQaScript = path.join(repoRoot, 'scripts', 'iter', 'qa_meshopt_runtime.mjs');
const requiredQualityGates = new Set([
  'stablePartIdentity',
  'uniqueMeshOwnership',
  'meshopt',
  'quantization',
  'triangleTarget',
  'triangleDetailFloor95Percent',
  'bytesStrictlyBelow24MiB',
  'decodedGeometry',
  'productionRuntimeGeometry',
  'exactEncodingAndExtensions',
  'selfContainedGlb',
  'worldTransformGeometry',
  'postQuantizationTriangleRetention',
  'drawCallBudget',
  'bounds',
]);

function parseArgs() {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`Missing value for ${key ?? 'argument'}.`);
    values.set(key.slice(2), value);
  }
  const candidate = values.get('candidate');
  const release = values.get('release');
  const mode = values.get('mode') ?? 'stage';
  if (!candidate || !release) {
    throw new Error('Usage: node scripts/iter/integrate_iter_high_bundle.mjs --candidate <private-candidate-root> --release <external-release-root> [--mode stage|apply]');
  }
  if (mode !== 'stage' && mode !== 'apply') throw new Error(`Unsupported integration mode: ${mode}.`);
  return { candidate: path.resolve(candidate), release: path.resolve(release), mode };
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  const file = await readFile(filePath);
  hash.update(file);
  return hash.digest('hex');
}

function finiteBounds(value) {
  return value
    && Array.isArray(value.min) && value.min.length === 3
    && Array.isArray(value.max) && value.max.length === 3
    && value.min.every((coordinate, axis) => Number.isFinite(coordinate)
      && Number.isFinite(value.max[axis])
      && coordinate < value.max[axis]);
}

function boundsAgree(actual, expected, tolerance = 1e-4) {
  return finiteBounds(actual)
    && finiteBounds(expected)
    && ['min', 'max'].every((side) => actual[side].every(
      (coordinate, axis) => Math.abs(coordinate - expected[side][axis]) <= tolerance,
    ));
}

function assertPublicProjection(component) {
  const serialized = JSON.stringify(component);
  if (/([A-Za-z]:[\\/]|\/Users\/|\/home\/|private|source\.path)/i.test(serialized)) {
    throw new Error(`Public projection for ${component.partId} contains private provenance.`);
  }
}

async function assertPublicGlbMetadata(filePath, partId) {
  const bytes = await readFile(filePath);
  if (bytes.byteLength < 20
    || bytes.readUInt32LE(0) !== 0x46546c67
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error(`Shard ${partId} is not a complete glTF 2.0 binary.`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || 20 + jsonLength > bytes.byteLength) {
    throw new Error(`Shard ${partId} has no bounded GLB JSON chunk.`);
  }
  const jsonText = bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/[\u0000\u0020]+$/u, '');
  let document;
  try {
    document = JSON.parse(jsonText);
  } catch {
    throw new Error(`Shard ${partId} has invalid GLB JSON metadata.`);
  }
  const serialized = JSON.stringify(document);
  const extras = document?.asset?.extras;
  const binaryHeader = 20 + jsonLength;
  const binaryLength = binaryHeader + 8 <= bytes.byteLength ? bytes.readUInt32LE(binaryHeader) : -1;
  const binaryType = binaryHeader + 8 <= bytes.byteLength ? bytes.readUInt32LE(binaryHeader + 4) : -1;
  const buffers = Array.isArray(document?.buffers) ? document.buffers : [];
  const images = Array.isArray(document?.images) ? document.images : [];
  const primaryBuffer = buffers[0];
  if (document?.asset?.generator !== publicGlbGenerator
    || extras?.publicationStatus !== publicGlbStatus
    || Object.prototype.hasOwnProperty.call(extras ?? {}, 'candidateStatus')
    || binaryType !== 0x004e4942
    || binaryHeader + 8 + binaryLength !== bytes.byteLength
    || buffers.length === 0
    || !Number.isSafeInteger(primaryBuffer?.byteLength)
    || primaryBuffer.byteLength < 0
    || primaryBuffer.byteLength > binaryLength
    || binaryLength - primaryBuffer.byteLength > 3
    || buffers.some((buffer, index) => typeof buffer?.uri === 'string'
      || (index > 0 && buffer?.extensions?.EXT_meshopt_compression?.fallback !== true))
    || images.some((image) => typeof image?.uri === 'string' || !Number.isSafeInteger(image?.bufferView))
    || /(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/|\bprivate\b|source\.path|PRIVATE_PREVIEW_INCOMPLETE)/i.test(serialized)) {
    throw new Error(`Shard ${partId} is not a self-contained reviewed public-release GLB.`);
  }
}

async function verifyProductionRuntime(filePath, expectedNode, artifact) {
  const { stdout } = await execFileAsync(process.execPath, [runtimeQaScript, filePath], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 300_000,
  });
  const result = JSON.parse(stdout);
  if (result.status !== 'PASS'
    || JSON.stringify(result.stableNodes) !== JSON.stringify([expectedNode])
    || result.selfContainedBuffers !== true
    || result.selfContainedImages !== true
    || result.internalBinChunks !== 1
    || result.exactExtensions !== true
    || result.meshInstances !== artifact.meshInstances
    || result.uniqueGeometryTriangles !== artifact.triangles
    || result.uniqueGeometryVertices !== artifact.vertices
    || result.decodedGeometryBytes !== artifact.decodedGeometryBytes
    || result.sceneDrawTriangles !== artifact.sceneDrawTriangles
    || result.sceneDrawVertices !== artifact.sceneDrawVertices
    || result.finitePositions !== true
    || result.finiteNormals !== true
    || result.indicesInRange !== true
    || result.finiteWorldMatrices !== true
    || result.nonSingularWorldMatrices !== true
    || result.finiteWorldPositions !== true
    || result.ownerFailures !== 0
    || result.positionEncodingFailures !== 0
    || result.normalEncodingFailures !== 0
    || result.degenerateTriangles !== 0
    || result.exactDegenerateTriangles !== 0
    || result.duplicateTriangles !== 0
    || result.worldDegenerateTriangles !== 0
    || result.worldDuplicateTriangles !== 0
    || !boundsAgree(result.worldBoundsMetres, artifact.boundsMetres)
    || JSON.stringify(result.positionEncodings) !== JSON.stringify(['Int16Array:normalized'])
    || JSON.stringify(result.normalEncodings) !== JSON.stringify(['Int8Array:normalized'])) {
    throw new Error(`Production runtime QA disagrees with the reviewed artifact ${expectedNode}.`);
  }
  return result;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function atomicWriteText(target, contents) {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, target);
}

async function verifyAnonymousReleaseAsset(job) {
  const url = `${releaseBase}/${job.releaseFilename}`;
  const requestHeaders = { 'Accept-Encoding': 'identity' };
  const head = await fetch(url, {
    method: 'HEAD', headers: requestHeaders, redirect: 'follow', signal: AbortSignal.timeout(120_000),
  });
  if (
    head.status !== 200
    || Number(head.headers.get('Content-Length')) !== job.bytes
    || ![null, 'identity'].includes(head.headers.get('Content-Encoding'))
  ) {
    throw new Error(`Anonymous HEAD verification failed for ${job.releaseFilename}.`);
  }
  const range = await fetch(url, {
    headers: { ...requestHeaders, Range: 'bytes=0-63' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  if (
    range.status !== 206
    || range.headers.get('Content-Range') !== `bytes 0-63/${job.bytes}`
    || Number(range.headers.get('Content-Length')) !== Math.min(64, job.bytes)
    || ![null, 'identity'].includes(range.headers.get('Content-Encoding'))
  ) {
    await range.body?.cancel();
    throw new Error(`Anonymous Range verification failed for ${job.releaseFilename}.`);
  }
  await range.body?.cancel();

  const response = await fetch(url, {
    headers: requestHeaders, redirect: 'follow', signal: AbortSignal.timeout(300_000),
  });
  if (
    response.status !== 200
    || Number(response.headers.get('Content-Length')) !== job.bytes
    || ![null, 'identity'].includes(response.headers.get('Content-Encoding'))
    || !response.body
  ) {
    await response.body?.cancel();
    throw new Error(`Anonymous full-body verification failed for ${job.releaseFilename}.`);
  }
  const hash = createHash('sha256');
  let received = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > job.bytes) {
        await reader.cancel('reviewed byte budget exceeded');
        throw new Error(`Anonymous asset exceeded its reviewed budget: ${job.releaseFilename}.`);
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  const digest = hash.digest('hex');
  if (received !== job.bytes || digest !== job.sha256) {
    throw new Error(`Anonymous byte/hash verification failed for ${job.releaseFilename}.`);
  }
  return { url, bytes: received, sha256: digest, headStatus: head.status, rangeStatus: range.status };
}

const { candidate, release, mode } = parseArgs();
const canonicalRepoRoot = await realpath(repoRoot);
const canonicalCandidate = await realpath(candidate);
if (isWithin(canonicalRepoRoot.toLowerCase(), canonicalCandidate.toLowerCase())) {
  throw new Error('Private candidate must remain outside the source repository.');
}
if (isWithin(canonicalRepoRoot.toLowerCase(), release.toLowerCase())) {
  throw new Error('Release staging must remain outside the source repository.');
}
const shardsRoot = path.join(candidate, 'shards');
const canonicalShardsRoot = await realpath(shardsRoot);
if (!isWithin(canonicalCandidate.toLowerCase(), canonicalShardsRoot.toLowerCase())) {
  throw new Error('Reviewed shards directory escapes the private candidate root.');
}
const filenames = (await readdir(shardsRoot)).filter((name) => name.endsWith('.high.manifest.json')).sort();
if (filenames.length !== 18) throw new Error(`Expected 18 reviewed shard manifests, found ${filenames.length}.`);
const candidatePackage = JSON.parse(await readFile(path.join(canonicalCandidate, 'manifest.candidate.json'), 'utf8'));
if (
  candidatePackage?.schemaVersion !== 'fusiondigital.iter.high-shard-package.v1'
  || !Number.isSafeInteger(candidatePackage?.budgets?.targetTriangles)
  || candidatePackage.budgets.targetTriangles <= 0
) {
  throw new Error('Reviewed candidate package has no valid versioned triangle budget.');
}

const publicManifest = JSON.parse(await readFile(publicManifestPath, 'utf8'));
const publicPartByNode = new Map(
  publicManifest.systems.flatMap((system) => system.parts).map((part) => [part.nodeName, part.id]),
);
if (publicPartByNode.size !== 18) throw new Error('Public ITER manifest must declare exactly 18 stable parts.');

const components = [];
const copyJobs = [];
const seenNodes = new Set();
const seenDigests = new Set();
const pipelineVersions = new Set();
let reviewedTargetTriangles = 0;
for (const filename of filenames) {
  const record = JSON.parse(await readFile(path.join(shardsRoot, filename), 'utf8'));
  const slugFromFilename = filename.slice(0, -'.high.manifest.json'.length);
  const gates = record.qualityGates;
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
    throw new Error(`${slugFromFilename} has no reviewed quality-gate record.`);
  }
  for (const gate of requiredQualityGates) {
    if (gates[gate] !== 'PASS') throw new Error(`${slugFromFilename} failed required quality gate ${gate}=${gates[gate]}.`);
  }
  const failedGate = Object.entries(gates).find(([, status]) => status !== 'PASS');
  if (failedGate) throw new Error(`${slugFromFilename} failed quality gate ${failedGate[0]}=${failedGate[1]}.`);
  const artifact = record.artifact;
  const pipelineVersion = record.buildFingerprint?.pipelineVersion;
  const targetTriangles = record.buildFingerprint?.targetTriangles;
  if (typeof pipelineVersion !== 'string' || pipelineVersion.trim() === ''
    || !Number.isSafeInteger(targetTriangles) || targetTriangles <= 0) {
    throw new Error(`${slugFromFilename} has no valid reviewed build fingerprint.`);
  }
  pipelineVersions.add(pipelineVersion);
  reviewedTargetTriangles += targetTriangles;
  const nodeName = record.stableNode;
  const expectedNodeName = `ITER_PART__${slugFromFilename}`;
  if (
    record.partId !== slugFromFilename
    || record.nodeName !== expectedNodeName
    || nodeName !== expectedNodeName
    || JSON.stringify(artifact?.stableNodes) !== JSON.stringify([expectedNodeName])
    || typeof nodeName !== 'string'
    || seenNodes.has(nodeName)
  ) {
    throw new Error(`Invalid or duplicate stable node in ${filename}.`);
  }
  const publicPartId = publicPartByNode.get(nodeName);
  if (!publicPartId) throw new Error(`Private shard ${nodeName} has no exact public part identity.`);
  const slug = nodeName.slice('ITER_PART__'.length);
  const sourceFile = path.resolve(candidate, artifact.path);
  const canonicalSourceFile = await realpath(sourceFile);
  if (!isWithin(canonicalShardsRoot.toLowerCase(), canonicalSourceFile.toLowerCase())) {
    throw new Error(`Shard ${slug} escapes the reviewed candidate directory.`);
  }
  const sourceStat = await stat(sourceFile);
  const digest = await sha256(sourceFile);
  if (sourceStat.size !== artifact.bytes || digest.toUpperCase() !== String(artifact.sha256).toUpperCase()) {
    throw new Error(`Shard ${slug} no longer matches its reviewed byte/hash declaration.`);
  }
  if (!finiteBounds(artifact.boundsMetres)) throw new Error(`Shard ${slug} has invalid metre-space bounds.`);
  if (artifact.format !== reviewedGlbFormat) {
    throw new Error(`Shard ${slug} does not declare the exact reviewed runtime encoding.`);
  }
  await assertPublicGlbMetadata(canonicalSourceFile, slug);
  await verifyProductionRuntime(canonicalSourceFile, expectedNodeName, artifact);
  for (const field of [
    'triangles', 'vertices', 'sceneDrawTriangles', 'sceneDrawVertices',
    'meshInstances', 'decodedGeometryBytes',
  ]) {
    if (!Number.isSafeInteger(artifact[field]) || artifact[field] <= 0) {
      throw new Error(`Shard ${slug} has invalid ${field} metadata.`);
    }
  }
  if (
    sourceStat.size >= 24 * 1024 * 1024
    || artifact.sceneDrawTriangles < artifact.triangles
    || artifact.sceneDrawVertices < artifact.vertices
    || artifact.meshInstances > 300
    || seenDigests.has(digest)
    || record.postQuantizationRepair !== null
    || record.rawReduction?.quantizationRiskTrianglesRemoved !== 0
    || artifact.productionRuntimeQa?.status !== 'PASS'
    || artifact.productionRuntimeQa?.finitePositions !== true
    || artifact.productionRuntimeQa?.finiteNormals !== true
    || artifact.productionRuntimeQa?.indicesInRange !== true
    || artifact.productionRuntimeQa?.exactExtensions !== true
    || artifact.productionRuntimeQa?.finiteWorldMatrices !== true
    || artifact.productionRuntimeQa?.nonSingularWorldMatrices !== true
    || artifact.productionRuntimeQa?.finiteWorldPositions !== true
    || artifact.productionRuntimeQa?.ownerFailures !== 0
    || artifact.productionRuntimeQa?.positionEncodingFailures !== 0
    || artifact.productionRuntimeQa?.normalEncodingFailures !== 0
    || artifact.productionRuntimeQa?.degenerateTriangles !== 0
    || artifact.productionRuntimeQa?.duplicateTriangles !== 0
    || artifact.productionRuntimeQa?.worldDegenerateTriangles !== 0
    || artifact.productionRuntimeQa?.worldDuplicateTriangles !== 0
    || !boundsAgree(artifact.productionRuntimeQa?.worldBoundsMetres, artifact.boundsMetres)
    || JSON.stringify(artifact.productionRuntimeQa?.positionEncodings) !== JSON.stringify(['Int16Array:normalized'])
    || JSON.stringify(artifact.productionRuntimeQa?.normalEncodings) !== JSON.stringify(['Int8Array:normalized'])
  ) {
    throw new Error(`Shard ${slug} does not satisfy the no-loss production runtime contract.`);
  }
  const releaseFilename = `${slug}.${digest}.high.meshopt.glb`;
  const component = {
    partId: publicPartId,
    nodeName,
    path: `/device-assets/iter-high-detail/v1/${releaseFilename}`,
    format: artifact.format,
    sha256: digest,
    bytes: artifact.bytes,
    triangles: artifact.triangles,
    vertices: artifact.vertices,
    sceneDrawTriangles: artifact.sceneDrawTriangles,
    sceneDrawVertices: artifact.sceneDrawVertices,
    meshInstances: artifact.meshInstances,
    decodedGpuBytes: artifact.decodedGeometryBytes,
    boundsMetres: artifact.boundsMetres,
  };
  assertPublicProjection(component);
  copyJobs.push({ sourceFile: canonicalSourceFile, releaseFilename, bytes: artifact.bytes, sha256: digest });
  components.push(component);
  seenNodes.add(nodeName);
  seenDigests.add(digest);
}

components.sort((left, right) => left.nodeName.localeCompare(right.nodeName));
const formats = new Set(components.map((component) => component.format));
if (formats.size !== 1) throw new Error('All high-detail shards must use one exact reviewed format declaration.');
if (pipelineVersions.size !== 1 || reviewedTargetTriangles !== candidatePackage.budgets.targetTriangles) {
  throw new Error('Reviewed shards do not share the candidate package pipeline version and triangle budget.');
}
const union = {
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
};
for (const component of components) {
  for (let axis = 0; axis < 3; axis += 1) {
    union.min[axis] = Math.min(union.min[axis], component.boundsMetres.min[axis]);
    union.max[axis] = Math.max(union.max[axis], component.boundsMetres.max[axis]);
  }
}
const sum = (field) => components.reduce((total, component) => total + component[field], 0);
const bundle = {
  id: 'iter-high-v1',
  label: 'ITER 高清教育可视化',
  quality: 'high',
  delivery: 'components',
  format: components[0].format,
  bytes: sum('bytes'),
  triangles: sum('triangles'),
  vertices: sum('vertices'),
  sceneDrawTriangles: sum('sceneDrawTriangles'),
  sceneDrawVertices: sum('sceneDrawVertices'),
  meshInstances: sum('meshInstances'),
  decodedGpuBytes: sum('decodedGpuBytes'),
  boundsMetres: union,
  components,
};
if (bundle.bytes < 80_000_000 || bundle.bytes > 110_000_000) throw new Error(`Transfer budget out of range: ${bundle.bytes}.`);
if (bundle.decodedGpuBytes > maxDecodedBytes) throw new Error(`Decoded geometry budget exceeds 512 MiB: ${bundle.decodedGpuBytes}.`);
if (bundle.meshInstances > 1_000) throw new Error(`Draw-call budget exceeds 1,000 mesh instances: ${bundle.meshInstances}.`);

const releaseManifest = {
  schemaVersion: 'fusiondigital.iter.public-high-assets.v1',
  release: 'iter-education-hd-v1',
  assetRepository: 'tianshao1992/fusion-physics-atlas-assets',
  bundle,
};
const workerMap = Object.fromEntries(components.map((component) => [component.path, {
  filename: path.basename(component.path),
  bytes: component.bytes,
  sha256: component.sha256,
}]));

await mkdir(release, { recursive: true });
const canonicalRelease = await realpath(release);
if (isWithin(canonicalRepoRoot.toLowerCase(), canonicalRelease.toLowerCase())) {
  throw new Error('Canonical release staging resolves inside the source repository.');
}

if (mode === 'stage') {
  const existingReleaseEntries = await readdir(canonicalRelease);
  if (existingReleaseEntries.length > 0) throw new Error(`Release staging is not empty: ${canonicalRelease}.`);
  await mkdir(path.join(canonicalRelease, 'assets'));
  await Promise.all(copyJobs.map(({ sourceFile, releaseFilename }) => (
    copyFile(sourceFile, path.join(canonicalRelease, 'assets', releaseFilename))
  )));
  await atomicWriteText(
    path.join(canonicalRelease, 'release-manifest.json'),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );
  await atomicWriteText(
    path.join(canonicalRelease, 'worker-map.json'),
    `${JSON.stringify(workerMap, null, 2)}\n`,
  );
} else {
  const stagedManifest = JSON.parse(await readFile(path.join(canonicalRelease, 'release-manifest.json'), 'utf8'));
  if (JSON.stringify(stagedManifest) !== JSON.stringify(releaseManifest)) {
    throw new Error('Staged release manifest no longer matches the reviewed candidate projection.');
  }
  const assetNames = (await readdir(path.join(canonicalRelease, 'assets'))).sort();
  const expectedAssetNames = copyJobs.map((job) => job.releaseFilename).sort();
  if (JSON.stringify(assetNames) !== JSON.stringify(expectedAssetNames)) {
    throw new Error('Staged release asset set is not the exact reviewed 18-file set.');
  }
  for (const job of copyJobs) {
    const stagedAsset = path.join(canonicalRelease, 'assets', job.releaseFilename);
    const stagedStat = await stat(stagedAsset);
    if (stagedStat.size !== job.bytes || await sha256(stagedAsset) !== job.sha256) {
      throw new Error(`Staged release asset changed after review: ${job.releaseFilename}.`);
    }
    const component = components.find((item) => item.sha256 === job.sha256);
    if (!component) throw new Error(`Staged release asset has no reviewed component: ${job.releaseFilename}.`);
    await assertPublicGlbMetadata(stagedAsset, component.nodeName);
    await verifyProductionRuntime(stagedAsset, component.nodeName, {
      triangles: component.triangles,
      vertices: component.vertices,
      sceneDrawTriangles: component.sceneDrawTriangles,
      sceneDrawVertices: component.sceneDrawVertices,
      meshInstances: component.meshInstances,
      decodedGeometryBytes: component.decodedGpuBytes,
      boundsMetres: component.boundsMetres,
    });
  }
  const liveVerification = [];
  for (const job of copyJobs) liveVerification.push(await verifyAnonymousReleaseAsset(job));
  await atomicWriteText(
    path.join(canonicalRelease, 'live-verification-receipt.json'),
    `${JSON.stringify({ verifiedAt: new Date().toISOString(), assets: liveVerification }, null, 2)}\n`,
  );
}

if (mode === 'apply') {
  publicManifest.assets.componentBundles = [bundle];
  publicManifest.generator.conversion = {
    ...publicManifest.generator.conversion,
    converter: 'FusionDigital ITER reviewed component-shard pipeline',
    converterVersion: `${[...pipelineVersions][0]} / glTF-Transform 4.4.2`,
    highDetailTargetTriangles: reviewedTargetTriangles,
    highDetailPublishedTriangles: bundle.triangles,
    highDetailTransferBytes: bundle.bytes,
    highDetailMeshInstances: bundle.meshInstances,
    normalQuantizationBits: 8,
  };
  publicManifest.coverage.highDetail = {
  delivery: '18 independently verified immutable component shards',
  transferBytes: bundle.bytes,
  triangles: bundle.triangles,
  sceneDrawTriangles: bundle.sceneDrawTriangles,
  vertices: bundle.vertices,
  decodedGpuBytes: bundle.decodedGpuBytes,
  };
  const generatedWorkerContract = [
    '// Generated by scripts/iter/integrate_iter_high_bundle.mjs after all 18',
    '// immutable release assets pass review. An empty contract fails closed.',
    'export const ITER_HIGH_DETAIL_RELEASE_ASSETS = [',
    ...components.map((component) => {
      const partId = component.nodeName.slice('ITER_PART__'.length);
      return `  { partId: ${JSON.stringify(partId)}, sha256: ${JSON.stringify(component.sha256)}, bytes: ${component.bytes} },`;
    }),
    '] as const;',
    '',
  ].join('\n');
  // Both files are staged and individually replaced atomically. The source
  // tree is not publishable until the cross-file production tests pass.
  await atomicWriteText(workerContractPath, generatedWorkerContract);
  await atomicWriteText(publicManifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  files: components.length,
  bytes: bundle.bytes,
  triangles: bundle.triangles,
  vertices: bundle.vertices,
  decodedGpuBytes: bundle.decodedGpuBytes,
  release: canonicalRelease,
  mode,
}, null, 2));
