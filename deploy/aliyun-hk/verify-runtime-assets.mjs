#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const LOCK_SCHEMA = "fusiondigital.runtime-assets.v1";
const ITER_ID = "iter-high-detail-v1";
const EXL_ID = "exl50u-general-assembly-v1";
const EXL_DEVICE_ID = "exl50u-general-assembly-20260630";
const EXL_MANIFEST_ENDPOINT = "/models/exl50u-general-assembly-v1/model-manifest.json";
const EXL_ASSET_FORMAT = "glTF 2.0 binary + EXT_meshopt_compression + EXT_mesh_gpu_instancing; POSITION Float32; NORMAL normalized Int8 (8-bit); indices Uint32";
const EXL_FILE_COUNT = 21;
const EXL_SHARD_COUNT = 20;
const EXL_MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const EXL_MAX_SHARD_BYTES = 24 * 1024 * 1024;
const EXL_MAX_PREVIEW_BYTES = 12 * 1024 * 1024;
const EXL_MAX_PREVIEW_DECODED_BYTES = 192 * 1024 * 1024;
const EXL_MAX_SHARD_DECODED_BYTES = 96 * 1024 * 1024;
const EXL_MAX_BUNDLE_DECODED_BYTES = 1_536 * 1024 * 1024;
const EXL_MAX_PLACEMENT_INSTANCES_PER_SHARD = 250_000;
const EXL_MAX_SCENE_TRIANGLES = 30_000_000;
const EXL_MAX_DRAW_CALLS = 800;
const EXL_PUBLICATION_NOTICE = [
  "# EXL-50U general-assembly public visualization derivative",
  "",
  "This package contains only anonymous, simplified browser visualization derivatives. It contains no source CAD, PMI, dimension annotations, authoritative dimension tables, BOM, source assembly tree or engineering authority. Browser geometry retains an approximate metre-scale envelope for appearance visualization, but it is not a dimensional authority and must not be used for measurement or engineering dimensions. The 20 high-detail files are transport shards, not engineering systems.",
  "",
].join("\n");
const SHA256 = /^[a-f0-9]{64}$/u;
const ITER_PARTS = [
  "cryostat-base", "cryostat-lower", "cryostat-top", "cryostat-upper", "cs", "divertor",
  "pf1", "pf2", "pf3", "pf4", "pf5", "pf6", "tf-a", "tf-b", "vv1", "vv2", "vv3", "vv4",
];
const LOCK_ROOT_KEYS = ["schemaVersion", "generatedAt", "gitAssets", "externalBundles"];
const GIT_ASSET_KEYS = ["root", "acquisition", "excludes", "fileCount", "totalBytes", "treeSha256", "files"];
const BUNDLE_KEYS = [
  "id", "title", "classification", "engineeringUseAllowed", "sourceCadIncluded",
  "licensePath", "destinationRoot", "stageDirectoryName", "routeRoot", "acquisition",
  "fileCount", "totalBytes", "aggregateSha256", "files",
];
const EXL_CARD_KEYS = [
  "id", "index", "title", "eyebrow", "state", "tone", "facts", "deviceOverview",
  "fileSummary", "copy", "availability", "delivery", "comparisonFrame", "statement",
  "viewer", "physicsOverlays", "diagnosticWorkspace",
];
const EXL_VIEWER_KEYS = [
  "mode", "manifestEndpoint", "turntableManifestEndpoint", "overlayEligible",
];
const EXL_MANIFEST_KEYS = [
  "schemaVersion", "id", "title", "asOf", "devicePackage", "access", "coordinateSystem",
  "assets", "derivationEvidence", "systems", "generator", "disclaimer",
];
const EXL_SHARD_METRICS = [
  "uniqueGeometryMeshes", "uniqueGeometryTriangles", "uniqueGeometryVertices",
  "placementInstances", "drawCalls", "sceneDrawTriangles", "decodedGpuBytes",
];
const EXL_WEB_MODEL_KEYS = [
  "path", "format", "sha256", "bytes", "triangles", "vertices", "decodedGpuBytes", "boundsMetres",
];
const EXL_WEB_MODEL_VARIANT_KEYS = ["id", "label", "quality", "default", ...EXL_WEB_MODEL_KEYS];
const EXL_SHARD_BUNDLE_KEYS = [
  "id", "label", "quality", "delivery", "format", "rootNodeName", "extensionsRequired", "grouping",
  "bytes", ...EXL_SHARD_METRICS, "boundsMetres", "shards",
];
const EXL_SHARD_KEYS = [
  "id", "index", "path", "sha256", "bytes", "uniqueGeometryMeshes", "uniqueGeometryTriangles",
  "uniqueGeometryVertices", "placementInstances", "drawCalls", "sceneDrawTriangles", "decodedGpuBytes",
  "boundsMetres",
];
const EXL_GROUPING_KEYS = [
  "kind", "engineeringSemantic", "engineeringUseAllowed", "representsBom",
  "representsEngineeringSystems", "representsAssemblyTree",
];
const EXL_PREVIEW_ROUTE = /^\/device-assets\/exl50u-general-assembly\/v1\/(device\.preview\.([a-f0-9]{64})\.meshopt\.glb)$/u;
const EXL_SHARD_ROUTE = /^\/device-assets\/exl50u-general-assembly\/v1\/(anonymous-shard-(0[1-9]|1[0-9]|20)\.([a-f0-9]{64})\.high\.meshopt\.glb)$/u;

