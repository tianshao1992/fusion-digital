#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const FIXED_TEMPLATE = JSON.parse(readFileSync(
  new URL("./exl50u-general-assembly-manifest-template.json", import.meta.url),
  "utf8",
));
const PROJECTED_MANIFEST_KEYS = [
  ...Object.keys(FIXED_TEMPLATE), "asOf", "derivationEvidence", "assets",
];

export const EXL50U_GA_BUNDLE_ID = "exl50u-general-assembly-v1";
export const EXL50U_GA_DESTINATION = `public/models/${EXL50U_GA_BUNDLE_ID}`;
export const EXL50U_GA_ROUTE_ROOT = "/device-assets/exl50u-general-assembly/v1";
export const EXL50U_GA_PUBLICATION_NOTICE = [
  "# EXL-50U general-assembly public visualization derivative",
  "",
  "This package contains only anonymous, simplified browser visualization derivatives. It contains no source CAD, PMI, dimension annotations, authoritative dimension tables, BOM, source assembly tree or engineering authority. Browser geometry retains an approximate metre-scale envelope for appearance visualization, but it is not a dimensional authority and must not be used for measurement or engineering dimensions. The 20 high-detail files are transport shards, not engineering systems.",
  "",
].join("\n");
export const EXL50U_GA_MANIFEST_PATH = resolve(
  REPO_ROOT,
  EXL50U_GA_DESTINATION,
  "model-manifest.json",
);
export const EXL50U_GA_PUBLICATION_NOTICE_PATH = resolve(
  REPO_ROOT,
  EXL50U_GA_DESTINATION,
  "PUBLICATION-NOTICE.md",
);
export const EXL50U_GA_ALLOWLIST_PATH = resolve(
  REPO_ROOT,
  "worker/exl50u-general-assembly-assets.generated.ts",
);
export const EXL50U_GA_FILE_COUNT = 21;
export const EXL50U_GA_SHARD_COUNT = 20;
export const EXL50U_GA_MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const EXL50U_GA_MAX_SHARD_BYTES = 24 * 1024 * 1024;
export const EXL50U_GA_MAX_PREVIEW_BYTES = 12 * 1024 * 1024;
export const EXL50U_GA_MAX_PREVIEW_DECODED_BYTES = 192 * 1024 * 1024;
export const EXL50U_GA_MAX_SHARD_DECODED_BYTES = 96 * 1024 * 1024;
export const EXL50U_GA_MAX_BUNDLE_DECODED_BYTES = 1_536 * 1024 * 1024;
export const EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD = 250_000;
export const EXL50U_GA_MAX_BUNDLE_PLACEMENT_INSTANCES = (
  EXL50U_GA_SHARD_COUNT * EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD
);
export const EXL50U_GA_MAX_SCENE_TRIANGLES = 30_000_000;
export const EXL50U_GA_MAX_DRAW_CALLS = 800;
export const EXL50U_GA_ASSET_FORMAT = "glTF 2.0 binary + EXT_meshopt_compression + EXT_mesh_gpu_instancing; POSITION Float32; NORMAL normalized Int8 (8-bit); indices Uint32";

const SHARD_METRICS = [
  "uniqueGeometryMeshes",
  "uniqueGeometryTriangles",
  "uniqueGeometryVertices",
  "placementInstances",
  "drawCalls",
  "sceneDrawTriangles",
  "decodedGpuBytes",
];
const WEB_MODEL_KEYS = [
  "path", "format", "sha256", "bytes", "triangles", "vertices", "decodedGpuBytes", "boundsMetres",
];
const WEB_MODEL_VARIANT_KEYS = ["id", "label", "quality", "default", ...WEB_MODEL_KEYS];
const SHARD_BUNDLE_KEYS = [
  "id", "label", "quality", "delivery", "format", "rootNodeName", "extensionsRequired", "grouping",
  "bytes", ...SHARD_METRICS, "boundsMetres", "shards",
];
const SHARD_KEYS = [
  "id", "index", "path", "sha256", "bytes", "uniqueGeometryMeshes", "uniqueGeometryTriangles",
  "uniqueGeometryVertices", "placementInstances", "drawCalls", "sceneDrawTriangles", "decodedGpuBytes",
  "boundsMetres",
];
const GROUPING_KEYS = [
  "kind", "engineeringSemantic", "engineeringUseAllowed", "representsBom",
  "representsEngineeringSystems", "representsAssemblyTree",
];

