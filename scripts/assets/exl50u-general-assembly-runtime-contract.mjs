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
  "This package contains only 20 anonymous, simplified high-detail browser visualization transport shards; no standard preview or runtime fallback is published. It contains no source CAD, PMI, dimension annotations, authoritative dimension tables, BOM, source assembly tree or engineering authority. Browser geometry retains an approximate metre-scale envelope for appearance visualization, but it is not a dimensional authority and must not be used for measurement or engineering dimensions. The 20 files are transport shards, not engineering systems.",
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
export const EXL50U_GA_FILE_COUNT = 20;
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
export const EXL50U_GA_MAX_SCENE_TRIANGLES = 35_000_000;
export const EXL50U_GA_MAX_DRAW_CALLS = 800;
export const EXL50U_GA_MIN_HIGH_TRIANGLE_RETENTION = 0.98;
export const EXL50U_GA_ASSET_FORMAT = "glTF 2.0 binary + EXT_meshopt_compression + EXT_mesh_gpu_instancing; POSITION Float32; NORMAL normalized Int8 (8-bit); indices Uint16/Uint32";

const SHARD_METRICS = [
  "uniqueGeometryMeshes",
  "uniqueGeometryTriangles",
  "uniqueGeometryVertices",
  "placementInstances",
  "drawCalls",
  "sceneDrawTriangles",
  "decodedGpuBytes",
];
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