// Keep the installer self-contained: the production archive intentionally does
// not include scripts/assets. These immutable fields mirror the repository-side
// projector template and make private metadata impossible to smuggle into an
// otherwise digest-correct manifest.
const EXL_FIXED_MANIFEST_FIELDS = Object.freeze({
  schemaVersion: "1.4",
  id: EXL_ID,
  title: "EXL-50U integrated general-assembly visualization",
  devicePackage: {
    kind: "public-simplified-derivative",
    deviceClass: "EXL-50U integrated general assembly",
    authority: "illustrative",
    replacementContract: [
      "all browser files pass the anonymous public-derivative QA gates",
      "the original CAD, assembly tree, PMI, dimension annotations, authoritative dimension tables and BOM are excluded",
      "the public visualization geometry retains an approximate metre-scale envelope but is not a dimensional authority",
      "all routes, byte lengths and SHA-256 digests are generated from reviewed GLBs",
      "the 20 high-detail groups are anonymous transport shards and not engineering systems",
    ],
  },
  access: {
    classification: "PUBLIC",
    redistributionAllowed: true,
    engineeringUseAllowed: false,
    statement: "Public anonymous visualization derivative only. It excludes source CAD, PMI and authoritative dimension records; its approximate metre-scale geometry is not an engineering authority.",
  },
  coordinateSystem: {
    linearUnit: "metre",
    upAxis: "Y",
    handedness: "right",
    sourceToWebScale: 1,
  },
  systems: [{
    id: "anonymous-general-assembly",
    title: "匿名总装可视化",
    shortTitle: "GENERAL ASSEMBLY",
    category: "structure",
    color: "#69c9d0",
    description: "单一公开可视化根，仅用于整机外观展示；不表达 BOM、工程系统或源装配树。",
    parts: [{
      id: "EXL50U-GA-VISUALIZATION",
      title: "EXL-50U 总装可视化",
      nodeName: "EXL50U_GA_VISUALIZATION",
      description: "公开匿名浏览器派生根；运输分片不可解释为工程部件。",
      engineeringTag: "EXL50U.PUBLIC.ANONYMOUS_VISUALIZATION",
    }],
  }],
  generator: {
    name: "FusionDigital EXL-50U anonymous derivative projector",
    version: "1.0.0",
    repository: "https://github.com/tianshao1992/fusion-digital",
    license: "User-authorized public visualization derivative",
    licenseUrl: "/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md",
    conversion: {
      pipeline: "anonymous FDMESH definitions and placements -> reviewed QEM simplification -> glTF 2.0 GPU instancing -> Meshopt transport -> deterministic public manifest projection",
      converter: "FusionDigital anonymous public-derivative pipeline",
      converterVersion: "1.0.0",
    },
  },
  disclaimer: "Illustrative public visualization only. It is not dimensionally authoritative and must not be used for design, manufacturing, safety, physics analysis, configuration control or operations.",
});

const EXL_FIXED_ACTIVE_CARD = Object.freeze({
  id: EXL_DEVICE_ID,
  index: "03",
  title: "EXL‑50U 总装（2026‑06‑30）",
  eyebrow: "AUTHORIZED · REAL-TIME 3D",
  state: "匿名总装实时三维",
  tone: "controlled",
  facts: [
    "1 个自动加载标准预览",
    "20 个按需匿名高精度运输分片",
    "Meshopt + GPU instancing",
    "仅用于非工程外观展示",
  ],
  deviceOverview: "EXL‑50U 装置集成总装的公开匿名数字样机，用于整机外观、旋转缩放、透明度、剖切与多级细节浏览。",
  fileSummary: "1 个标准预览 · 20 个匿名高精度运输分片 · 摘要锁定按需加载",
  copy: "加载经授权、脱敏、简化和逐文件复核的公开匿名总装可视化派生。标准预览自动加载；高精度由用户点击后串行加载 20 个运输分片。公开根和运输分片不表达 BOM、工程系统、源装配树、材料、PMI、尺寸标注、权威尺寸表或配置权威；可视几何保留近似米制尺度，仅用于外观展示，不能作为测量或工程尺寸依据；原始 STEP 与工程 CAD 不会由网站下发。",
  availability: "online-public-simplified",
  delivery: "public-static",
  comparisonFrame: null,
  statement: "User-authorized anonymous public visualization derivative for interactive browser preview. Transport shards have no engineering-system meaning, and source CAD or engineering authority is not published.",
  viewer: {
    mode: "real-3d",
    manifestEndpoint: EXL_MANIFEST_ENDPOINT,
    turntableManifestEndpoint: null,
    overlayEligible: false,
  },
  physicsOverlays: [],
  diagnosticWorkspace: null,
});