const PREVIEW_ROUTE = new RegExp(
  `^${EXL50U_GA_ROUTE_ROOT.replaceAll("/", "\\/")}\\/`
    + "(device\\.preview\\.([a-f0-9]{64})\\.meshopt\\.glb)$",
  "u",
);
const SHARD_ROUTE = new RegExp(
  `^${EXL50U_GA_ROUTE_ROOT.replaceAll("/", "\\/")}\\/`
    + "(anonymous-shard-(0[1-9]|1[0-9]|20)\\.([a-f0-9]{64})\\.high\\.meshopt\\.glb)$",
  "u",
);

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function exactKeys(value, expected) {
  return object(value)
    && Object.keys(value).length === expected.length
    && Object.keys(value).every((key) => expected.includes(key));
}

export function normalizeExl50uGeneralAssemblyDerivationEvidence(value) {
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
    !exactKeys(value, evidenceKeys)
    || value.kind !== "anonymous-public-derivative"
    || ![1, 2].includes(value.selectedAttempt)
    || !exactKeys(ratios, ratioKeys)
    || ratioKeys.some((key) => (
      typeof ratios[key] !== "number"
      || !Number.isFinite(ratios[key])
      || ratios[key] <= 0
      || ratios[key] > 1
    ))
    || !exactKeys(qem, qemKeys)
    || !positiveSafeInteger(qem.receiptCount)
    || typeof qem.receiptSha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(qem.receiptSha256)
    || !nonNegativeSafeInteger(qem.targetMissCount)
    || !nonNegativeSafeInteger(qem.retainedIrreducibleCount)
    || qem.targetMissCount !== qem.retainedIrreducibleCount
    || qem.targetMissCount > qem.receiptCount
    || !exactKeys(coverage, coverageKeys)
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
    throw new Error("EXL-50U general-assembly anonymous derivation evidence is incomplete or inconsistent");
  }
  return structuredClone(value);
}

function validBounds(value) {
  return object(value)
    && [value.min, value.max].every((axis) => (
      Array.isArray(axis) && axis.length === 3 && axis.every(Number.isFinite)
    ))
    && value.min.every((coordinate, axis) => coordinate < value.max[axis]);
}

function normalizedAsset(asset, role, routePattern, digestIndex) {
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
  ) {
    throw new Error(`${role} must use a digest-locked route and a positive byte length`);
  }
  return {
    role,
    filename: match[1],
    route,
    sha256,
    bytes,
  };
}

/**
 * Convert a reviewed public 1.4 manifest into the only 21 files that may be
 * hydrated or proxied. This function deliberately accepts metadata, not CAD
 * or a directory scan, so undeclared files can never enter the allow-list.
 */
