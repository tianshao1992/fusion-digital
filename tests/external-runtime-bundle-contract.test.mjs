import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshGPUInstancing, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { reorder } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import {
  EXL50U_GA_BUNDLE_ID,
  EXL50U_GA_MAX_BUNDLE_DECODED_BYTES,
  EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD,
  EXL50U_GA_PUBLICATION_NOTICE,
  EXL50U_GA_ROUTE_ROOT,
  extractExl50uGeneralAssemblyAssets,
  parseExl50uGeneralAssemblyAllowlist,
  renderExl50uGeneralAssemblyAllowlist,
} from "../scripts/assets/exl50u-general-assembly-runtime-contract.mjs";
import {
  inspectReviewedAnonymousGlb,
  projectDeviceManifest,
} from "../scripts/assets/project-exl50u-general-assembly-manifest.mjs";
import {
  activateExl50uGeneralAssemblyCatalog,
  validateExl50uGeneralAssemblyActivatedCard,
} from "../scripts/assets/activate-exl50u-general-assembly-catalog.mjs";
import {
  handleExternalRuntimeBundleCache,
  handleExternalRuntimeCaches,
} from "../scripts/deployment/prune-obsolete-runtime-assets.mjs";
import {
  assertExlReleaseTreeContainsOnlyLockedArtifacts,
  assertMetadataOnlyExlDirectoryEmpty,
  assertManifestMatchesLock,
  validateExl50uGeneralAssemblyActivatedCard as validateInstallerActivatedCard,
  validateRuntimeAssetLock,
  verifyPublicationNotice,
} from "../deploy/aliyun-hk/verify-runtime-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_PATH = join(ROOT, "scripts/assets/exl50u-general-assembly-manifest-template.json");
const ACTIVATION_CONTRACT_PATH = join(ROOT, "scripts/assets/exl50u-general-assembly-catalog-activation-contract.json");
const FORMAL_MANIFEST_PATH = join(ROOT, "public/models/exl50u-general-assembly-v1/model-manifest.json");

async function readOptionalJson(pathname) {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function directoryUrl(pathname) {
  return pathToFileURL(`${resolve(pathname)}${sep}`);
}

function fixtureFact(index, role) {
  const body = `TEST FIXTURE ONLY ${role} ${index}`;
  const sha256 = digest(body);
  const high = role === "high";
  const residentGeometryBytes = high ? 72 + index : 40;
  const instanceMatrixBytes = 2 * 16 * 4;
  return {
    filename: high
      ? `anonymous-shard-${String(index).padStart(2, "0")}.${sha256}.high.meshopt.glb`
      : `device.preview.${sha256}.meshopt.glb`,
    sha256,
    bytes: Buffer.byteLength(body),
    uniqueGeometryMeshes: 1,
    uniqueGeometryTriangles: high ? 4 + index : 4,
    uniqueGeometryVertices: high ? 5 + index : 4,
    placementInstances: 2,
    drawCalls: 1,
    sceneDrawTriangles: high ? (4 + index) * 2 : 4,
    decodedAccessorBytes: residentGeometryBytes + 20,
    decodedBufferViewBytes: residentGeometryBytes + 24,
    residentGeometryBytes,
    instanceMatrixBytes,
    decodedGpuBytes: residentGeometryBytes + instanceMatrixBytes,
    boundsMetres: {
      min: [-index - 1, -2, -3],
      max: [index + 1, 2, 3],
    },
  };
}

function fixtureDerivationEvidence() {
  return {
    kind: "anonymous-public-derivative",
    selectedAttempt: 1,
    selectedRatios: { preview: 0.1, high: 0.4 },
    qem: {
      receiptCount: 42,
      receiptSha256: digest("TEST QEM RECEIPTS"),
      targetMissCount: 2,
      retainedIrreducibleCount: 2,
    },
    coverage: {
      renderableDefinitions: 21,
      renderableOccurrences: 42,
      skippedDefinitions: 3,
      skippedOccurrences: 5,
      sourceDefinitions: 24,
      sourceOccurrences: 47,
      previewMissingDefinitions: 0,
      previewMissingOccurrences: 0,
      highMissingDefinitions: 0,
      highMissingOccurrences: 0,
    },
  };
}

async function fixtureManifest() {
  const template = JSON.parse(await readFile(TEMPLATE_PATH, "utf8"));
  return projectDeviceManifest({
    template,
    asOf: "2026-09-02",
    preview: fixtureFact(0, "preview"),
    shards: Array.from({ length: 20 }, (_value, index) => fixtureFact(index + 1, "high")),
    derivationEvidence: fixtureDerivationEvidence(),
  });
}

function canonicalBundleDigest(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => left.filename.localeCompare(right.filename, "en"))) {
    hash.update(`${file.filename}\0${file.bytes}\0${file.sha256}\n`);
  }
  return hash.digest("hex");
}

function exlFixtureBundle(manifest) {
  const { files, totalBytes } = extractExl50uGeneralAssemblyAssets(manifest);
  return {
    id: EXL50U_GA_BUNDLE_ID,
    title: "EXL-50U integrated-assembly anonymous browser visualization derivative",
    classification: "PUBLIC",
    redistributionAllowed: true,
    engineeringUseAllowed: false,
    sourceCadIncluded: false,
    licensePath: "public/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md",
    destinationRoot: "public/models/exl50u-general-assembly-v1",
    stageDirectoryName: EXL50U_GA_BUNDLE_ID,
    routeRoot: EXL50U_GA_ROUTE_ROOT,
    acquisition: {
      defaultBaseUrl: null,
      baseUrlEnv: "FUSION_EXL50U_GA_ASSET_BASE_URL",
      sourceDirEnv: "FUSION_EXL50U_GA_ASSET_SOURCE_DIR",
    },
    fileCount: files.length,
    totalBytes,
    aggregateSha256: canonicalBundleDigest(files),
    files,
  };
}

function metadataOnlyCatalogFixture(catalog) {
  const candidate = structuredClone(catalog);
  candidate.devices = candidate.devices.map((device) => (
    device.id === "exl50u-general-assembly-20260630"
      ? {
          id: "exl50u-general-assembly-20260630",
          availability: "pipeline-ready-assets-pending",
          delivery: "local-only",
          copy: "PIPELINE · ASSETS PENDING · 当前无可加载 GLB · 共同原点与视觉复核未完成",
          viewer: {
            mode: "metadata-only",
            manifestEndpoint: null,
            turntableManifestEndpoint: null,
            overlayEligible: false,
          },
          facts: ["八个通用系统", "公开派生待生成", "仅元数据"],
          physicsOverlays: [],
          diagnosticWorkspace: null,
        }
      : device
  ));
  return candidate;
}