const EXPECTED = Object.freeze({
  [ITER_ID]: {
    title: "ITER reviewed high-detail browser visualization derivative",
    classification: "PUBLIC_VISUALIZATION_DERIVATIVE",
    redistributionAllowed: undefined,
    licensePath: "public/licenses/ITER-PUBLIC-VISUALIZATION-DERIVATIVE.txt",
    destinationRoot: "public/models/iter-high-detail-v1",
    stageDirectoryName: "iter-high-detail-v1",
    routeRoot: "/device-assets/iter-high-detail/v1",
    fileCount: 18,
    totalBytes: 98_507_692,
    baseUrlEnv: "FUSION_ASSET_BASE_URL",
    sourceDirEnv: "FUSION_ASSET_SOURCE_DIR",
  },
  [EXL_ID]: {
    title: "EXL-50U integrated-assembly anonymous browser visualization derivative",
    classification: "PUBLIC",
    redistributionAllowed: true,
    licensePath: "public/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md",
    destinationRoot: "public/models/exl50u-general-assembly-v1",
    stageDirectoryName: "exl50u-general-assembly-v1",
    routeRoot: "/device-assets/exl50u-general-assembly/v1",
    fileCount: 21,
    maxTotalBytes: 300 * 1024 * 1024,
    baseUrlEnv: "FUSION_EXL50U_GA_ASSET_BASE_URL",
    sourceDirEnv: "FUSION_EXL50U_GA_ASSET_SOURCE_DIR",
  },
});

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function realDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function exactKeys(value, expected, label) {
  if (!object(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains missing or undeclared fields`);
  }
  return value;
}

function hasExactKeys(value, expected) {
  return object(value)
    && Object.keys(value).length === expected.length
    && Object.keys(value).every((key) => expected.includes(key));
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validBounds(value) {
  return object(value)
    && [value.min, value.max].every((axis) => (
      Array.isArray(axis) && axis.length === 3 && axis.every(Number.isFinite)
    ))
    && value.min.every((coordinate, axis) => coordinate < value.max[axis]);
}

function assertExlDerivationEvidence(value) {
  const evidenceKeys = ["kind", "selectedAttempt", "selectedRatios", "qem", "coverage"];
  const ratioKeys = ["preview", "high"];
  const qemKeys = ["receiptCount", "receiptSha256", "targetMissCount", "retainedIrreducibleCount"];
  const coverageKeys = [
    "renderableDefinitions", "renderableOccurrences", "skippedDefinitions", "skippedOccurrences",
    "sourceDefinitions", "sourceOccurrences", "previewMissingDefinitions",
    "previewMissingOccurrences", "highMissingDefinitions", "highMissingOccurrences",
  ];
  const ratios = value?.selectedRatios;
  const qem = value?.qem;
  const coverage = value?.coverage;
  if (
    !hasExactKeys(value, evidenceKeys)
    || value.kind !== "anonymous-public-derivative"
    || ![1, 2].includes(value.selectedAttempt)
    || !hasExactKeys(ratios, ratioKeys)
    || ratioKeys.some((key) => (
      typeof ratios[key] !== "number"
      || !Number.isFinite(ratios[key])
      || ratios[key] <= 0
      || ratios[key] > 1
    ))
    || !hasExactKeys(qem, qemKeys)
    || !positiveSafeInteger(qem.receiptCount)
    || typeof qem.receiptSha256 !== "string"
    || !SHA256.test(qem.receiptSha256)
    || !nonNegativeSafeInteger(qem.targetMissCount)
    || !nonNegativeSafeInteger(qem.retainedIrreducibleCount)
    || qem.targetMissCount !== qem.retainedIrreducibleCount
    || qem.targetMissCount > qem.receiptCount
    || !hasExactKeys(coverage, coverageKeys)
    || !positiveSafeInteger(coverage.renderableDefinitions)
    || !positiveSafeInteger(coverage.renderableOccurrences)
    || !nonNegativeSafeInteger(coverage.skippedDefinitions)
    || !nonNegativeSafeInteger(coverage.skippedOccurrences)
    || !positiveSafeInteger(coverage.sourceDefinitions)
    || !positiveSafeInteger(coverage.sourceOccurrences)
    || coverage.sourceDefinitions !== coverage.renderableDefinitions + coverage.skippedDefinitions
    || coverage.sourceOccurrences !== coverage.renderableOccurrences + coverage.skippedOccurrences
    || coverage.previewMissingDefinitions !== 0
    || coverage.previewMissingOccurrences !== 0
    || coverage.highMissingDefinitions !== 0
    || coverage.highMissingOccurrences !== 0
  ) {
    throw new Error("published EXL-50U derivation evidence is incomplete, inconsistent, or contains undeclared metadata");
  }
}

function normalizedExlManifestAsset(asset, role, routePattern, digestIndex) {
  if (!object(asset)) throw new Error(`${role} must be an asset object`);
  const route = String(asset.path ?? "");
  const match = routePattern.exec(route);
  const sha256 = String(asset.sha256 ?? "").toLowerCase();
  const bytes = Number(asset.bytes);
  if (
    !match
    || match[digestIndex] !== sha256
    || !Number.isSafeInteger(bytes)
    || bytes <= 0
  ) throw new Error(`${role} must use a digest-locked route and a positive byte length`);
  return { role, filename: match[1], route, sha256, bytes };
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path !== ""
    && path !== ".."
    && !path.startsWith(`..${sep}`)
    && !isAbsolute(path);
}

function safeRelativePath(value, label) {
  if (
    typeof value !== "string"
    || value === ""
    || isAbsolute(value)
    || value.split(/[\\/]+/u).includes("..")
  ) throw new Error(`${label} must be a safe relative path`);
  return value.replaceAll("\\", "/");
}

function safeFilename(value, label) {
  if (
    typeof value !== "string"
    || basename(value) !== value
    || !/^[a-z0-9.-]+\.glb$/u.test(value)
  ) throw new Error(`${label} must be a safe GLB filename`);
  return value;
}

async function json(pathname, label) {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${label}: ${error.message}`);
  }
}

async function sha256File(pathname) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(pathname)) hash.update(chunk);
  return hash.digest("hex");
}

function canonicalBundleDigest(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => (
    left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0
  ))) {
    hash.update(`${file.filename}\0${file.bytes}\0${file.sha256}\n`);
  }
  return hash.digest("hex");
}

function canonicalTreeDigest(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ))) {
    hash.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  }
  return hash.digest("hex");
}