export function normalizeExl50uGeneralAssemblyDerivationEvidence(value, { reviewCandidate = false } = {}) {
  const evidenceKeys = [
    "kind", "selectedAttempt", "sourceInputCleaning", "previewVisualLod", "highQem", "highPartition", "coverage",
  ];
  const sourceInputCleaningKeys = [
    "policy", "definitionInputs", "sourceFaces", "sourceTriangles", "sanitizedTriangles", "removedTriangles",
    "affectedDefinitions", "removedUnreferencedVertices", "allDefinitionsAccounted", "allSourceFacesAccounted",
  ];
  const lodKeys = [
    "algorithm", "selectedTargetTriangleRatio", "simplifierNormalizedErrorLimit",
    "maxAcceptedSimplifierReportedNormalizedError", "minimumTrianglesPerDefinition",
    "definitionsUsingMinimum", "minimumCoverage", "extremaCoverage",
    "retainedSourcePositionValuesUnchanged", "allDefinitionsNonempty", "boundsMissCount",
    "receiptCount", "receiptSha256", "outputCleaning",
  ];
  const outputCleaningKeys = [
    "policy", "selectedTrianglesBeforeCleaning", "finalTriangles", "removedRepeatedIndexTriangles",
    "removedZeroAreaTriangles", "removedDuplicateTriangles", "removedNonmanifoldTriangles",
    "repairedDefinitions", "finalRepeatedIndexTriangles", "finalZeroAreaTriangles",
    "finalDuplicateTriangles", "finalNonmanifoldEdgeCount",
  ];
  const coverageKeys = [
    "renderableDefinitions", "renderableOccurrences", "skippedDefinitions", "skippedOccurrences",
    "sourceDefinitions", "sourceOccurrences", "previewMissingDefinitions",
    "previewMissingOccurrences", "highMissingDefinitions", "highMissingOccurrences",
  ];
  const sourceInputCleaning = value?.sourceInputCleaning;
  const preview = value?.previewVisualLod;
  const high = value?.highQem;
  const highPartition = value?.highPartition;
  const coverage = value?.coverage;
  const previewCleaning = preview?.outputCleaning;
  const highCleaning = high?.outputCleaning;
  const visualQa = preview?.visualQa;
  const sha256 = (candidate) => typeof candidate === "string" && /^[a-f0-9]{64}$/u.test(candidate);
  const finiteUnit = (candidate, allowZero = false) => typeof candidate === "number"
    && Number.isFinite(candidate)
    && candidate >= (allowZero ? 0 : Number.EPSILON)
    && candidate <= 1;
  const validOutputCleaning = (cleaning) => {
    const removed = [
      "removedRepeatedIndexTriangles", "removedZeroAreaTriangles",
      "removedDuplicateTriangles", "removedNonmanifoldTriangles",
    ];
    return exactKeys(cleaning, outputCleaningKeys)
      && cleaning.policy === "stable-repeated-zero-duplicate-edge-incidence-clean-v1"
      && positiveSafeInteger(cleaning.selectedTrianglesBeforeCleaning)
      && positiveSafeInteger(cleaning.finalTriangles)
      && [...removed, "repairedDefinitions"].every((key) => nonNegativeSafeInteger(cleaning[key]))
      && cleaning.selectedTrianglesBeforeCleaning
        === cleaning.finalTriangles + removed.reduce((sum, key) => sum + cleaning[key], 0)
      && cleaning.finalRepeatedIndexTriangles === 0
      && cleaning.finalZeroAreaTriangles === 0
      && cleaning.finalDuplicateTriangles === 0
      && cleaning.finalNonmanifoldEdgeCount === 0;
  };
  const validLod = (lod) => object(lod)
    && finiteUnit(lod.selectedTargetTriangleRatio)
    && finiteUnit(lod.simplifierNormalizedErrorLimit)
    && finiteUnit(lod.maxAcceptedSimplifierReportedNormalizedError, true)
    && lod.maxAcceptedSimplifierReportedNormalizedError <= lod.simplifierNormalizedErrorLimit
    && positiveSafeInteger(lod.minimumTrianglesPerDefinition)
    && nonNegativeSafeInteger(lod.definitionsUsingMinimum)
    && lod.minimumCoverage === "stable-source-order-minimum-plus-six-axis-extrema-v1"
    && lod.extremaCoverage === "six-axis-first-valid-nondegenerate-incident-triangle-v1"
    && lod.retainedSourcePositionValuesUnchanged === true
    && lod.allDefinitionsNonempty === true
    && lod.boundsMissCount === 0
    && positiveSafeInteger(lod.receiptCount)
    && sha256(lod.receiptSha256)
    && validOutputCleaning(lod.outputCleaning);
  if (
    !exactKeys(value, evidenceKeys)
    || value.kind !== "anonymous-public-derivative"
    || ![1, 2].includes(value.selectedAttempt)
    || !exactKeys(sourceInputCleaning, sourceInputCleaningKeys)
    || sourceInputCleaning.policy !== "repeated-index-and-exact-zero-area-drop-stable-vertex-remap-v1"
    || sourceInputCleaningKeys.filter((key) => !["policy", "allDefinitionsAccounted", "allSourceFacesAccounted"].includes(key))
      .some((key) => !nonNegativeSafeInteger(sourceInputCleaning[key]))
    || ["definitionInputs", "sourceFaces", "sourceTriangles", "sanitizedTriangles"]
      .some((key) => !positiveSafeInteger(sourceInputCleaning[key]))
    || sourceInputCleaning.allDefinitionsAccounted !== true
    || sourceInputCleaning.allSourceFacesAccounted !== true
    || sourceInputCleaning.sourceTriangles
      !== sourceInputCleaning.sanitizedTriangles + sourceInputCleaning.removedTriangles
    || !exactKeys(preview, [...lodKeys, "visualQa"])
    || preview.algorithm !== "meshoptimizer-simplify-sloppy"
    || !validLod(preview)
    || preview.selectedTargetTriangleRatio !== 0.03
    || preview.simplifierNormalizedErrorLimit !== 0.02
    || preview.minimumTrianglesPerDefinition !== 12
    || !exactKeys(visualQa, [
      "policy", "viewCount", "silhouetteIouFloor", "minimumObservedSilhouetteIou",
      "normalizedDepthP99Ceiling", "maximumObservedNormalizedDepthP99", "receiptSha256",
      ...(reviewCandidate ? ["status"] : []),
    ])
    || (reviewCandidate && visualQa.status !== "USER_VISUAL_REVIEW_REQUIRED")
    || visualQa.policy !== "canonical-10-view-silhouette-depth-1024-v1"
    || visualQa.viewCount !== 10
    || visualQa.silhouetteIouFloor !== 0.97
    || !finiteUnit(visualQa.minimumObservedSilhouetteIou, true)
    || (!reviewCandidate && visualQa.minimumObservedSilhouetteIou < visualQa.silhouetteIouFloor)
    || visualQa.normalizedDepthP99Ceiling !== 0.02
    || !finiteUnit(visualQa.maximumObservedNormalizedDepthP99, true)
    || (!reviewCandidate && visualQa.maximumObservedNormalizedDepthP99 > visualQa.normalizedDepthP99Ceiling)
    || (reviewCandidate
      && visualQa.minimumObservedSilhouetteIou >= visualQa.silhouetteIouFloor
      && visualQa.maximumObservedNormalizedDepthP99 <= visualQa.normalizedDepthP99Ceiling)
    || !sha256(visualQa.receiptSha256)
    || !exactKeys(high, [...lodKeys, "targetMissCount", "retainedIrreducibleCount"])
    || high.algorithm !== "meshoptimizer-simplify-qem"
    || !validLod(high)
    || high.selectedTargetTriangleRatio !== (value.selectedAttempt === 1 ? 0.7 : 0.65)
    || high.simplifierNormalizedErrorLimit !== 0.0005
    || high.minimumTrianglesPerDefinition !== 12
    || highCleaning.finalTriangles < Math.floor(
      EXL50U_GA_MIN_HIGH_TRIANGLE_RETENTION
        * high.selectedTargetTriangleRatio
        * sourceInputCleaning.sanitizedTriangles,
    )
    || !nonNegativeSafeInteger(high.targetMissCount)
    || !nonNegativeSafeInteger(high.retainedIrreducibleCount)
    || high.targetMissCount !== high.retainedIrreducibleCount
    || high.targetMissCount > high.receiptCount
    || !exactKeys(highPartition, [
      "policy", "geometryChunkCount", "splitDefinitionCount", "finalTrianglesBeforePartition",
      "partitionedTriangles", "missingTriangles", "duplicateTriangles", "missingOccurrences", "receiptSha256",
    ])
    || highPartition.policy !== "stable-definition-triangle-chunks-v1"
    || !positiveSafeInteger(highPartition.geometryChunkCount)
    || !nonNegativeSafeInteger(highPartition.splitDefinitionCount)
    || !positiveSafeInteger(highPartition.finalTrianglesBeforePartition)
    || !positiveSafeInteger(highPartition.partitionedTriangles)
    || highPartition.missingTriangles !== 0
    || highPartition.duplicateTriangles !== 0
    || highPartition.missingOccurrences !== 0
    || !sha256(highPartition.receiptSha256)
    || !exactKeys(coverage, coverageKeys)
    || !positiveSafeInteger(coverage.renderableDefinitions)
    || !positiveSafeInteger(coverage.renderableOccurrences)
    || !nonNegativeSafeInteger(coverage.skippedDefinitions)
    || !nonNegativeSafeInteger(coverage.skippedOccurrences)
    || !positiveSafeInteger(coverage.sourceDefinitions)
    || !positiveSafeInteger(coverage.sourceOccurrences)
    || coverage.sourceDefinitions !== coverage.renderableDefinitions + coverage.skippedDefinitions
    || coverage.sourceOccurrences !== coverage.renderableOccurrences + coverage.skippedOccurrences
    || sourceInputCleaning.definitionInputs !== coverage.renderableDefinitions
    || sourceInputCleaning.affectedDefinitions > coverage.renderableDefinitions
    || preview.receiptCount !== coverage.renderableDefinitions
    || high.receiptCount !== coverage.renderableDefinitions
    || preview.definitionsUsingMinimum > coverage.renderableDefinitions
    || high.definitionsUsingMinimum > coverage.renderableDefinitions
    || previewCleaning.repairedDefinitions > coverage.renderableDefinitions
    || highCleaning.repairedDefinitions > coverage.renderableDefinitions
    || previewCleaning.selectedTrianglesBeforeCleaning > sourceInputCleaning.sanitizedTriangles
    || highCleaning.selectedTrianglesBeforeCleaning > sourceInputCleaning.sanitizedTriangles
    || highPartition.splitDefinitionCount > coverage.renderableDefinitions
    || highPartition.finalTrianglesBeforePartition !== highCleaning.finalTriangles
    || highPartition.partitionedTriangles !== highCleaning.finalTriangles
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
 * Convert a reviewed public 1.5 manifest into the only 20 files that may be
 * hydrated or proxied. This function deliberately accepts metadata, not CAD
 * or a directory scan, so undeclared files can never enter the allow-list.
 */
export function extractExl50uGeneralAssemblyAssets(manifest) {
  const reviewCandidate = object(manifest?.reviewCandidate)
    && exactKeys(manifest.reviewCandidate, ["status", "productionEligible"])
    && manifest.reviewCandidate.status === "USER_VISUAL_REVIEW_REQUIRED"
    && manifest.reviewCandidate.productionEligible === false;
  if (
    !object(manifest)
    || !exactKeys(manifest, [...PROJECTED_MANIFEST_KEYS, ...(reviewCandidate ? ["reviewCandidate"] : [])])
    || Object.entries(FIXED_TEMPLATE).some(([key, value]) => !isDeepStrictEqual(manifest[key], value))
    || manifest.schemaVersion !== "1.5"
    || manifest.id !== EXL50U_GA_BUNDLE_ID
    || manifest.access?.classification !== "PUBLIC"
    || manifest.access?.redistributionAllowed !== true
    || manifest.access?.engineeringUseAllowed !== false
    || !object(manifest.assets)
    || !exactKeys(manifest.assets, ["shardBundles"])
    || !object(manifest.derivationEvidence)
  ) {
    throw new Error("EXL-50U general-assembly manifest identity or public boundary is invalid");
  }
  const derivationEvidence = normalizeExl50uGeneralAssemblyDerivationEvidence(
    manifest.derivationEvidence,
    { reviewCandidate },
  );

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

  const files = [];
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
  const shardBytes = totalBytes;
  if (
    files.length !== EXL50U_GA_FILE_COUNT
    || new Set(files.map((file) => file.filename)).size !== files.length
    || new Set(files.map((file) => file.route)).size !== files.length
    || new Set(files.map((file) => file.sha256)).size !== files.length
    || Number(shardBundle.bytes) !== shardBytes
    || SHARD_METRICS.some((field) => metricTotals[field] !== shardBundle[field])
    || unionMin.some((coordinate, axis) => coordinate !== shardBundle.boundsMetres.min[axis])
    || unionMax.some((coordinate, axis) => coordinate !== shardBundle.boundsMetres.max[axis])
    || derivationEvidence.highQem.outputCleaning.finalTriangles
      !== metricTotals.uniqueGeometryTriangles
    || derivationEvidence.highPartition.finalTrianglesBeforePartition
      !== metricTotals.uniqueGeometryTriangles
    || derivationEvidence.highPartition.partitionedTriangles
      !== metricTotals.uniqueGeometryTriangles
    || derivationEvidence.highPartition.geometryChunkCount
      !== metricTotals.uniqueGeometryMeshes
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
    "// Generated from the reviewed public EXL-50U 1.5 manifest by",
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