async function writeAnonymousMeshoptFixture(pathname, { named = false } = {}) {
  await MeshoptEncoder.ready;
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  document.getRoot().setDefaultScene(scene);
  const root = document.createNode(named ? "FORBIDDEN_PRIVATE_NAME" : undefined);
  const meshNode = document.createNode();
  scene.addChild(root);
  root.addChild(meshNode);

  const vertexCount = 65_538;
  const positionValues = new Float32Array(vertexCount * 3);
  const normalValues = new Float32Array(vertexCount * 3);
  const indexValues = new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    positionValues[index * 3] = index % 2;
    positionValues[index * 3 + 1] = Math.floor(index / 2) % 2;
    positionValues[index * 3 + 2] = Math.floor(index / 4) % 2;
    normalValues[index * 3 + 2] = 1;
    indexValues[index] = index;
  }
  const positions = document.createAccessor()
    .setType(Accessor.Type.VEC3)
    .setArray(positionValues)
    .setBuffer(buffer);
  const normals = document.createAccessor()
    .setType(Accessor.Type.VEC3)
    .setArray(normalValues)
    .setBuffer(buffer);
  const indices = document.createAccessor()
    .setType(Accessor.Type.SCALAR)
    .setArray(indexValues)
    .setBuffer(buffer);
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", positions)
    .setAttribute("NORMAL", normals)
    .setIndices(indices);
  meshNode.setMesh(document.createMesh().addPrimitive(primitive));

  const translations = document.createAccessor()
    .setType(Accessor.Type.VEC3)
    .setArray(new Float32Array([0, 0, 0, 2, 0, 0]))
    .setBuffer(buffer);
  const instancing = document.createExtension(EXTMeshGPUInstancing).setRequired(true);
  meshNode.setExtension(
    "EXT_mesh_gpu_instancing",
    instancing.createInstancedMesh().setAttribute("TRANSLATION", translations),
  );
  await document.transform(reorder({ encoder: MeshoptEncoder, target: "size" }));
  document.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const io = new NodeIO()
    .registerExtensions([EXTMeshGPUInstancing, EXTMeshoptCompression])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  await io.write(pathname, document);
  await rewriteGlb(pathname, (json) => {
    // glTF-Transform adds its package version as free-form generator text.
    // Formal anonymous assets deliberately retain only asset.version.
    delete json.asset.generator;
  });
}

function readGlbContainer(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  assert.equal(view.getUint32(binHeader + 4, true), 0x004e4942);
  return {
    json,
    bin: bytes.subarray(binHeader + 8, binHeader + 8 + binLength),
  };
}