export function extractExl50uGeneralAssemblyAssets(manifest) {
  if (
    !object(manifest)
    || !exactKeys(manifest, PROJECTED_MANIFEST_KEYS)
    || Object.entries(FIXED_TEMPLATE).some(([key, value]) => !isDeepStrictEqual(manifest[key], value))
    || manifest.schemaVersion !== "1.4"
    || manifest.id !== EXL50U_GA_BUNDLE_ID
    || manifest.access?.classification !== "PUBLIC"
    || manifest.access?.redistributionAllowed !== true
    || manifest.access?.engineeringUseAllowed !== false
    || !object(manifest.assets)
    || !exactKeys(manifest.assets, ["webModel", "webModels", "shardBundles"])
    || !exactKeys(manifest.assets.webModel, WEB_MODEL_KEYS)
    || !Array.isArray(manifest.assets.webModels)
    || manifest.assets.webModels.length !== 1
    || !exactKeys(manifest.assets.webModels[0], WEB_MODEL_VARIANT_KEYS)
    || manifest.assets.webModels[0].id !== "preview"
    || manifest.assets.webModels[0].quality !== "preview"
    || manifest.assets.webModels[0].default !== true
    || WEB_MODEL_KEYS.filter((key) => key !== "boundsMetres")
      .some((key) => manifest.assets.webModels[0][key] !== manifest.assets.webModel[key])
    || JSON.stringify(manifest.assets.webModels[0].boundsMetres)
      !== JSON.stringify(manifest.assets.webModel.boundsMetres)
    || !object(manifest.derivationEvidence)
    || manifest.assets.webModel?.format !== EXL50U_GA_ASSET_FORMAT
    || !positiveSafeInteger(manifest.assets.webModel?.triangles)
    || !positiveSafeInteger(manifest.assets.webModel?.vertices)
    || !positiveSafeInteger(manifest.assets.webModel?.decodedGpuBytes)
    || manifest.assets.webModel.decodedGpuBytes > EXL50U_GA_MAX_PREVIEW_DECODED_BYTES
    || !validBounds(manifest.assets.webModel?.boundsMetres)
  ) {
    throw new Error("EXL-50U general-assembly manifest identity or public boundary is invalid");
  }
  normalizeExl50uGeneralAssemblyDerivationEvidence(manifest.derivationEvidence);

  const shardBundles = manifest.assets.shardBundles;
  if (!Array.isArray(shardBundles) || shardBundles.length !== 1) {
    throw new Error("EXL-50U general-assembly manifest must contain exactly one anonymous shard bundle");
  }
  const shardBundle = shardBundles[0];
  const grouping = shardBundle?.grouping;
  if (
    !exactKeys(shardBundle, SHARD_BUNDLE_KEYS)
    || shardBundle.rootNodeName !== "EXL50U_GA_VISUALIZATION"
    || shardBundle.delivery !== "shards"
    || shardBundle.quality !== "high"
    || shardBundle.format !== EXL50U_GA_ASSET_FORMAT
    || !exactArray(
      shardBundle.extensionsRequired,
      ["EXT_mesh_gpu_instancing", "EXT_meshopt_compression"],
    )
    || !exactKeys(grouping, GROUPING_KEYS)
    || grouping.kind !== "anonymous-transport"
    || grouping.engineeringSemantic !== false
    || grouping.engineeringUseAllowed !== false
    || grouping.representsBom !== false
    || grouping.representsEngineeringSystems !== false
    || grouping.representsAssemblyTree !== false
    || !Array.isArray(shardBundle.shards)
    || shardBundle.shards.length !== EXL50U_GA_SHARD_COUNT
    || !positiveSafeInteger(shardBundle.bytes)
    || SHARD_METRICS.some((field) => !positiveSafeInteger(shardBundle[field]))
    || shardBundle.decodedGpuBytes > EXL50U_GA_MAX_BUNDLE_DECODED_BYTES
    || shardBundle.placementInstances > EXL50U_GA_MAX_BUNDLE_PLACEMENT_INSTANCES
    || shardBundle.sceneDrawTriangles > EXL50U_GA_MAX_SCENE_TRIANGLES
    || shardBundle.drawCalls > EXL50U_GA_MAX_DRAW_CALLS
    || !validBounds(shardBundle.boundsMetres)
  ) {
    throw new Error("EXL-50U general-assembly shard bundle is not an anonymous visualization contract");
  }

  const files = [normalizedAsset(manifest.assets.webModel, "preview", PREVIEW_ROUTE, 2)];
  if (files[0].bytes > EXL50U_GA_MAX_PREVIEW_BYTES) {
    throw new Error("EXL-50U general-assembly preview exceeds the strict byte budget");
  }
  const metricTotals = Object.fromEntries(SHARD_METRICS.map((field) => [field, 0]));
  const unionMin = [Infinity, Infinity, Infinity];
  const unionMax = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < shardBundle.shards.length; offset += 1) {
    const index = offset + 1;
    const suffix = String(index).padStart(2, "0");
    const shard = shardBundle.shards[offset];
    if (!exactKeys(shard, SHARD_KEYS) || shard.id !== `anonymous-shard-${suffix}` || shard.index !== index) {
      throw new Error(`EXL-50U general-assembly shard ${suffix} is out of order`);
    }
    const file = normalizedAsset(shard, `anonymous-shard-${suffix}`, SHARD_ROUTE, 3);
    if (Number(file.route.match(SHARD_ROUTE)?.[2]) !== index) {
      throw new Error(`EXL-50U general-assembly shard ${suffix} route is out of order`);
    }
    if (file.bytes >= EXL50U_GA_MAX_SHARD_BYTES) {
      throw new Error(`EXL-50U general-assembly shard ${suffix} exceeds the strict byte budget`);
    }
    if (
      SHARD_METRICS.some((field) => !positiveSafeInteger(shard[field]))
      || shard.decodedGpuBytes > EXL50U_GA_MAX_SHARD_DECODED_BYTES
      || shard.placementInstances > EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD
      || shard.sceneDrawTriangles > EXL50U_GA_MAX_SCENE_TRIANGLES
      || shard.drawCalls > EXL50U_GA_MAX_DRAW_CALLS
      || shard.placementInstances < shard.uniqueGeometryMeshes
      || shard.drawCalls < shard.uniqueGeometryMeshes
      || shard.drawCalls > shard.placementInstances
      || shard.sceneDrawTriangles < shard.uniqueGeometryTriangles
      || !validBounds(shard.boundsMetres)
    ) {
      throw new Error(`EXL-50U general-assembly shard ${suffix} metrics or decoded budget are invalid`);
    }
    for (const field of SHARD_METRICS) metricTotals[field] += shard[field];
    for (let axis = 0; axis < 3; axis += 1) {
      unionMin[axis] = Math.min(unionMin[axis], shard.boundsMetres.min[axis]);
      unionMax[axis] = Math.max(unionMax[axis], shard.boundsMetres.max[axis]);
    }
    files.push(file);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const shardBytes = files.slice(1).reduce((sum, file) => sum + file.bytes, 0);
  if (
    files.length !== EXL50U_GA_FILE_COUNT
    || new Set(files.map((file) => file.filename)).size !== files.length
    || new Set(files.map((file) => file.route)).size !== files.length
    || new Set(files.map((file) => file.sha256)).size !== files.length
    || Number(shardBundle.bytes) !== shardBytes
    || SHARD_METRICS.some((field) => metricTotals[field] !== shardBundle[field])
    || unionMin.some((coordinate, axis) => coordinate !== shardBundle.boundsMetres.min[axis])
    || unionMax.some((coordinate, axis) => coordinate !== shardBundle.boundsMetres.max[axis])
    || manifest.assets.webModel.triangles > EXL50U_GA_MAX_SCENE_TRIANGLES
    || totalBytes > EXL50U_GA_MAX_TOTAL_BYTES
  ) {
    throw new Error("EXL-50U general-assembly file set, totals, or digest uniqueness is invalid");
  }
  return { files, totalBytes };
}