function validateGitAssets(gitAssets) {
  exactKeys(gitAssets, GIT_ASSET_KEYS, "runtime lock gitAssets");
  if (
    gitAssets.root !== "public"
    || gitAssets.acquisition !== "git"
    || !Array.isArray(gitAssets.excludes)
    || gitAssets.excludes.length !== 2
    || gitAssets.excludes[0] !== "public/models/iter-high-detail-v1/"
    || gitAssets.excludes[1] !== "public/models/exl50u-general-assembly-v1/*.glb"
    || !Array.isArray(gitAssets.files)
  ) throw new Error("runtime lock gitAssets identity is invalid");
  const paths = new Set();
  let totalBytes = 0;
  for (let index = 0; index < gitAssets.files.length; index += 1) {
    const file = exactKeys(gitAssets.files[index], ["path", "bytes", "sha256"], `gitAssets.files[${index}]`);
    const path = safeRelativePath(file.path, `gitAssets.files[${index}].path`);
    if (!path.startsWith("public/") || paths.has(path)
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256.test(file.sha256 ?? "")) {
      throw new Error(`gitAssets.files[${index}] is not a unique digest-locked public file`);
    }
    paths.add(path);
    totalBytes += file.bytes;
  }
  if (
    gitAssets.fileCount !== gitAssets.files.length
    || gitAssets.totalBytes !== totalBytes
    || gitAssets.treeSha256 !== canonicalTreeDigest(gitAssets.files)
  ) throw new Error("runtime lock gitAssets totals or tree SHA-256 are invalid");
}