function encodeGlbContainer(json, bin) {
  const jsonRaw = Buffer.from(JSON.stringify(json), "utf8");
  const paddedJson = Buffer.concat([jsonRaw, Buffer.alloc((4 - (jsonRaw.length % 4)) % 4, 0x20)]);
  const paddedBin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const output = Buffer.alloc(12 + 8 + paddedJson.length + 8 + paddedBin.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(output, 20);
  const outputBinHeader = 20 + paddedJson.length;
  output.writeUInt32LE(paddedBin.length, outputBinHeader);
  output.writeUInt32LE(0x004e4942, outputBinHeader + 4);
  paddedBin.copy(output, outputBinHeader + 8);
  return output;
}

async function writeTwoPrimitiveAnonymousMeshoptFixture(pathname) {
  await writeAnonymousMeshoptFixture(pathname);
  const { json: source, bin: sourceBin } = readGlbContainer(await readFile(pathname));
  const sourcePrimitive = source.meshes[0].primitives[0];
  const sourceInstancedNode = source.nodes.find((node) => node.extensions?.EXT_mesh_gpu_instancing);
  const sourceTranslation = sourceInstancedNode.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION;
  const accessors = [];
  const bufferViews = [];
  const compressedParts = [];
  let compressedOffset = 0;
  let fallbackOffset = 0;
  const copyAccessor = (sourceAccessorIndex) => {
    const accessor = structuredClone(source.accessors[sourceAccessorIndex]);
    const bufferView = structuredClone(source.bufferViews[accessor.bufferView]);
    const compression = bufferView.extensions.EXT_meshopt_compression;
    const alignmentPadding = (4 - (compressedOffset % 4)) % 4;
    if (alignmentPadding > 0) {
      compressedParts.push(Buffer.alloc(alignmentPadding));
      compressedOffset += alignmentPadding;
    }
    compressedParts.push(Buffer.from(sourceBin.subarray(
      compression.byteOffset,
      compression.byteOffset + compression.byteLength,
    )));
    compression.byteOffset = compressedOffset;
    bufferView.byteOffset = fallbackOffset;
    accessor.bufferView = bufferViews.length;
    accessor.byteOffset = 0;
    bufferViews.push(bufferView);
    accessors.push(accessor);
    compressedOffset += compression.byteLength;
    fallbackOffset += bufferView.byteLength;
    return accessors.length - 1;
  };
  const translation = copyAccessor(sourceTranslation);
  const copyPrimitive = () => ({
    attributes: {
      POSITION: copyAccessor(sourcePrimitive.attributes.POSITION),
      NORMAL: copyAccessor(sourcePrimitive.attributes.NORMAL),
    },
    indices: copyAccessor(sourcePrimitive.indices),
    mode: sourcePrimitive.mode,
  });
  const primitives = [copyPrimitive(), copyPrimitive()];
  const compressedBin = Buffer.concat(compressedParts);
  const combined = {
    accessors,
    asset: { version: "2.0" },
    bufferViews,
    buffers: [
      { byteLength: compressedBin.byteLength },
      { byteLength: fallbackOffset, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
    extensionsRequired: ["EXT_mesh_gpu_instancing", "EXT_meshopt_compression"],
    extensionsUsed: ["EXT_mesh_gpu_instancing", "EXT_meshopt_compression"],
    meshes: [{ primitives }],
    nodes: [
      { children: [1] },
      { extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: translation } } }, mesh: 0 },
    ],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
  await writeFile(pathname, encodeGlbContainer(combined, compressedBin));
}

async function rewriteGlb(
  pathname,
  mutate,
  { appendBin = Buffer.alloc(0), jsonSourceTransform = (value) => value } = {},
) {
  const bytes = await readFile(pathname);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  assert.equal(view.getUint32(binHeader + 4, true), 0x004e4942);
  const bin = Buffer.concat([
    Buffer.from(bytes.subarray(binHeader + 8, binHeader + 8 + binLength)),
    appendBin,
  ]);
  mutate(json);
  const jsonRaw = Buffer.from(jsonSourceTransform(JSON.stringify(json)), "utf8");
  const paddedJson = Buffer.concat([jsonRaw, Buffer.alloc((4 - (jsonRaw.length % 4)) % 4, 0x20)]);
  const paddedBin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const output = Buffer.alloc(12 + 8 + paddedJson.length + 8 + paddedBin.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(output, 20);
  const outputBinHeader = 20 + paddedJson.length;
  output.writeUInt32LE(paddedBin.length, outputBinHeader);
  output.writeUInt32LE(0x004e4942, outputBinHeader + 4);
  paddedBin.copy(output, outputBinHeader + 8);
  await writeFile(pathname, output);
}

test("formal EXL-50U projection and checked-in catalog state remain coherent", async () => {
  const [manifest, formalManifest, catalog, lock, allowlistSource] = await Promise.all([
    fixtureManifest(),
    readOptionalJson(FORMAL_MANIFEST_PATH),
    readFile(join(ROOT, "public/models/device-catalog.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "assets/runtime-assets.lock.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "worker/exl50u-general-assembly-assets.generated.ts"), "utf8"),
  ]);
  const extracted = extractExl50uGeneralAssemblyAssets(manifest);
  assert.equal(extracted.files.length, 21);
  assert.equal(extracted.files[0].role, "preview");
  assert.equal(manifest.assets.shardBundles[0].rootNodeName, "EXL50U_GA_VISUALIZATION");
  assert.deepEqual(manifest.derivationEvidence, fixtureDerivationEvidence());
  assert.equal(
    manifest.assets.shardBundles[0].uniqueGeometryTriangles,
    manifest.assets.shardBundles[0].shards.reduce((sum, shard) => sum + shard.uniqueGeometryTriangles, 0),
  );
  assert.deepEqual(
    parseExl50uGeneralAssemblyAllowlist(renderExl50uGeneralAssemblyAllowlist(manifest)),
    extracted.files.map(({ role, filename, sha256, bytes }) => ({ role, filename, sha256, bytes })),
  );
  const oversizedPreview = structuredClone(manifest);
  oversizedPreview.assets.webModel.decodedGpuBytes = 192 * 1024 * 1024 + 1;
  assert.throws(
    () => extractExl50uGeneralAssemblyAssets(oversizedPreview),
    /public boundary/u,
  );
  const expensiveShard = structuredClone(manifest);
  expensiveShard.assets.shardBundles[0].shards[0].drawCalls = 801;
  assert.throws(
    () => extractExl50uGeneralAssemblyAssets(expensiveShard),
    /metrics or decoded budget/u,
  );
  const excessivePlacements = structuredClone(manifest);
  const placementIncrease = EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD + 1
    - excessivePlacements.assets.shardBundles[0].shards[0].placementInstances;
  excessivePlacements.assets.shardBundles[0].shards[0].placementInstances += placementIncrease;
  excessivePlacements.assets.shardBundles[0].placementInstances += placementIncrease;
  assert.throws(
    () => extractExl50uGeneralAssemblyAssets(excessivePlacements),
    /metrics or decoded budget/u,
  );
  const missingCoverage = structuredClone(manifest);
  missingCoverage.derivationEvidence.coverage.highMissingOccurrences = 1;
  assert.throws(
    () => extractExl50uGeneralAssemblyAssets(missingCoverage),
    /derivation evidence/u,
  );
  const overTriangleBudget = structuredClone(manifest);
  overTriangleBudget.assets.shardBundles[0].sceneDrawTriangles = 30_000_001;
  assert.throws(
    () => extractExl50uGeneralAssemblyAssets(overTriangleBudget),
    /anonymous visualization contract/u,
  );

  const card = catalog.devices.find((device) => device.id === "exl50u-general-assembly-20260630");
  const lockedBundle = lock.externalBundles.find((bundle) => bundle.id === EXL50U_GA_BUNDLE_ID);
  const allowlist = parseExl50uGeneralAssemblyAllowlist(allowlistSource);
  if (formalManifest) {
    const formalAssets = extractExl50uGeneralAssemblyAssets(formalManifest);
    assert.doesNotThrow(() => validateExl50uGeneralAssemblyActivatedCard(card));
    assert.ok(lockedBundle, "an activated formal manifest must have a locked external bundle");
    assert.doesNotThrow(() => assertManifestMatchesLock(formalManifest, lockedBundle));
    assert.deepEqual(
      allowlist,
      formalAssets.files.map(({ role, filename, sha256, bytes }) => ({ role, filename, sha256, bytes })),
    );
  } else {
    assert.equal(card.viewer.mode, "metadata-only");
    assert.equal(card.viewer.manifestEndpoint, null);
    assert.equal(lockedBundle, undefined);
    assert.deepEqual(allowlist, []);
  }
});

test("catalog activation replaces every stale pipeline claim with the reviewed anonymous real-3d contract", async () => {
  const [checkedInCatalog, manifest, activationContract] = await Promise.all([
    readFile(join(ROOT, "public/models/device-catalog.json"), "utf8").then(JSON.parse),
    fixtureManifest(),
    readFile(ACTIVATION_CONTRACT_PATH, "utf8").then(JSON.parse),
  ]);
  const catalog = metadataOnlyCatalogFixture(checkedInCatalog);
  const current = catalog.devices.find((device) => device.id === "exl50u-general-assembly-20260630");
  assert.throws(
    () => validateExl50uGeneralAssemblyActivatedCard(current),
    /active real-3d contract|stale pipeline copy/u,
  );
  const activated = activateExl50uGeneralAssemblyCatalog({ catalog, manifest, activationContract });
  const card = activated.devices.find((device) => device.id === "exl50u-general-assembly-20260630");
  assert.doesNotThrow(() => validateExl50uGeneralAssemblyActivatedCard(card));
  const privateExtra = structuredClone(card);
  privateExtra.privateSourceCad = "D:/private/source.stp";
  assert.throws(
    () => validateExl50uGeneralAssemblyActivatedCard(privateExtra),
    /exact active real-3d contract/u,
  );
  const forgedContract = structuredClone(activationContract);
  forgedContract.replacement.privateSourceCad = "D:/private/source.stp";
  assert.throws(
    () => activateExl50uGeneralAssemblyCatalog({ catalog, manifest, activationContract: forgedContract }),
    /incomplete or ambiguous/u,
  );
  assert.equal(card.viewer.manifestEndpoint, "/models/exl50u-general-assembly-v1/model-manifest.json");
  assert.equal(activated.asOf, manifest.asOf);
  for (const stale of [
    "PIPELINE · ASSETS PENDING",
    "当前无可加载 GLB",
    "无 GLB",
    "no loadable GLB",
    "8 个公开通用系统",
    "八个通用系统",
    "八系统",
    "共同原点与视觉复核未完成",
    "common-origin review pending",
  ]) {
    const drift = structuredClone(card);
    drift.copy = stale;
    assert.throws(() => validateExl50uGeneralAssemblyActivatedCard(drift), /stale pipeline copy/u);
  }
});

test("EXL publication policy stays PUBLIC and redistributable across projection, runtime, activation, lock, and installer", async () => {
  const [template, catalog, activationContract, currentLock] = await Promise.all([
    readFile(TEMPLATE_PATH, "utf8").then(JSON.parse),
    readFile(join(ROOT, "public/models/device-catalog.json"), "utf8").then(JSON.parse),
    readFile(ACTIVATION_CONTRACT_PATH, "utf8").then(JSON.parse),
    readFile(join(ROOT, "assets/runtime-assets.lock.json"), "utf8").then(JSON.parse),
  ]);
  const metadataCatalog = metadataOnlyCatalogFixture(catalog);
  const privateTemplate = structuredClone(template);
  privateTemplate.privateSourceCad = "D:/private/source.stp";
  assert.throws(() => projectDeviceManifest({
    template: privateTemplate,
    asOf: "2026-09-02",
    preview: fixtureFact(0, "preview"),
    shards: Array.from({ length: 20 }, (_value, index) => fixtureFact(index + 1, "high")),
    derivationEvidence: fixtureDerivationEvidence(),
  }), /exactly match/u);
  const privateManifest = await fixtureManifest();
  privateManifest.privateSourceCad = "D:/private/source.stp";
  assert.throws(() => extractExl50uGeneralAssemblyAssets(privateManifest), /public boundary/u);
  for (const [label, mutateManifest, mutateBundle] of [
    [
      "classification",
      (candidate) => { candidate.access.classification = "INTERNAL"; },
      (candidate) => { candidate.classification = "INTERNAL"; },
    ],
    [
      "redistribution",
      (candidate) => { candidate.access.redistributionAllowed = false; },
      (candidate) => { candidate.redistributionAllowed = false; },
    ],
    [
      "engineering use",
      (candidate) => { candidate.access.engineeringUseAllowed = true; },
      (candidate) => { candidate.engineeringUseAllowed = true; },
    ],
    [
      "source CAD",
      (candidate) => {
        candidate.assets ??= {};
        candidate.assets.sourceCad = { path: "/private/source.stp" };
      },
      (candidate) => { candidate.sourceCadIncluded = true; },
    ],
  ]) {
    const unsafeTemplate = structuredClone(template);
    mutateManifest(unsafeTemplate);
    assert.throws(() => projectDeviceManifest({
      template: unsafeTemplate,
      asOf: "2026-09-02",
      preview: fixtureFact(0, "preview"),
      shards: Array.from({ length: 20 }, (_value, index) => fixtureFact(index + 1, "high")),
      derivationEvidence: fixtureDerivationEvidence(),
    }), /public|redistributable|template/u, `${label}: projector`);

    const manifest = await fixtureManifest();
    const bundle = exlFixtureBundle(manifest);
    const unsafeManifest = structuredClone(manifest);
    mutateManifest(unsafeManifest);
    assert.throws(() => extractExl50uGeneralAssemblyAssets(unsafeManifest), /public boundary/u, `${label}: runtime`);
    assert.throws(
      () => activateExl50uGeneralAssemblyCatalog({
        catalog: metadataCatalog,
        manifest: unsafeManifest,
        activationContract,
      }),
      /public (?:redistributable|boundary)/u,
      `${label}: activation`,
    );
    assert.throws(
      () => assertManifestMatchesLock(unsafeManifest, bundle),
      /public boundary|missing or undeclared fields/u,
      `${label}: installer manifest`,
    );

    const unsafeBundle = structuredClone(bundle);
    mutateBundle(unsafeBundle);
    const unsafeLock = structuredClone(currentLock);
    unsafeLock.externalBundles = unsafeLock.externalBundles.filter(({ id }) => id !== EXL50U_GA_BUNDLE_ID);
    unsafeLock.externalBundles.push(unsafeBundle);
    assert.throws(() => validateRuntimeAssetLock(unsafeLock), /lock identity/u, `${label}: runtime lock`);
  }
});

test("Hong Kong installer mirrors the repository exact anonymous manifest and active-card contracts", async () => {
  const [manifest, activationContract] = await Promise.all([
    fixtureManifest(),
    readFile(ACTIVATION_CONTRACT_PATH, "utf8").then(JSON.parse),
  ]);
  const bundle = exlFixtureBundle(manifest);
  const activeCard = activationContract.replacement;
  assert.doesNotThrow(() => extractExl50uGeneralAssemblyAssets(manifest));
  assert.doesNotThrow(() => assertManifestMatchesLock(manifest, bundle));
  assert.doesNotThrow(() => validateExl50uGeneralAssemblyActivatedCard(activeCard));
  assert.doesNotThrow(() => validateInstallerActivatedCard(activeCard));

  const privateSourcePath = "D:/private/source/EXL50U-secret-assembly.stp";
  for (const [label, mutate] of [
    ["title", (candidate) => { candidate.title = privateSourcePath; }],
    ["derivation evidence extra", (candidate) => { candidate.derivationEvidence.privateSourcePath = privateSourcePath; }],
    ["system metadata extra", (candidate) => { candidate.systems[0].parts[0].sourcePath = privateSourcePath; }],
    ["generator metadata extra", (candidate) => { candidate.generator.conversion.sourcePath = privateSourcePath; }],
    ["disclaimer", (candidate) => { candidate.disclaimer = privateSourcePath; }],
  ]) {
    const unsafe = structuredClone(manifest);
    mutate(unsafe);
    assert.throws(
      () => extractExl50uGeneralAssemblyAssets(unsafe),
      undefined,
      `${label}: repository contract must reject private metadata`,
    );
    assert.throws(
      () => assertManifestMatchesLock(unsafe, bundle),
      undefined,
      `${label}: installer contract must reject private metadata`,
    );
  }

  for (const [label, mutate] of [
    ["title", (candidate) => { candidate.title = privateSourcePath; }],
    ["copy", (candidate) => { candidate.copy = privateSourcePath; }],
    ["fact", (candidate) => { candidate.facts[0] = privateSourcePath; }],
    ["extra field", (candidate) => { candidate.privateSourceCad = privateSourcePath; }],
  ]) {
    const unsafe = structuredClone(activeCard);
    mutate(unsafe);
    assert.throws(
      () => validateExl50uGeneralAssemblyActivatedCard(unsafe),
      undefined,
      `${label}: repository active-card contract must reject private metadata`,
    );
    assert.throws(
      () => validateInstallerActivatedCard(unsafe),
      undefined,
      `${label}: installer active-card contract must reject private metadata`,
    );
  }
});

test("projector inspects anonymous Meshopt/GPU-instanced GLBs without writing a root name", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-projector-"));
  const anonymousPath = join(scratch, "anonymous.glb");
  const namedPath = join(scratch, "named.glb");
  try {
    await writeAnonymousMeshoptFixture(anonymousPath);
    await writeAnonymousMeshoptFixture(namedPath, { named: true });
    const before = await readFile(anonymousPath);
    const fact = await inspectReviewedAnonymousGlb(anonymousPath);
    const after = await readFile(anonymousPath);
    assert.deepEqual(after, before, "inspection must be read-only");
    assert.equal(fact.uniqueGeometryMeshes, 1);
    assert.equal(fact.uniqueGeometryTriangles, 21_846);
    assert.equal(fact.uniqueGeometryVertices, 65_538);
    assert.equal(fact.placementInstances, 2);
    assert.equal(fact.drawCalls, 1);
    assert.equal(fact.sceneDrawTriangles, 43_692);
    assert.deepEqual(fact.boundsMetres, { min: [0, 0, 0], max: [3, 1, 1] });
    await assert.rejects(inspectReviewedAnonymousGlb(namedPath), /anonymous|whitelisted/u);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("projector counts a resident instance matrix for every decoded primitive", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-projector-multi-primitive-"));
  const pathname = join(scratch, "two-primitives.glb");
  try {
    await writeTwoPrimitiveAnonymousMeshoptFixture(pathname);
    const bytes = await readFile(pathname);
    const { json } = readGlbContainer(bytes);
    const fact = await inspectReviewedAnonymousGlb(pathname);
    const geometryBufferViews = new Set();
    for (const primitive of json.meshes[0].primitives) {
      for (const accessorIndex of [primitive.attributes.POSITION, primitive.attributes.NORMAL, primitive.indices]) {
        geometryBufferViews.add(json.accessors[accessorIndex].bufferView);
      }
    }
    const residentGeometryBytes = [...geometryBufferViews]
      .reduce((sum, index) => sum + json.bufferViews[index].byteLength, 0);
    const copies = json.accessors[
      json.nodes[1].extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION
    ].count;
    const instanceMatrixBytes = copies * json.meshes[0].primitives.length * 16 * 4;
    assert.equal(json.meshes[0].primitives.length, 2);
    assert.equal(fact.uniqueGeometryMeshes, 2);
    assert.equal(fact.placementInstances, 4, "Three creates two InstancedMesh objects with two copies each");
    assert.equal(fact.drawCalls, 2);
    assert.equal(fact.residentGeometryBytes, residentGeometryBytes);
    assert.equal(fact.instanceMatrixBytes, 256);
    assert.equal(fact.instanceMatrixBytes, instanceMatrixBytes);
    assert.equal(fact.decodedGpuBytes, residentGeometryBytes + instanceMatrixBytes);
    assert.ok(
      fact.instanceMatrixBytes > copies * 16 * 4,
      "counting one matrix array per source node would understate a multi-primitive mesh",
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("matrix-aware resident bytes participate in the 20-shard aggregate budget", async () => {
  const template = JSON.parse(await readFile(TEMPLATE_PATH, "utf8"));
  const decodedAccessorBytes = 76 * 1024 * 1024;
  const decodedBufferViewBytes = decodedAccessorBytes;
  const instanceMatrixBytes = EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD * 16 * 4;
  const residentGeometryBytes = decodedAccessorBytes;
  const residentBytesPerShard = residentGeometryBytes + instanceMatrixBytes;
  assert.ok(residentBytesPerShard < 96 * 1024 * 1024, "each shard remains below its resident byte cap");
  assert.ok(
    residentBytesPerShard * 20 > EXL50U_GA_MAX_BUNDLE_DECODED_BYTES,
    "instance matrices push the retained 20-shard group beyond the bundle cap",
  );
  const shards = Array.from({ length: 20 }, (_value, offset) => {
    const fact = fixtureFact(offset + 1, "high");
    return {
      ...fact,
      uniqueGeometryTriangles: 1,
      uniqueGeometryVertices: 3,
      placementInstances: EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD,
      sceneDrawTriangles: EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD,
      decodedAccessorBytes,
      decodedBufferViewBytes,
      residentGeometryBytes,
      instanceMatrixBytes,
      decodedGpuBytes: residentBytesPerShard,
    };
  });
  assert.throws(
    () => projectDeviceManifest({
      template,
      asOf: "2026-09-02",
      preview: fixtureFact(0, "preview"),
      shards,
      derivationEvidence: fixtureDerivationEvidence(),
    }),
    /aggregate decoded byte budget/u,
  );
});

test("projector rejects every non-whitelisted GLB container field and redundant payload", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-projector-negative-"));
  const source = join(scratch, "source.glb");
  try {
    await writeAnonymousMeshoptFixture(source);
    const mutations = [
      ["asset.generator", (json) => { json.asset.generator = "private exporter build"; }],
      ["asset.copyright", (json) => { json.asset.copyright = "private"; }],
      ["images", (json) => { json.images = [{ bufferView: 0, mimeType: "image/png" }]; }],
      ["textures", (json) => { json.textures = [{ source: 0 }]; }],
      ["animations", (json) => { json.animations = []; }],
      ["skins", (json) => { json.skins = []; }],
      ["cameras", (json) => { json.cameras = []; }],
      ["unknown extension", (json) => {
        json.extensionsUsed.push("KHR_xmp_json_ld");
        json.extensionsRequired.push("KHR_xmp_json_ld");
      }],
      ["instancing TRIANGLES storage", (json) => {
        const node = json.nodes.find((candidate) => candidate.extensions?.EXT_mesh_gpu_instancing);
        const accessorIndex = Object.values(node.extensions.EXT_mesh_gpu_instancing.attributes)[0];
        const viewIndex = json.accessors[accessorIndex].bufferView;
        json.bufferViews[viewIndex].extensions.EXT_meshopt_compression.mode = "TRIANGLES";
      }],
      ["oversized semantic stride", (json) => {
        const accessorIndex = json.meshes[0].primitives[0].attributes.POSITION;
        const targetViewIndex = json.accessors[accessorIndex].bufferView;
        const targetView = json.bufferViews[targetViewIndex];
        targetView.byteStride = 252;
        targetView.extensions.EXT_meshopt_compression.byteStride = 252;
        let fallbackOffset = 0;
        for (let index = 0; index < json.bufferViews.length; index += 1) {
          const view = json.bufferViews[index];
          const compression = view.extensions.EXT_meshopt_compression;
          view.byteOffset = fallbackOffset;
          view.byteLength = compression.count * compression.byteStride;
          fallbackOffset += view.byteLength;
        }
        json.buffers[1].byteLength = fallbackOffset;
      }],
      ["unreferenced bufferView", (json) => { json.bufferViews.push(structuredClone(json.bufferViews[0])); }],
      ["unreferenced accessor", (json) => { json.accessors.push(structuredClone(json.accessors[0])); }],
    ];
    for (const [label, mutate] of mutations) {
      const candidate = join(scratch, `${label.replaceAll(/[^a-z]+/giu, "-")}.glb`);
      await writeFile(candidate, await readFile(source));
      await rewriteGlb(candidate, mutate);
      await assert.rejects(inspectReviewedAnonymousGlb(candidate), undefined, label);
    }

    const trailing = join(scratch, "bin-tail.glb");
    await writeFile(trailing, await readFile(source));
    await rewriteGlb(
      trailing,
      (json) => { json.buffers[0].byteLength += 4; },
      { appendBin: Buffer.alloc(4) },
    );
    await assert.rejects(inspectReviewedAnonymousGlb(trailing), /redundant|tail/u);

    const duplicateKey = join(scratch, "duplicate-key.glb");
    await writeFile(duplicateKey, await readFile(source));
    await rewriteGlb(duplicateKey, () => {}, {
      jsonSourceTransform: (value) => value.replace(
        /^\{/u,
        '{"asset":{"version":"2.0","generator":"hidden private exporter"},',
      ),
    });
    await assert.rejects(inspectReviewedAnonymousGlb(duplicateKey), /duplicate object key: asset/u);

    await assert.rejects(
      inspectReviewedAnonymousGlb(source, { maxDecodedBytes: 1 }),
      /pre-decode memory/u,
    );
    const instanceExpansion = join(scratch, "instance-expansion.glb");
    await writeFile(instanceExpansion, await readFile(source));
    await rewriteGlb(instanceExpansion, (json) => {
      const node = json.nodes.find((candidate) => candidate.extensions?.EXT_mesh_gpu_instancing);
      const accessorIndex = node.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION;
      const accessor = json.accessors[accessorIndex];
      const targetView = json.bufferViews[accessor.bufferView];
      accessor.count = 3_000_000;
      targetView.extensions.EXT_meshopt_compression.count = accessor.count;
      let fallbackOffset = 0;
      for (const view of json.bufferViews) {
        const compression = view.extensions.EXT_meshopt_compression;
        view.byteOffset = fallbackOffset;
        view.byteLength = compression.count * compression.byteStride;
        fallbackOffset += view.byteLength;
      }
      json.buffers[1].byteLength = fallbackOffset;
    });
    await assert.rejects(
      inspectReviewedAnonymousGlb(instanceExpansion),
      /pre-decode memory|placement/u,
      "instancing expansion must fail before GLTFLoader allocates its matrices",
    );
    const oversizedFile = join(scratch, "oversized-before-read.glb");
    await writeFile(oversizedFile, Buffer.alloc(24 * 1024 * 1024));
    await assert.rejects(inspectReviewedAnonymousGlb(oversizedFile), /pre-decode file budget/u);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("runtime lock and formal manifest couple the optional EXL bundle without production placeholder hashes", async () => {
  const [manifest, currentLock] = await Promise.all([
    fixtureManifest(),
    readFile(join(ROOT, "assets/runtime-assets.lock.json"), "utf8").then(JSON.parse),
  ]);
  const exlBundle = exlFixtureBundle(manifest);
  const candidateLock = structuredClone(currentLock);
  candidateLock.externalBundles = candidateLock.externalBundles.filter(
    (bundle) => bundle.id !== EXL50U_GA_BUNDLE_ID,
  );
  candidateLock.externalBundles.push(exlBundle);
  assert.deepEqual(
    candidateLock.externalBundles.map((bundle) => bundle.id),
    ["iter-high-detail-v1", EXL50U_GA_BUNDLE_ID],
  );
  assert.doesNotThrow(() => validateRuntimeAssetLock(candidateLock));
  assert.doesNotThrow(() => assertManifestMatchesLock(manifest, exlBundle));
  const wrongNotice = structuredClone(candidateLock);
  wrongNotice.externalBundles[1].licensePath = "public/models/exl50u-general-assembly-v1/other.md";
  assert.throws(() => validateRuntimeAssetLock(wrongNotice), /identity/u);
  const tampered = structuredClone(manifest);
  tampered.assets.shardBundles[0].shards[7].bytes += 1;
  assert.throws(() => assertManifestMatchesLock(tampered, exlBundle), /differ|file set/u);
});

test("metadata-only Hong Kong release rejects every stray EXL package entry", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-metadata-only-"));
  const directory = join(scratch, "dist/client/models/exl50u-general-assembly-v1");
  try {
    await assert.doesNotReject(assertMetadataOnlyExlDirectoryEmpty(scratch));
    await mkdir(directory, { recursive: true });
    await assert.doesNotReject(assertMetadataOnlyExlDirectoryEmpty(scratch));
    for (const name of ["rogue.glb", "model-manifest.json", "PUBLICATION-NOTICE.md", "source.stp"]) {
      await writeFile(join(directory, name), "must fail");
      await assert.rejects(assertMetadataOnlyExlDirectoryEmpty(scratch), /must be empty/u, name);
      await rm(join(directory, name));
    }
    await mkdir(join(directory, "nested"));
    await assert.rejects(assertMetadataOnlyExlDirectoryEmpty(scratch), /must be empty/u);
    await rm(join(directory, "nested"), { recursive: true });

    const strayDirectory = join(scratch, "dist/client/elsewhere");
    await mkdir(strayDirectory, { recursive: true });
    const strayAsset = `anonymous-shard-01.${"a".repeat(64)}.high.meshopt.glb`;
    await writeFile(join(strayDirectory, strayAsset), "must fail");
    await assert.rejects(assertMetadataOnlyExlDirectoryEmpty(scratch), /across dist\/client/u);
    await rm(join(strayDirectory, strayAsset));

    await writeFile(join(strayDirectory, "exl-copy.json"), JSON.stringify({
      schemaVersion: "1.4",
      id: EXL50U_GA_BUNDLE_ID,
    }));
    await assert.rejects(assertMetadataOnlyExlDirectoryEmpty(scratch), /stray formal manifest/u);
    await rm(join(strayDirectory, "exl-copy.json"));

    await writeFile(
      join(strayDirectory, `${EXL50U_GA_BUNDLE_ID}.tgz`),
      "must fail",
    );
    await assert.rejects(assertMetadataOnlyExlDirectoryEmpty(scratch), /unlocked bundle/u);
    await rm(join(strayDirectory, `${EXL50U_GA_BUNDLE_ID}.tgz`));

    for (const name of ["EXL50U_general_assembly_bundle.zip", "renamed-source-cad.stp"]) {
      await writeFile(join(strayDirectory, name), "must fail");
      await assert.rejects(
        assertMetadataOnlyExlDirectoryEmpty(scratch),
        /source package/u,
        name,
      );
      await rm(join(strayDirectory, name));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("active Hong Kong release rejects anonymous GLBs outside its exact locked directory", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-active-tree-"));
  const manifest = await fixtureManifest();
  const bundle = exlFixtureBundle(manifest);
  const strayDirectory = join(scratch, "dist/client/public-copy");
  try {
    await mkdir(strayDirectory, { recursive: true });
    await assert.doesNotReject(assertExlReleaseTreeContainsOnlyLockedArtifacts(scratch, bundle));
    await writeFile(join(strayDirectory, bundle.files[1].filename), "unlocked copy");
    await assert.rejects(
      assertExlReleaseTreeContainsOnlyLockedArtifacts(scratch, bundle),
      /unlocked bundle, manifest, or asset/u,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("Hong Kong release rejects a byte-identical locked GLB renamed outside its locked path", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-glb-renamed-copy-"));
  try {
    const lock = JSON.parse(await readFile(join(ROOT, "assets/runtime-assets.lock.json"), "utf8"));
    const locked = lock.gitAssets.files.find((file) => file.path.endsWith(".glb"));
    assert.ok(locked, "fixture requires at least one Git-managed public GLB");
    const copied = join(scratch, "dist/client/models/copied/renamed.glb");
    await mkdir(dirname(copied), { recursive: true });
    await copyFile(join(ROOT, locked.path), copied);
    await assert.rejects(
      assertExlReleaseTreeContainsOnlyLockedArtifacts(scratch, null, lock),
      /unlocked GLB/u,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild preserves and verifies both Aliyun caches but removes only GLBs for Sites", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-two-runtime-bundles-"));
  const app = join(scratch, "app");
  const client = join(scratch, "dist/client");
  const lockPath = join(scratch, "runtime-assets.lock.json");
  const iterFixture = {
    id: "iter-high-detail-v1",
    filename: `component.${digest("iter")}.high.meshopt.glb`,
    body: "iter",
    bytes: Buffer.byteLength("iter"),
    sha256: digest("iter"),
  };
  const exlManifest = await fixtureManifest();
  const exlBundle = exlFixtureBundle(exlManifest);
  try {
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "page.tsx"), "export default function Page() { return null; }");
    const iterDirectory = join(client, "models", iterFixture.id);
    const exlDirectory = join(client, "models", EXL50U_GA_BUNDLE_ID);
    await mkdir(iterDirectory, { recursive: true });
    await mkdir(exlDirectory, { recursive: true });
    await writeFile(join(iterDirectory, iterFixture.filename), iterFixture.body);
    for (let index = 0; index < exlBundle.files.length; index += 1) {
      const role = index === 0 ? "preview" : "high";
      await writeFile(
        join(exlDirectory, exlBundle.files[index].filename),
        `TEST FIXTURE ONLY ${role} ${index}`,
      );
    }
    await writeFile(join(exlDirectory, "model-manifest.json"), JSON.stringify(exlManifest));
    await writeFile(join(exlDirectory, "PUBLICATION-NOTICE.md"), EXL50U_GA_PUBLICATION_NOTICE);
    await writeFile(lockPath, JSON.stringify({
      externalBundles: [{
        id: iterFixture.id,
        destinationRoot: `public/models/${iterFixture.id}`,
        fileCount: 1,
        totalBytes: iterFixture.bytes,
        files: [{
          filename: iterFixture.filename,
          bytes: iterFixture.bytes,
          sha256: iterFixture.sha256,
        }],
      }, exlBundle],
    }));
    const options = {
      clientUrl: directoryUrl(client),
      applicationUrl: directoryUrl(app),
      lockUrl: pathToFileURL(lockPath),
    };
    const preserved = await handleExternalRuntimeCaches({ ...options, mode: "public-anonymous" });
    assert.deepEqual(preserved.map((result) => result.action), ["preserved", "preserved"]);
    const removed = await handleExternalRuntimeCaches(options);
    assert.deepEqual(removed.map((result) => result.action), ["removed", "removed"]);
    await assert.rejects(readFile(join(iterDirectory, iterFixture.filename)), /ENOENT/u);
    for (const file of exlBundle.files) {
      await assert.rejects(readFile(join(exlDirectory, file.filename)), /ENOENT/u);
    }
    assert.equal(
      await readFile(join(exlDirectory, "model-manifest.json"), "utf8"),
      JSON.stringify(exlManifest),
    );
    assert.equal(
      await readFile(join(exlDirectory, "PUBLICATION-NOTICE.md"), "utf8"),
      EXL50U_GA_PUBLICATION_NOTICE,
    );

    // Sites also removes a known inactive EXL cache if someone accidentally
    // hydrated it before formal lock activation; the Aliyun target fails
    // closed on those same unlocked bytes.
    await writeFile(lockPath, JSON.stringify({
      externalBundles: [{
        id: iterFixture.id,
        destinationRoot: `public/models/${iterFixture.id}`,
        fileCount: 1,
        totalBytes: iterFixture.bytes,
        files: [{
          filename: iterFixture.filename,
          bytes: iterFixture.bytes,
          sha256: iterFixture.sha256,
        }],
      }],
    }));
    await mkdir(iterDirectory, { recursive: true });
    await mkdir(exlDirectory, { recursive: true });
    await writeFile(join(iterDirectory, iterFixture.filename), iterFixture.body);
    await writeFile(join(exlDirectory, exlBundle.files[0].filename), "inactive");
    await assert.rejects(
      handleExternalRuntimeCaches({ ...options, mode: "public-anonymous" }),
      /inactive exl50u-general-assembly-v1 contains unlocked GLBs/u,
    );
    const inactiveRemoved = await handleExternalRuntimeCaches(options);
    assert.deepEqual(inactiveRemoved.map((result) => result.action), ["removed", "removed"]);
    await assert.rejects(
      readFile(join(exlDirectory, exlBundle.files[0].filename)),
      /ENOENT/u,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("active EXL Sites postbuild rejects a missing, malformed, or lock-divergent manifest or notice", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-sites-manifest-"));
  const app = join(scratch, "app");
  const client = join(scratch, "dist/client");
  const lockPath = join(scratch, "runtime-assets.lock.json");
  const cache = join(client, "models", EXL50U_GA_BUNDLE_ID);
  const manifestPath = join(cache, "model-manifest.json");
  const noticePath = join(cache, "PUBLICATION-NOTICE.md");
  const manifest = await fixtureManifest();
  const bundle = exlFixtureBundle(manifest);
  const options = {
    bundleId: EXL50U_GA_BUNDLE_ID,
    clientUrl: directoryUrl(client),
    applicationUrl: directoryUrl(app),
    lockUrl: pathToFileURL(lockPath),
  };
  try {
    await mkdir(app, { recursive: true });
    await mkdir(cache, { recursive: true });
    await writeFile(join(app, "page.tsx"), "export default function Page() { return null; }");
    await writeFile(lockPath, JSON.stringify({ externalBundles: [bundle] }));

    await assert.rejects(
      handleExternalRuntimeBundleCache(options),
      /missing model-manifest\.json/u,
    );
    await writeFile(manifestPath, "not json");
    await assert.rejects(
      handleExternalRuntimeBundleCache(options),
      /model-manifest\.json is invalid/u,
    );

    const tampered = structuredClone(manifest);
    tampered.assets.shardBundles[0].shards[0].bytes += 1;
    await writeFile(manifestPath, JSON.stringify(tampered));
    await assert.rejects(
      handleExternalRuntimeBundleCache(options),
      /does not match its anonymous runtime contract/u,
    );

    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      handleExternalRuntimeBundleCache(options),
      /missing PUBLICATION-NOTICE\.md/u,
    );
    await writeFile(noticePath, "private source path: D:/restricted/source.stp");
    await assert.rejects(
      handleExternalRuntimeBundleCache(options),
      /differs from the fixed anonymous public contract/u,
    );
    await writeFile(noticePath, EXL50U_GA_PUBLICATION_NOTICE);
    await assert.doesNotReject(handleExternalRuntimeBundleCache(options));
    assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("Hong Kong verifier rejects a polluted EXL publication notice", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-exl50u-hk-notice-"));
  const bundle = exlFixtureBundle(await fixtureManifest());
  const noticePath = join(scratch, "dist/client/models", EXL50U_GA_BUNDLE_ID, "PUBLICATION-NOTICE.md");
  try {
    await mkdir(dirname(noticePath), { recursive: true });
    await writeFile(noticePath, "private source path: D:/restricted/source.stp");
    await assert.rejects(
      verifyPublicationNotice(scratch, bundle),
      /differs from the fixed anonymous public contract/u,
    );
    await writeFile(noticePath, EXL50U_GA_PUBLICATION_NOTICE);
    await assert.doesNotReject(verifyPublicationNotice(scratch, bundle));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild recursively rejects nested, case-shifted, linked, and non-file GLB cache entries", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-recursive-runtime-cache-"));
  const app = join(scratch, "app");
  const client = join(scratch, "dist/client");
  const lockPath = join(scratch, "runtime-assets.lock.json");
  const bundleId = "iter-high-detail-v1";
  const body = "locked-iter";
  const filename = `component.${digest(body)}.high.meshopt.glb`;
  const cache = join(client, "models", bundleId);
  const options = {
    bundleId,
    clientUrl: directoryUrl(client),
    applicationUrl: directoryUrl(app),
    lockUrl: pathToFileURL(lockPath),
  };
  try {
    await mkdir(app, { recursive: true });
    await mkdir(cache, { recursive: true });
    await writeFile(join(app, "page.tsx"), "export default function Page() { return null; }");
    await writeFile(join(cache, filename), body);
    await writeFile(lockPath, JSON.stringify({
      externalBundles: [{
        id: bundleId,
        destinationRoot: `public/models/${bundleId}`,
        fileCount: 1,
        totalBytes: Buffer.byteLength(body),
        files: [{ filename, bytes: Buffer.byteLength(body), sha256: digest(body) }],
      }],
    }));
    await assert.doesNotReject(handleExternalRuntimeBundleCache({ ...options, mode: "public-anonymous" }));

    const nested = join(cache, "nested");
    await mkdir(nested);
    for (const rogue of ["rogue.glb", "rogue.GLB"]) {
      await writeFile(join(nested, rogue), "rogue");
      await assert.rejects(
        handleExternalRuntimeBundleCache({ ...options, mode: "public-anonymous" }),
        /every locked GLB and no undeclared GLB/u,
        rogue,
      );
      await assert.rejects(
        handleExternalRuntimeBundleCache(options),
        /undeclared external GLB remains/u,
        `Sites ${rogue}`,
      );
      assert.equal(await readFile(join(cache, filename), "utf8"), body, "failure must precede pruning");
      await rm(join(nested, rogue));
    }

    const fakeGlbDirectory = join(nested, "directory.GLB");
    await mkdir(fakeGlbDirectory);
    await assert.rejects(
      handleExternalRuntimeBundleCache({ ...options, mode: "public-anonymous" }),
      /GLB is not a regular file/u,
    );
    await rm(fakeGlbDirectory, { recursive: true });

    const linkTarget = join(scratch, "link-target");
    const linkPath = join(cache, "linked-cache");
    await mkdir(linkTarget);
    await symlink(linkTarget, linkPath, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      handleExternalRuntimeBundleCache({ ...options, mode: "public-anonymous" }),
      /symbolic link/u,
    );
    await assert.rejects(handleExternalRuntimeBundleCache(options), /symbolic link/u);
    await rm(linkPath);

    const removed = await handleExternalRuntimeBundleCache(options);
    assert.deepEqual(removed, { action: "removed", bytes: Buffer.byteLength(body), fileCount: 0, totalBytes: 0 });
    await assert.rejects(readFile(join(cache, filename)), /ENOENT/u);

    // With no activated EXL lock, Sites removes every recursively discovered
    // regular GLB, while public-anonymous must reject the same bytes.
    const inactiveId = EXL50U_GA_BUNDLE_ID;
    const inactiveCache = join(client, "models", inactiveId, "nested");
    const inactiveGlb = join(inactiveCache, "inactive.GLB");
    await writeFile(lockPath, JSON.stringify({ externalBundles: [] }));
    await mkdir(inactiveCache, { recursive: true });
    await writeFile(inactiveGlb, "inactive");
    const inactiveOptions = { ...options, bundleId: inactiveId };
    await assert.rejects(
      handleExternalRuntimeBundleCache({ ...inactiveOptions, mode: "public-anonymous" }),
      /inactive exl50u-general-assembly-v1 contains unlocked GLBs/u,
    );
    await assert.doesNotReject(handleExternalRuntimeBundleCache(inactiveOptions));
    await assert.rejects(readFile(inactiveGlb), /ENOENT/u);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("Worker, Nginx, and installer expose only the reviewed EXL routes", async () => {
  const [worker, nginx, installer, formalContract] = await Promise.all([
    readFile(join(ROOT, "worker/index.ts"), "utf8"),
    readFile(join(ROOT, "deploy/aliyun-hk/nginx.conf"), "utf8"),
    readFile(join(ROOT, "deploy/aliyun-hk/install-release.sh"), "utf8"),
    readFile(join(ROOT, "deploy/formal-release-contract.json"), "utf8").then(JSON.parse),
  ]);
  assert.match(worker, /EXL50U_GENERAL_ASSEMBLY_RELEASE_ASSETS/u);
  assert.match(worker, /EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL/u);
  assert.match(worker, /protocol !== "https:"/u);
  assert.match(worker, /createExl50uGeneralAssemblyLocalFirstFetch/u);
  assert.match(nginx, /FUSIONDIGITAL_LOCKED_GLB_ROUTES_BEGIN/u);
  assert.doesNotMatch(nginx, /exl50u_ga_file/u);
  assert.match(nginx, /anonymous-shard-\(\?:[\s\S]*?return 404;/u);
  assert.match(nginx, /location ~\* \\.glb\$ \{ return 404; \}/u);
  assert.match(installer, /verify-runtime-assets\.mjs/u);
  assert.match(installer, /--runtime-lock "\$TARGET\/assets\/runtime-assets\.lock\.json"/u);
  assert.match(installer, /UNKNOWN_DEVICE_ASSET_STATUS[\s\S]*?= 404/u);
  assert.equal(formalContract.externalRuntimeAssets.bundles[1].id, EXL50U_GA_BUNDLE_ID);
  assert.equal(formalContract.externalRuntimeAssets.bundles[1].activation, "catalog-real-3d");
  assert.equal(formalContract.externalRuntimeAssets.sites.hydrated, false);
});