export function renderExl50uGeneralAssemblyAllowlist(manifest) {
  const { files } = extractExl50uGeneralAssemblyAssets(manifest);
  const rows = files.map((file) => (
    `  { role: ${JSON.stringify(file.role)}, filename: ${JSON.stringify(file.filename)}, `
      + `sha256: ${JSON.stringify(file.sha256)}, bytes: ${file.bytes} },`
  ));
  return [
    "// Generated from the reviewed public EXL-50U 1.4 manifest by",
    "// scripts/assets/exl50u-general-assembly-runtime-contract.mjs.",
    "// Never hand-edit hashes. An empty array keeps the metadata-only card fail-closed.",
    "export const EXL50U_GENERAL_ASSEMBLY_RELEASE_ASSETS = [",
    ...rows,
    "] as const;",
    "",
  ].join("\n");
}

export function parseExl50uGeneralAssemblyAllowlist(source) {
  return [...source.matchAll(
    /\{\s*role:\s*"([a-z0-9-]+)",\s*filename:\s*"([a-z0-9.-]+)",\s*sha256:\s*"([a-f0-9]{64})",\s*bytes:\s*(\d+)\s*\}/gu,
  )].map((match) => ({
    role: match[1],
    filename: match[2],
    sha256: match[3],
    bytes: Number(match[4]),
  }));
}

function parseArguments(argv) {
  const options = {
    manifest: EXL50U_GA_MANIFEST_PATH,
    output: EXL50U_GA_ALLOWLIST_PATH,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      options.check = true;
      continue;
    }
    if (token !== "--manifest" && token !== "--output") {
      throw new Error(`Unknown option: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    options[token === "--manifest" ? "manifest" : "output"] = resolve(value);
    index += 1;
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const manifest = JSON.parse(await readFile(options.manifest, "utf8"));
  const generated = renderExl50uGeneralAssemblyAllowlist(manifest);
  if (options.check) {
    const current = await readFile(options.output, "utf8");
    if (current !== generated) throw new Error("EXL-50U generated Worker allow-list is stale");
    process.stdout.write("EXL-50U generated Worker allow-list matches the reviewed manifest.\n");
    return;
  }
  await writeFile(options.output, generated, { encoding: "utf8", flag: "w" });
  process.stdout.write(`Wrote ${EXL50U_GA_FILE_COUNT} reviewed allow-list entries.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(`exl50u-general-assembly-runtime-contract: ${error.message}`);
    process.exitCode = 1;
  });
}