function validateHttpsBaseUrl(value, label, allowNull) {
  if (allowNull && value === null) return;
  if (
    typeof value !== "string"
    || value === ""
    || value !== value.trim()
    || /[\u0000-\u001f\u007f?#]/u.test(value)
    || !/^[a-z][a-z0-9+.-]*:\/\/[^/]+/iu.test(value)
    || /^[a-z][a-z0-9+.-]*:\/\/[^/]*@/iu.test(value)
  ) throw new Error(`${label} must be a canonical credential-free HTTPS base URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname.endsWith(".")
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) throw new Error(`${label} must be a credential-free HTTPS base URL`);
}

function validateBundle(bundle, expected) {
  exactKeys(
    bundle,
    expected.redistributionAllowed === undefined ? BUNDLE_KEYS : [...BUNDLE_KEYS, "redistributionAllowed"],
    `${expected.id} runtime lock bundle`,
  );
  exactKeys(bundle.acquisition, ["defaultBaseUrl", "baseUrlEnv", "sourceDirEnv"], `${expected.id}.acquisition`);
  if (
    !object(bundle)
    || bundle.id !== expected.id
    || bundle.title !== expected.title
    || bundle.classification !== expected.classification
    || (expected.redistributionAllowed !== undefined
      && bundle.redistributionAllowed !== expected.redistributionAllowed)
    || bundle.engineeringUseAllowed !== false
    || bundle.sourceCadIncluded !== false
    || safeRelativePath(bundle.licensePath, `${bundle.id}.licensePath`) !== expected.licensePath
    || safeRelativePath(bundle.destinationRoot, `${bundle.id}.destinationRoot`) !== expected.destinationRoot
    || bundle.stageDirectoryName !== expected.stageDirectoryName
    || bundle.routeRoot !== expected.routeRoot
    || !object(bundle.acquisition)
    || bundle.acquisition.baseUrlEnv !== expected.baseUrlEnv
    || bundle.acquisition.sourceDirEnv !== expected.sourceDirEnv
    || !Array.isArray(bundle.files)
    || bundle.files.length !== expected.fileCount
    || bundle.fileCount !== expected.fileCount
  ) throw new Error(`${expected.id} lock identity is invalid`);
  validateHttpsBaseUrl(
    bundle.acquisition.defaultBaseUrl,
    `${expected.id}.acquisition.defaultBaseUrl`,
    true,
  );
  if (bundle.acquisition.defaultBaseUrl !== null) {
    throw new Error(`${expected.id}.acquisition.defaultBaseUrl must be null; use an explicit reviewed mirror or source directory`);
  }
  const seenFiles = new Set();
  const seenRoutes = new Set();
  const seenDigests = new Set();
  let totalBytes = 0;
  for (let offset = 0; offset < bundle.files.length; offset += 1) {
    const file = exactKeys(
      bundle.files[offset],
      expected.id === EXL_ID
        ? ["role", "filename", "route", "bytes", "sha256"]
        : ["partId", "manifestPartId", "filename", "route", "bytes", "sha256"],
      `${expected.id}.files[${offset}]`,
    );
    const filename = safeFilename(file?.filename, `${expected.id}.files[${offset}].filename`);
    const sha256 = file?.sha256;
    const route = file?.route;
    const bytes = file?.bytes;
    if (
      !SHA256.test(sha256 ?? "")
      || !filename.includes(`.${sha256}.`)
      || route !== `${expected.routeRoot}/${filename}`
      || !Number.isSafeInteger(bytes)
      || bytes <= 0
      || seenFiles.has(filename)
      || seenRoutes.has(route)
      || seenDigests.has(sha256)
    ) throw new Error(`${expected.id}.files[${offset}] is not digest-locked and unique`);
    if (expected.id === EXL_ID) {
      const suffix = String(offset).padStart(2, "0");
      const pattern = offset === 0
        ? /^device\.preview\.[a-f0-9]{64}\.meshopt\.glb$/u
        : new RegExp(`^anonymous-shard-${suffix}\\.[a-f0-9]{64}\\.high\\.meshopt\\.glb$`, "u");
      const expectedRole = offset === 0 ? "preview" : `anonymous-shard-${suffix}`;
      if (
        file.role !== expectedRole
        || !pattern.test(filename)
        || (offset === 0 && bytes > 12 * 1024 * 1024)
        || (offset > 0 && bytes >= 24 * 1024 * 1024)
      ) {
        throw new Error(`${expected.id}.files[${offset}] violates the preview/shard contract`);
      }
    } else {
      const expectedPart = ITER_PARTS[offset];
      if (
        file.partId !== expectedPart
        || file.manifestPartId !== `ITER-${expectedPart.toUpperCase()}`
        || !new RegExp(`^${expectedPart}\\.[a-f0-9]{64}\\.high\\.meshopt\\.glb$`, "u").test(filename)
      ) throw new Error(`${expected.id}.files[${offset}] violates the component route contract`);
    }
    totalBytes += bytes;
    seenFiles.add(filename);
    seenRoutes.add(route);
    seenDigests.add(sha256);
  }
  if (
    totalBytes !== bundle.totalBytes
    || (expected.totalBytes !== undefined && totalBytes !== expected.totalBytes)
    || (expected.maxTotalBytes !== undefined && totalBytes > expected.maxTotalBytes)
    || bundle.aggregateSha256 !== canonicalBundleDigest(bundle.files)
  ) throw new Error(`${expected.id} lock totals or aggregate SHA-256 are invalid`);
  return bundle;
}

export function validateRuntimeAssetLock(lock) {
  exactKeys(lock, LOCK_ROOT_KEYS, "runtime asset lock");
  if (lock.schemaVersion !== LOCK_SCHEMA || !realDate(lock.generatedAt)
    || !Array.isArray(lock.externalBundles)) {
    throw new Error("runtime asset lock schema is unsupported");
  }
  validateGitAssets(lock.gitAssets);
  const ids = lock.externalBundles.map((bundle) => bundle?.id);
  if (
    ids.length < 1
    || ids.length > 2
    || ids[0] !== ITER_ID
    || (ids.length === 2 && ids[1] !== EXL_ID)
  ) throw new Error("runtime asset lock must contain ITER and optional activated EXL in fixed order");
  return lock.externalBundles.map(validateRuntimeAssetBundle);
}

export function validateRuntimeAssetBundle(bundle) {
  const expected = object(bundle) ? EXPECTED[bundle.id] : undefined;
  if (!expected) throw new Error(`unknown external runtime bundle: ${bundle?.id ?? "missing"}`);
  return validateBundle(bundle, { ...expected, id: bundle.id });
}

function manifestAssets(manifest) {
  exactKeys(manifest, EXL_MANIFEST_KEYS, "published EXL-50U manifest");
  exactKeys(manifest.assets, ["webModel", "webModels", "shardBundles"], "published EXL-50U manifest assets");
  if (
    Object.entries(EXL_FIXED_MANIFEST_FIELDS)
      .some(([key, value]) => !isDeepStrictEqual(manifest[key], value))
    || !realDate(manifest.asOf)
    || manifest.assets?.sourceCad !== undefined
    || !hasExactKeys(manifest.assets?.webModel, EXL_WEB_MODEL_KEYS)
    || !Array.isArray(manifest.assets?.webModels)
    || manifest.assets.webModels.length !== 1
    || !hasExactKeys(manifest.assets.webModels[0], EXL_WEB_MODEL_VARIANT_KEYS)
    || manifest.assets.webModels[0].id !== "preview"
    || manifest.assets.webModels[0].quality !== "preview"
    || manifest.assets.webModels[0].default !== true
    || EXL_WEB_MODEL_KEYS.filter((key) => key !== "boundsMetres")
      .some((key) => manifest.assets.webModels[0][key] !== manifest.assets.webModel[key])
    || JSON.stringify(manifest.assets.webModels[0].boundsMetres)
      !== JSON.stringify(manifest.assets.webModel.boundsMetres)
    || manifest.assets.webModel.format !== EXL_ASSET_FORMAT
    || !positiveSafeInteger(manifest.assets.webModel.triangles)
    || !positiveSafeInteger(manifest.assets.webModel.vertices)
    || !positiveSafeInteger(manifest.assets.webModel.decodedGpuBytes)
    || manifest.assets.webModel.decodedGpuBytes > EXL_MAX_PREVIEW_DECODED_BYTES
    || !validBounds(manifest.assets.webModel.boundsMetres)
    || !Array.isArray(manifest.assets?.shardBundles)
    || manifest.assets.shardBundles.length !== 1
  ) throw new Error("published EXL-50U manifest identity or public boundary is invalid");
  assertExlDerivationEvidence(manifest.derivationEvidence);

  const bundle = manifest.assets.shardBundles[0];
  const grouping = bundle?.grouping;
  if (
    !hasExactKeys(bundle, EXL_SHARD_BUNDLE_KEYS)
    || bundle?.rootNodeName !== "EXL50U_GA_VISUALIZATION"
    || bundle?.delivery !== "shards"
    || bundle?.quality !== "high"
    || bundle?.format !== EXL_ASSET_FORMAT
    || !exactArray(bundle?.extensionsRequired, ["EXT_mesh_gpu_instancing", "EXT_meshopt_compression"])
    || !hasExactKeys(grouping, EXL_GROUPING_KEYS)
    || grouping.kind !== "anonymous-transport"
    || grouping.engineeringSemantic !== false
    || grouping.engineeringUseAllowed !== false
    || grouping.representsBom !== false
    || grouping.representsEngineeringSystems !== false
    || grouping.representsAssemblyTree !== false
    || !Array.isArray(bundle.shards)
    || bundle.shards.length !== EXL_SHARD_COUNT
    || !positiveSafeInteger(bundle.bytes)
    || EXL_SHARD_METRICS.some((field) => !positiveSafeInteger(bundle[field]))
    || bundle.decodedGpuBytes > EXL_MAX_BUNDLE_DECODED_BYTES
    || bundle.placementInstances > EXL_SHARD_COUNT * EXL_MAX_PLACEMENT_INSTANCES_PER_SHARD
    || bundle.sceneDrawTriangles > EXL_MAX_SCENE_TRIANGLES
    || bundle.drawCalls > EXL_MAX_DRAW_CALLS
    || !validBounds(bundle.boundsMetres)
  ) throw new Error("published EXL-50U manifest is not an anonymous 20-shard contract");

  const files = [normalizedExlManifestAsset(
    manifest.assets.webModel,
    "preview",
    EXL_PREVIEW_ROUTE,
    2,
  )];
  if (files[0].bytes > EXL_MAX_PREVIEW_BYTES) {
    throw new Error("published EXL-50U preview exceeds the strict byte budget");
  }
  const metricTotals = Object.fromEntries(EXL_SHARD_METRICS.map((field) => [field, 0]));
  const unionMin = [Infinity, Infinity, Infinity];
  const unionMax = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < bundle.shards.length; offset += 1) {
    const index = offset + 1;
    const suffix = String(index).padStart(2, "0");
    const shard = bundle.shards[offset];
    if (!hasExactKeys(shard, EXL_SHARD_KEYS) || shard.id !== `anonymous-shard-${suffix}` || shard.index !== index) {
      throw new Error(`published EXL-50U anonymous shard ${suffix} is out of order or contains undeclared metadata`);
    }
    const file = normalizedExlManifestAsset(shard, `anonymous-shard-${suffix}`, EXL_SHARD_ROUTE, 3);
    if (Number(file.route.match(EXL_SHARD_ROUTE)?.[2]) !== index) {
      throw new Error(`published EXL-50U anonymous shard ${suffix} route is out of order`);
    }
    if (file.bytes >= EXL_MAX_SHARD_BYTES) {
      throw new Error(`published EXL-50U anonymous shard ${suffix} exceeds the strict byte budget`);
    }
    if (
      EXL_SHARD_METRICS.some((field) => !positiveSafeInteger(shard[field]))
      || shard.decodedGpuBytes > EXL_MAX_SHARD_DECODED_BYTES
      || shard.placementInstances > EXL_MAX_PLACEMENT_INSTANCES_PER_SHARD
      || shard.sceneDrawTriangles > EXL_MAX_SCENE_TRIANGLES
      || shard.drawCalls > EXL_MAX_DRAW_CALLS
      || shard.placementInstances < shard.uniqueGeometryMeshes
      || shard.drawCalls < shard.uniqueGeometryMeshes
      || shard.drawCalls > shard.placementInstances
      || shard.sceneDrawTriangles < shard.uniqueGeometryTriangles
      || !validBounds(shard.boundsMetres)
    ) throw new Error(`published EXL-50U anonymous shard ${suffix} metrics or decoded budget are invalid`);
    for (const field of EXL_SHARD_METRICS) metricTotals[field] += shard[field];
    for (let axis = 0; axis < 3; axis += 1) {
      unionMin[axis] = Math.min(unionMin[axis], shard.boundsMetres.min[axis]);
      unionMax[axis] = Math.max(unionMax[axis], shard.boundsMetres.max[axis]);
    }
    files.push(file);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const shardBytes = files.slice(1).reduce((sum, file) => sum + file.bytes, 0);
  if (
    files.length !== EXL_FILE_COUNT
    || new Set(files.map((file) => file.filename)).size !== files.length
    || new Set(files.map((file) => file.route)).size !== files.length
    || new Set(files.map((file) => file.sha256)).size !== files.length
    || Number(bundle.bytes) !== shardBytes
    || EXL_SHARD_METRICS.some((field) => metricTotals[field] !== bundle[field])
    || unionMin.some((coordinate, axis) => coordinate !== bundle.boundsMetres.min[axis])
    || unionMax.some((coordinate, axis) => coordinate !== bundle.boundsMetres.max[axis])
    || manifest.assets.webModel.triangles > EXL_MAX_SCENE_TRIANGLES
    || totalBytes > EXL_MAX_TOTAL_BYTES
  ) throw new Error("published EXL-50U manifest file set, totals, or digest uniqueness is invalid");
  return files;
}

export function assertManifestMatchesLock(manifest, bundle) {
  const files = manifestAssets(manifest);
  if (files.length !== bundle.files.length) throw new Error("EXL-50U manifest and runtime lock file counts differ");
  for (let index = 0; index < files.length; index += 1) {
    for (const key of ["filename", "route", "bytes", "sha256"]) {
      if (files[index][key] !== bundle.files[index][key]) {
        throw new Error(`EXL-50U manifest and runtime lock differ at asset ${index + 1} ${key}`);
      }
    }
  }
}

async function verifyDirectory(releaseRoot, bundle) {
  const relativeDestination = bundle.destinationRoot.slice("public/".length);
  const directory = resolve(releaseRoot, "dist/client", relativeDestination);
  if (!inside(releaseRoot, directory)) throw new Error(`${bundle.id} destination escaped the release root`);
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${bundle.id} destination must be a real directory`);
  const entries = await readdir(directory, { withFileTypes: true });
  const expectedNames = new Set(bundle.files.map((file) => file.filename));
  if (bundle.id === EXL_ID) {
    expectedNames.add("model-manifest.json");
    expectedNames.add("PUBLICATION-NOTICE.md");
  }
  if (
    entries.length !== expectedNames.size
    || entries.some((entry) => !expectedNames.has(entry.name) || !entry.isFile() || entry.isSymbolicLink())
  ) throw new Error(`${bundle.id} hydrated directory contains missing, unknown, or non-regular entries`);
  for (const file of bundle.files) {
    const pathname = join(directory, file.filename);
    const assetInfo = await lstat(pathname);
    if (!assetInfo.isFile() || assetInfo.isSymbolicLink() || assetInfo.size !== file.bytes) {
      throw new Error(`${bundle.id}/${file.filename} byte length or file type is invalid`);
    }
    if (await sha256File(pathname) !== file.sha256) {
      throw new Error(`${bundle.id}/${file.filename} SHA-256 is invalid`);
    }
  }
  return { id: bundle.id, fileCount: bundle.fileCount, totalBytes: bundle.totalBytes, firstRoute: bundle.files[0].route };
}

export async function verifyPublicationNotice(releaseRoot, bundle) {
  if (!bundle.licensePath.startsWith("public/")) {
    throw new Error(`${bundle.id} publication notice must be shipped from public/`);
  }
  const pathname = resolve(releaseRoot, "dist/client", bundle.licensePath.slice("public/".length));
  if (!inside(releaseRoot, pathname)) throw new Error(`${bundle.id} publication notice escaped the release root`);
  const info = await lstat(pathname);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0) {
    throw new Error(`${bundle.id} publication notice must be a non-empty regular file`);
  }
  if (bundle.id === EXL_ID && await readFile(pathname, "utf8") !== EXL_PUBLICATION_NOTICE) {
    throw new Error(`${bundle.id} publication notice differs from the fixed anonymous public contract`);
  }
}

async function verifyGitManagedReleaseTree(releaseRoot, gitAssets) {
  for (const file of gitAssets.files) {
    const relativePublicPath = safeRelativePath(file.path, "Git-managed release asset path");
    if (!relativePublicPath.startsWith("public/")) {
      throw new Error(`Git-managed release asset escaped public/: ${relativePublicPath}`);
    }
    const pathname = resolve(releaseRoot, "dist/client", relativePublicPath.slice("public/".length));
    if (!inside(releaseRoot, pathname)) throw new Error(`Git-managed release asset escaped release root: ${relativePublicPath}`);
    let info;
    try {
      info = await lstat(pathname);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Git-managed release asset is missing: ${relativePublicPath}`);
      throw error;
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size !== file.bytes
      || await sha256File(pathname) !== file.sha256) {
      throw new Error(`Git-managed release asset differs from its runtime lock: ${relativePublicPath}`);
    }
  }
}

async function pathExists(pathname) {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function assertExlReleaseTreeContainsOnlyLockedArtifacts(
  releaseRoot,
  bundle = null,
  runtimeLock = null,
) {
  const root = resolve(releaseRoot);
  const clientRoot = resolve(root, "dist/client");
  if (!inside(root, clientRoot)) throw new Error("metadata-only client root escaped the release root");
  if (!await pathExists(clientRoot)) return;
  const clientInfo = await lstat(clientRoot);
  if (!clientInfo.isDirectory() || clientInfo.isSymbolicLink()) {
    throw new Error("metadata-only client root must be a real directory");
  }

  // Do not limit the metadata-only check to the canonical destination. A
  // copied stage directory, renamed formal manifest, or anonymous GLB placed
  // elsewhere under dist/client must not survive installation and later
  // become reachable through a broader static-file rule.
  const anonymousAsset = /^(?:device\.preview\.[a-f0-9]{64}\.meshopt|anonymous-shard-(?:0[1-9]|1[0-9]|20)\.[a-f0-9]{64}\.high\.meshopt)\.glb$/iu;
  const canonicalDirectory = `models/${EXL_ID}`;
  const allowedFiles = new Set(bundle ? [
    ...bundle.files.map((file) => `${canonicalDirectory}/${file.filename}`),
    `${canonicalDirectory}/model-manifest.json`,
    `${canonicalDirectory}/PUBLICATION-NOTICE.md`,
  ] : []);
  const lockedGlbs = new Map();
  const lockedPublicFiles = new Set();
  if (runtimeLock) {
    for (const file of runtimeLock.gitAssets.files) {
      lockedPublicFiles.add(file.path.slice("public/".length));
      if (!file.path.toLowerCase().endsWith(".glb")) continue;
      lockedGlbs.set(file.path.slice("public/".length), file);
    }
    for (const lockedBundle of runtimeLock.externalBundles) {
      const destination = lockedBundle.destinationRoot.slice("public/".length);
      for (const file of lockedBundle.files) lockedGlbs.set(`${destination}/${file.filename}`, file);
    }
  } else if (bundle) {
    for (const file of bundle.files) lockedGlbs.set(`${canonicalDirectory}/${file.filename}`, file);
  }
  const pending = [clientRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const pathname = join(directory, entry.name);
      const relativePath = relative(clientRoot, pathname).replaceAll("\\", "/");
      const lowerPath = relativePath.toLowerCase();
      const normalizedPath = lowerPath.replace(/[^a-z0-9]/gu, "");
      const isCanonicalDirectory = lowerPath === canonicalDirectory && entry.isDirectory();
      const isAllowedLockedFile = allowedFiles.has(relativePath) && entry.isFile() && !entry.isSymbolicLink();
      const namedExlPackage = lowerPath.split("/").some((part) => part.includes(EXL_ID))
        || normalizedPath.includes("exl50ugeneralassembly");
      const namedAnonymousAsset = anonymousAsset.test(entry.name);
      const unlistedSensitivePackage = entry.isFile()
        && !lockedPublicFiles.has(relativePath)
        && !isAllowedLockedFile
        && /(?:\.(?:stp|step|iges|igs|brep|fcstd|zip|7z|rar|tar|tgz)|\.tar\.gz)$/iu.test(entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`EXL-50U release tree contains an undeclared symbolic link at ${relativePath}`);
      }
      if ((namedExlPackage && !isCanonicalDirectory && !isAllowedLockedFile)
        || (namedAnonymousAsset && !isAllowedLockedFile)
        || unlistedSensitivePackage) {
        throw new Error(
          `EXL-50U release tree contains an unlocked bundle, manifest, or asset (including source package) at ${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        pending.push(pathname);
        continue;
      }
      if (entry.name.toLowerCase().endsWith(".glb")) {
        const expected = lockedGlbs.get(relativePath);
        if (!expected || !entry.isFile()) {
          throw new Error(`release tree contains an unlocked GLB at ${relativePath}`);
        }
        const info = await lstat(pathname);
        if (info.size !== expected.bytes || await sha256File(pathname) !== expected.sha256) {
          throw new Error(`release tree contains a GLB that differs from its runtime lock at ${relativePath}`);
        }
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      try {
        const candidate = JSON.parse(await readFile(pathname, "utf8"));
        if ((candidate?.id === EXL_ID || candidate?.schemaVersion === "1.4")
          && relativePath !== `${canonicalDirectory}/model-manifest.json`) {
          throw new Error(
            `EXL-50U release tree contains a stray formal manifest at ${relativePath}`,
          );
        }
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }
}

export async function assertMetadataOnlyExlDirectoryEmpty(releaseRoot, runtimeLock = null) {
  try {
    await assertExlReleaseTreeContainsOnlyLockedArtifacts(releaseRoot, null, runtimeLock);
  } catch (error) {
    throw new Error(`metadata-only EXL-50U package directory must be empty across dist/client: ${error.message}`);
  }
}

export function validateExl50uGeneralAssemblyActivatedCard(card) {
  exactKeys(card, EXL_CARD_KEYS, "active EXL-50U catalog card");
  exactKeys(card.viewer, EXL_VIEWER_KEYS, "active EXL-50U catalog card.viewer");
  if (!isDeepStrictEqual(card, EXL_FIXED_ACTIVE_CARD)) {
    throw new Error("EXL-50U general-assembly catalog card is not the exact approved active contract");
  }
  return card;
}

function activationState(catalog) {
  const matches = catalog?.devices?.filter((entry) => entry?.id === EXL_DEVICE_ID) ?? [];
  if (matches.length !== 1) throw new Error("device catalog must contain exactly one EXL-50U general-assembly card");
  const device = exactKeys(matches[0], EXL_CARD_KEYS, "EXL-50U catalog card");
  exactKeys(device.viewer, EXL_VIEWER_KEYS, "EXL-50U catalog card.viewer");
  if (
    device.index !== "03"
    || !Array.isArray(device.facts)
    || device.facts.length < 3
    || device.facts.some((value) => typeof value !== "string" || value === "")
    || !Array.isArray(device.physicsOverlays)
    || device.physicsOverlays.length !== 0
    || device.diagnosticWorkspace !== null
    || device.comparisonFrame !== null
  ) throw new Error("EXL-50U general-assembly catalog card contains undeclared public state");
  if (
    device.viewer?.mode === "metadata-only"
    && device.viewer.manifestEndpoint === null
    && device.delivery === "local-only"
    && device.availability === "pipeline-ready-assets-pending"
  ) return "metadata-only";
  if (
    device.viewer?.mode === "real-3d"
    && device.viewer.manifestEndpoint === EXL_MANIFEST_ENDPOINT
    && device.delivery === "public-static"
    && device.availability === "online-public-simplified"
  ) {
    validateExl50uGeneralAssemblyActivatedCard(device);
    return "active";
  }
  throw new Error("EXL-50U general-assembly catalog activation state is incoherent");
}

export async function verifyAliyunRuntimeAssetsRelease(root) {
  const releaseRoot = resolve(root);
  const rootInfo = await lstat(releaseRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("release root must be a real directory");
  const [lock, catalog] = await Promise.all([
    json(join(releaseRoot, "assets/runtime-assets.lock.json"), "runtime asset lock"),
    json(join(releaseRoot, "dist/client/models/device-catalog.json"), "built device catalog"),
  ]);
  const bundles = validateRuntimeAssetLock(lock);
  await verifyGitManagedReleaseTree(releaseRoot, lock.gitAssets);
  const exlBundle = bundles.find((bundle) => bundle.id === EXL_ID);
  const state = activationState(catalog);
  const exlManifestPath = join(releaseRoot, "dist/client/models/exl50u-general-assembly-v1/model-manifest.json");
  if (state === "metadata-only") {
    if (exlBundle || await pathExists(exlManifestPath)) {
      throw new Error("metadata-only EXL-50U catalog must not publish a bundle or formal manifest");
    }
    await assertMetadataOnlyExlDirectoryEmpty(releaseRoot, lock);
  } else {
    if (!exlBundle) throw new Error("active EXL-50U catalog requires its locked external bundle");
    await assertExlReleaseTreeContainsOnlyLockedArtifacts(releaseRoot, exlBundle, lock);
    assertManifestMatchesLock(await json(exlManifestPath, "built EXL-50U manifest"), exlBundle);
  }
  const verified = [];
  for (const bundle of bundles) {
    await verifyPublicationNotice(releaseRoot, bundle);
    verified.push(await verifyDirectory(releaseRoot, bundle));
  }
  return { schemaVersion: 1, exl50uGeneralAssembly: state, bundles: verified };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) throw new Error("usage: verify-runtime-assets.mjs <release-root>");
  process.stdout.write(`${JSON.stringify(await verifyAliyunRuntimeAssetsRelease(argv[0]))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(`Hong Kong runtime asset verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
