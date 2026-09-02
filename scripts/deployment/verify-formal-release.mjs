#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExl50uGeneralAssemblyActivatedCard } from "../assets/activate-exl50u-general-assembly-catalog.mjs";
import { validateRuntimeAssetLock } from "../../deploy/aliyun-hk/verify-runtime-assets.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_CONTRACT = resolve(ROOT, "deploy", "formal-release-contract.json");
const DEFAULT_RUNTIME_LOCK = resolve(ROOT, "assets", "runtime-assets.lock.json");
const DEFAULT_DEVICE_CATALOG = resolve(ROOT, "public", "models", "device-catalog.json");
const EXL_BUNDLE_ID = "exl50u-general-assembly-v1";
const EXL_DEVICE_ID = "exl50u-general-assembly-20260630";
const EXL_CARD_KEYS = [
  "id", "index", "title", "eyebrow", "state", "tone", "facts", "deviceOverview",
  "fileSummary", "copy", "availability", "delivery", "comparisonFrame", "statement",
  "viewer", "physicsOverlays", "diagnosticWorkspace",
];
const EXL_VIEWER_KEYS = [
  "mode", "manifestEndpoint", "turntableManifestEndpoint", "overlayEligible",
];

const FIXED = Object.freeze({
  schemaVersion: 2,
  environment: "formal-paired-release",
  pattern: "^[0-9a-f]{40}$",
  localRef: "HEAD",
  codeupBranch: "master",
  githubBranch: "main",
  releaseRoot: "/srv/fusiondigital/releases",
  publicIpv4: "47.75.119.239",
  hkStatus: "active",
  hkTarget: "aliyun-hk",
  hkMode: "public-anonymous",
  sitesProjectId: "appgprj_6a78141f72588191a3b12afd0ad56022",
  sitesUrl: "https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site",
  sitesStatus: "succeeded",
  sitesTarget: "sites",
  externalRuntimeAssets: {
    schema: "fusiondigital.external-runtime-assets-v1",
    evidenceSchema: "fusiondigital.external-runtime-assets-evidence-v1",
    lockPath: "assets/runtime-assets.lock.json",
    installerVerifierPath: "deploy/aliyun-hk/verify-runtime-assets.mjs",
    responseHeaders: {
      contentType: "model/gltf-binary",
      contentEncoding: "identity",
      cacheControl: "public, max-age=31536000, immutable",
      acceptRanges: "bytes",
    },
    hongKong: {
      delivery: "local-hydrated",
      verifyEveryFile: true,
      rangeProbeEveryBundle: true,
      contentEncoding: "identity",
      unknownPathStatus: 404,
    },
    sites: {
      delivery: "strict-allowlist-local-first-https-fallback",
      hydrated: false,
      verifyEveryFile: true,
      rangeProbeEveryBundle: true,
      fallbackProbeEveryBundle: true,
      unknownPathStatus: 404,
      archiveLimitBytes: 268_435_456,
      mirror: {
        provider: "github-raw-fixed-commit",
        origin: "https://raw.githubusercontent.com",
        repositoryPath: "tianshao1992/fusion-physics-atlas-assets",
        commitShaPattern: "^[0-9a-f]{40}$",
        bundlePathPolicy: "exact-bundle-id",
        requireNoRedirects: true,
      },
    },
    bundles: [
      {
        id: "iter-high-detail-v1",
        activation: "required",
        routeRoot: "/device-assets/iter-high-detail/v1",
        fileCount: 18,
        totalBytes: 98_507_692,
        sourceDirEnv: "FUSION_ASSET_SOURCE_DIR",
        baseUrlEnv: "FUSION_ASSET_BASE_URL",
      },
      {
        id: "exl50u-general-assembly-v1",
        activation: "catalog-real-3d",
        catalogDeviceId: "exl50u-general-assembly-20260630",
        manifestEndpoint: "/models/exl50u-general-assembly-v1/model-manifest.json",
        routeRoot: "/device-assets/exl50u-general-assembly/v1",
        fileCount: 21,
        shardCount: 20,
        maxTotalBytes: 314_572_800,
        runtimeSynthesizedRoot: "EXL50U_GA_VISUALIZATION",
        sourceDirEnv: "FUSION_EXL50U_GA_ASSET_SOURCE_DIR",
        baseUrlEnv: "FUSION_EXL50U_GA_ASSET_BASE_URL",
      },
    ],
  },
  sharedContentSchema: "fusiondigital.shared-content-v1",
  sharedContentPaths: [
    "/models/device-catalog.json",
    "/models/exl50u-diagview2-v1/manifest.json",
    "/models/exl50u-diagview2-v1/diagview2-ports.json",
    "/models/exl50u-sensor-points-v1/manifest.json",
    "/models/exl50u-sensor-points-v1/sensor-points.json",
    "/models/ehl2-preliminary-v1/model-manifest.json",
    "/models/ehl2-preliminary-v1/diagview2-ports.json",
    "/models/ehl2-preliminary-v1/ehl2-preliminary.meshopt.glb",
    "/device-data/exl50u-efit/index.json",
    "/device-data/exl50u-efit/shot-18303.bin",
    "/device-data/exl50u-efit-v2/index.json",
    "/device-data/exl50u-efit-v2/shot-20213-part-000.jsonl.gz",
    "/data/exl50u-mdsplus-snapshot-v1/manifest.json",
    "/data/exl50u-mdsplus-snapshot-v1/shot-20831.jsonl.gz",
    "/data/exl50u-mdsplus-snapshot-v1/shot-20833.jsonl.gz",
    "/data/exl50u-mdsplus-snapshot-v1/shot-20835.jsonl.gz",
    "/data/exl50u-mdsplus-snapshot-v1/shot-20836.jsonl.gz",
    "/models/iter-public-simplified/model-manifest.json",
    "/device-assets/iter-high-detail/v1/cryostat-base.f4daa0cabe2cdc3fb44057d57c5b5863c295015b2d692ea34f86cc7a96a9a34e.high.meshopt.glb",
  ],
  conditionalSharedContentPaths: [{
    activation: "external-runtime-bundle-active",
    bundleId: EXL_BUNDLE_ID,
    path: "/models/exl50u-general-assembly-v1/model-manifest.json",
  }, {
    activation: "external-runtime-bundle-active",
    bundleId: EXL_BUNDLE_ID,
    path: "/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md",
  }],
  forbiddenDomains: ["fusiondigital.club", "www.fusiondigital.club"],
});

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function at(value, path) {
  return path.split(".").reduce(
    (current, key) => (object(current) ? current[key] : undefined),
    value,
  );
}

function exact(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

function exactArray(actual, expected, label) {
  if (
    !Array.isArray(actual)
    || actual.length !== expected.length
    || actual.some((item, index) => item !== expected[index])
  ) {
    throw new Error(`${label} does not match the fixed paired-release policy.`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function exactObject(actual, expected, label) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} does not match the fixed paired-release policy.`);
  }
}

function requireExactKeys(errors, value, expected, label) {
  if (!object(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    errors.push(`${label} contains missing or unknown fields.`);
  }
}

function verifyEvidenceShape(evidence, errors) {
  const shapes = [
    [evidence, ["schemaVersion", "git", "hongKong", "sites", "verification", "sharedContent", "externalRuntimeAssets"], "evidence"],
    [evidence.git, ["local", "codeup", "github"], "git"],
    [evidence.git?.local, ["ref", "commit_sha"], "git.local"],
    [evidence.git?.codeup, ["branch", "commit_sha"], "git.codeup"],
    [evidence.git?.github, ["branch", "commit_sha"], "git.github"],
    [evidence.hongKong, ["release", "build"], "hongKong"],
    [evidence.hongKong?.release, ["status", "path", "current_resolved_path", "commit_sha", "public_ipv4", "manifest_sha256"], "hongKong.release"],
    [evidence.hongKong?.build, ["target", "mode", "archive_sha256"], "hongKong.build"],
    [evidence.sites, ["project_id", "source", "deployment", "build", "custom_domains"], "sites"],
    [evidence.sites?.source, ["commit_sha", "version_id"], "sites.source"],
    [evidence.sites?.deployment, ["id", "version_id", "source_commit_sha", "status", "url"], "sites.deployment"],
    [evidence.sites?.build, ["target", "archive_sha256"], "sites.build"],
    [evidence.verification, ["observed_at", "dns_gate", "hong_kong_tls", "china_carriers"], "verification"],
    [evidence.verification?.dns_gate, ["status", "report_sha256"], "verification.dns_gate"],
    [evidence.verification?.hong_kong_tls, ["status", "hostnames", "not_after", "http2"], "verification.hong_kong_tls"],
    [evidence.verification?.china_carriers, ["telecom", "unicom", "mobile"], "verification.china_carriers"],
    [evidence.sharedContent, ["schema", "entries", "hong_kong_aggregate_sha256", "sites_aggregate_sha256"], "sharedContent"],
  ];
  for (const [value, keys, label] of shapes) requireExactKeys(errors, value, keys, label);
}

function canonicalExternalRuntimeLine(entry, endpoint) {
  const observation = entry[endpoint];
  return `${JSON.stringify([entry.path, observation.status, observation.bytes, observation.sha256])}\n`;
}

function canonicalCredentialFreeHttpsUrl(value) {
  if (
    typeof value !== "string"
    || value === ""
    || value !== value.trim()
    || /[\u0000-\u001f\u007f?#]/u.test(value)
    || !/^[a-z][a-z0-9+.-]*:\/\/[^/]+/iu.test(value)
    || /^[a-z][a-z0-9+.-]*:\/\/[^/]*@/iu.test(value)
  ) return null;
  try {
    const parsed = new URL(value);
    return parsed.href === value ? parsed : null;
  } catch {
    return null;
  }
}

export function computeExternalRuntimeAssetDigest(entries, endpoint) {
  if (!Array.isArray(entries) || !["hong_kong", "sites"].includes(endpoint)) {
    throw new Error("External-runtime digest input is invalid.");
  }
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(canonicalExternalRuntimeLine(entry, endpoint), "utf8");
  return hash.digest("hex");
}

function validateAssetObservation(
  errors,
  observation,
  expectedFile,
  endpoint,
  label,
  headers,
  bundleId,
  mirrorPolicy,
  mirrorCommitSha,
) {
  const commonKeys = [
    "status", "bytes", "sha256", "content_type", "content_encoding",
    "cache_control", "accept_ranges", "delivery",
  ];
  const keys = endpoint === "sites" ? [...commonKeys, "upstream_url"] : commonKeys;
  requireExactKeys(errors, observation, keys, label);
  if (!object(observation)) return null;
  if (observation.status !== 200) errors.push(`${label}.status must be 200.`);
  if (observation.bytes !== expectedFile.bytes) errors.push(`${label}.bytes differs from the runtime lock.`);
  if (observation.sha256 !== expectedFile.sha256) errors.push(`${label}.sha256 differs from the runtime lock.`);
  if (observation.content_type !== headers.contentType) errors.push(`${label}.content_type is not the fixed GLB type.`);
  if (observation.content_encoding !== headers.contentEncoding) errors.push(`${label}.content_encoding must be identity.`);
  if (observation.cache_control !== headers.cacheControl) errors.push(`${label}.cache_control is not immutable.`);
  if (observation.accept_ranges !== headers.acceptRanges) errors.push(`${label}.accept_ranges must be bytes.`);
  const expectedDelivery = endpoint === "sites" ? "https-fallback" : "local-hydrated";
  if (observation.delivery !== expectedDelivery) errors.push(`${label}.delivery must be ${expectedDelivery}.`);
  if (endpoint === "sites") {
    const upstream = canonicalCredentialFreeHttpsUrl(observation.upstream_url);
    if (upstream) {
      const hostname = upstream.hostname.toLowerCase();
      const forbiddenHost = hostname.endsWith(".")
        || hostname === "fusiondigital.club"
        || hostname.endsWith(".fusiondigital.club")
        || hostname === "chatgpt.site"
        || hostname.endsWith(".chatgpt.site");
      const expectedBasePath = `/${mirrorPolicy.repositoryPath}/${mirrorCommitSha}/${bundleId}`;
      if (upstream.protocol !== "https:" || forbiddenHost
        || upstream.username !== "" || upstream.password !== ""
        || upstream.search !== "" || upstream.hash !== ""
        || upstream.origin !== mirrorPolicy.origin
        || hostname !== new URL(mirrorPolicy.origin).hostname
        || upstream.pathname !== `${expectedBasePath}/${expectedFile.filename}`) {
        errors.push(`${label}.upstream_url must prove an independent HTTPS fallback for the locked file.`);
        return null;
      }
      return upstream;
    } else {
      errors.push(`${label}.upstream_url must prove an independent HTTPS fallback for the locked file.`);
    }
  }
  return null;
}

function validateRangeObservation(
  errors,
  observation,
  expectedFile,
  endpoint,
  label,
  headers,
  bundleId,
  mirrorPolicy,
  mirrorCommitSha,
) {
  const commonKeys = [
    "path", "status", "bytes", "content_range", "content_type", "content_encoding",
    "cache_control", "accept_ranges", "delivery",
  ];
  const keys = endpoint === "sites" ? [...commonKeys, "upstream_url"] : commonKeys;
  requireExactKeys(errors, observation, keys, label);
  if (!object(observation)) return null;
  if (observation.path !== expectedFile.route) errors.push(`${label}.path must probe the bundle's first locked file.`);
  if (observation.status !== 206 || observation.bytes !== 1) errors.push(`${label} must record a one-byte 206 response.`);
  if (observation.content_range !== `bytes 0-0/${expectedFile.bytes}`) errors.push(`${label}.content_range is invalid.`);
  return validateAssetObservation(
    errors,
    {
      status: 200,
      bytes: expectedFile.bytes,
      sha256: expectedFile.sha256,
      content_type: observation.content_type,
      content_encoding: observation.content_encoding,
      cache_control: observation.cache_control,
      accept_ranges: observation.accept_ranges,
      delivery: observation.delivery,
      ...(endpoint === "sites" ? { upstream_url: observation.upstream_url } : {}),
    },
    expectedFile,
    endpoint,
    label,
    headers,
    bundleId,
    mirrorPolicy,
    mirrorCommitSha,
  );
}

function verifyExternalRuntimeAssets(contract, evidence, runtimeLock, errors) {
  const root = evidence.externalRuntimeAssets;
  requireExactKeys(errors, root, ["schema", "asset_mirror", "bundles", "unknown_path"], "externalRuntimeAssets");
  if (!object(root)) return;
  if (root.schema !== contract.externalRuntimeAssets.evidenceSchema) {
    errors.push("externalRuntimeAssets.schema does not match the formal release contract.");
  }
  const mirrorPolicy = contract.externalRuntimeAssets.sites.mirror;
  const mirrorEvidence = root.asset_mirror;
  requireExactKeys(
    errors,
    mirrorEvidence,
    ["provider", "origin", "repository_path", "commit_sha", "redirect_count"],
    "externalRuntimeAssets.asset_mirror",
  );
  const mirrorCommitPattern = new RegExp(mirrorPolicy.commitShaPattern, "u");
  if (!object(mirrorEvidence)
    || mirrorEvidence.provider !== mirrorPolicy.provider
    || mirrorEvidence.origin !== mirrorPolicy.origin
    || mirrorEvidence.repository_path !== mirrorPolicy.repositoryPath
    || typeof mirrorEvidence.commit_sha !== "string"
    || !mirrorCommitPattern.test(mirrorEvidence.commit_sha)
    || mirrorEvidence.redirect_count !== 0
    || mirrorPolicy.bundlePathPolicy !== "exact-bundle-id"
    || mirrorPolicy.requireNoRedirects !== true) {
    errors.push("externalRuntimeAssets.asset_mirror must bind the fixed GitHub raw repository, full commit and zero redirects.");
  }
  let activeBundles;
  try {
    activeBundles = validateRuntimeAssetLock(runtimeLock);
  } catch (error) {
    errors.push(`runtime asset lock failed complete validation: ${error.message}`);
    return;
  }
  if (!Array.isArray(root.bundles) || root.bundles.length !== activeBundles.length) {
    errors.push(`externalRuntimeAssets.bundles must contain exactly ${activeBundles.length} active locked bundles.`);
    return;
  }
  const configured = new Map(contract.externalRuntimeAssets.bundles.map((bundle) => [bundle.id, bundle]));
  const headers = contract.externalRuntimeAssets.responseHeaders;
  for (let bundleIndex = 0; bundleIndex < activeBundles.length; bundleIndex += 1) {
    const locked = activeBundles[bundleIndex];
    const observed = root.bundles[bundleIndex];
    const label = `externalRuntimeAssets.bundles[${bundleIndex}]`;
    requireExactKeys(errors, observed, [
      "id", "entries", "hong_kong_aggregate_sha256", "sites_aggregate_sha256", "range",
    ], label);
    if (!object(locked) || !object(observed) || observed.id !== locked.id) {
      errors.push(`${label}.id must match active runtime-lock order.`);
      continue;
    }
    const policy = configured.get(locked.id);
    if (!policy || locked.routeRoot !== policy.routeRoot || locked.fileCount !== policy.fileCount
      || (policy.totalBytes !== undefined && locked.totalBytes !== policy.totalBytes)
      || (policy.maxTotalBytes !== undefined && locked.totalBytes > policy.maxTotalBytes)
      || !Array.isArray(locked.files) || locked.files.length !== locked.fileCount) {
      errors.push(`${label} is not an activated bundle allowed by the formal contract and runtime lock.`);
      continue;
    }
    if (!Array.isArray(observed.entries) || observed.entries.length !== locked.files.length) {
      errors.push(`${label}.entries must cover every locked file exactly once.`);
      continue;
    }
    let mirrorBase = null;
    for (let fileIndex = 0; fileIndex < locked.files.length; fileIndex += 1) {
      const file = locked.files[fileIndex];
      const entry = observed.entries[fileIndex];
      const entryLabel = `${label}.entries[${fileIndex}]`;
      requireExactKeys(errors, entry, ["path", "hong_kong", "sites"], entryLabel);
      if (!object(file) || !object(entry) || entry.path !== file.route) {
        errors.push(`${entryLabel}.path must match the locked route in exact order.`);
        continue;
      }
      validateAssetObservation(
        errors, entry.hong_kong, file, "hong_kong", `${entryLabel}.hong_kong`, headers,
        locked.id, mirrorPolicy, mirrorEvidence?.commit_sha,
      );
      const upstream = validateAssetObservation(
        errors, entry.sites, file, "sites", `${entryLabel}.sites`, headers,
        locked.id, mirrorPolicy, mirrorEvidence?.commit_sha,
      );
      if (upstream) {
        const candidateBase = upstream.href.slice(0, -(`/${file.filename}`.length));
        if (mirrorBase === null) mirrorBase = candidateBase;
        else if (mirrorBase !== candidateBase) {
          errors.push(`${entryLabel}.sites.upstream_url must use one controlled origin and base path per bundle.`);
        }
      }
    }
    if (!errors.some((error) => error.startsWith(`${label}.entries`))) {
      for (const endpoint of ["hong_kong", "sites"]) {
        const supplied = observed[`${endpoint}_aggregate_sha256`];
        const expected = computeExternalRuntimeAssetDigest(observed.entries, endpoint);
        if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/u.test(supplied) || supplied !== expected) {
          errors.push(`${label}.${endpoint}_aggregate_sha256 does not match canonical per-path observations.`);
        }
      }
    }
    requireExactKeys(errors, observed.range, ["hong_kong", "sites"], `${label}.range`);
    const first = locked.files[0];
    validateRangeObservation(
      errors, observed.range?.hong_kong, first, "hong_kong", `${label}.range.hong_kong`, headers,
      locked.id, mirrorPolicy, mirrorEvidence?.commit_sha,
    );
    const rangeUpstream = validateRangeObservation(
      errors,
      observed.range?.sites,
      first,
      "sites",
      `${label}.range.sites`,
      headers,
      locked.id,
      mirrorPolicy,
      mirrorEvidence?.commit_sha,
    );
    if (rangeUpstream && mirrorBase !== null
      && rangeUpstream.href.slice(0, -(`/${first.filename}`.length)) !== mirrorBase) {
      errors.push(`${label}.range.sites.upstream_url must use the bundle's controlled origin and base path.`);
    }
  }
  requireExactKeys(errors, root.unknown_path, ["path", "hong_kong_status", "sites_status"], "externalRuntimeAssets.unknown_path");
  const unknownPath = root.unknown_path?.path;
  const lockedRoutes = new Set(activeBundles.flatMap((bundle) => bundle.files?.map((file) => file.route) ?? []));
  if (typeof unknownPath !== "string" || !unknownPath.startsWith("/device-assets/") || lockedRoutes.has(unknownPath)) {
    errors.push("externalRuntimeAssets.unknown_path.path must be an unlisted device-asset route.");
  }
  if (root.unknown_path?.hong_kong_status !== contract.externalRuntimeAssets.hongKong.unknownPathStatus
    || root.unknown_path?.sites_status !== contract.externalRuntimeAssets.sites.unknownPathStatus) {
    errors.push("externalRuntimeAssets.unknown_path must prove 404 on Hong Kong and Sites.");
  }
}

function verifyCatalogLockCoupling(catalog, runtimeLock, errors) {
  if (!object(catalog) || !Array.isArray(catalog.devices)) {
    errors.push("device catalog is required to bind EXL-50U activation to the runtime lock.");
    return;
  }
  const cards = catalog.devices.filter((entry) => entry?.id === EXL_DEVICE_ID);
  if (cards.length !== 1) {
    errors.push("device catalog must contain exactly one EXL-50U general-assembly card.");
    return;
  }
  let bundles;
  try {
    bundles = validateRuntimeAssetLock(runtimeLock);
  } catch (error) {
    errors.push(`runtime asset lock failed complete validation: ${error.message}`);
    return;
  }
  const active = bundles.some((bundle) => bundle.id === EXL_BUNDLE_ID);
  const card = cards[0];
  if (active) {
    try {
      validateExl50uGeneralAssemblyActivatedCard(card);
    } catch (error) {
      errors.push(`active EXL-50U runtime lock requires the exact real-3d catalog card: ${error.message}`);
    }
    return;
  }
  requireExactKeys(errors, card, EXL_CARD_KEYS, "metadata-only EXL-50U catalog card");
  requireExactKeys(errors, card.viewer, EXL_VIEWER_KEYS, "metadata-only EXL-50U catalog card.viewer");
  if (
    card.id !== EXL_DEVICE_ID
    || card.index !== "03"
    || !Array.isArray(card.facts)
    || card.facts.length < 3
    || card.facts.some((value) => typeof value !== "string" || value === "")
    || !Array.isArray(card.physicsOverlays)
    || card.physicsOverlays.length !== 0
    || card.diagnosticWorkspace !== null
    || card.comparisonFrame !== null
    || card.availability !== "pipeline-ready-assets-pending"
    || card.delivery !== "local-only"
    || card.viewer?.mode !== "metadata-only"
    || card.viewer?.manifestEndpoint !== null
    || card.viewer?.turntableManifestEndpoint !== null
    || card.viewer?.overlayEligible !== false
  ) {
    errors.push("metadata-only EXL-50U runtime lock requires the exact pending catalog state.");
  }
}

export function validateFormalReleaseContract(contract) {
  if (!object(contract)) throw new Error("Formal release contract must be an object.");
  exact(contract.schemaVersion, FIXED.schemaVersion, "schemaVersion");
  exact(contract.environment, FIXED.environment, "environment");
  exact(contract.commitShaPattern, FIXED.pattern, "commitShaPattern");
  exact(at(contract, "git.local.ref"), FIXED.localRef, "git.local.ref");
  exact(at(contract, "git.codeup.branch"), FIXED.codeupBranch, "git.codeup.branch");
  exact(at(contract, "git.github.branch"), FIXED.githubBranch, "git.github.branch");
  exact(at(contract, "hongKong.releaseRoot"), FIXED.releaseRoot, "hongKong.releaseRoot");
  exact(at(contract, "hongKong.publicIpv4"), FIXED.publicIpv4, "hongKong.publicIpv4");
  exact(at(contract, "hongKong.requiredStatus"), FIXED.hkStatus, "hongKong.requiredStatus");
  exact(at(contract, "hongKong.build.target"), FIXED.hkTarget, "hongKong.build.target");
  exact(at(contract, "hongKong.build.mode"), FIXED.hkMode, "hongKong.build.mode");
  exact(at(contract, "sites.projectId"), FIXED.sitesProjectId, "sites.projectId");
  exact(at(contract, "sites.platformUrl"), FIXED.sitesUrl, "sites.platformUrl");
  exact(at(contract, "sites.requiredStatus"), FIXED.sitesStatus, "sites.requiredStatus");
  exact(at(contract, "sites.build.target"), FIXED.sitesTarget, "sites.build.target");
  exactObject(contract.externalRuntimeAssets, FIXED.externalRuntimeAssets, "externalRuntimeAssets");
  exact(at(contract, "sharedContent.schema"), FIXED.sharedContentSchema, "sharedContent.schema");
  exactArray(at(contract, "sharedContent.paths"), FIXED.sharedContentPaths, "sharedContent.paths");
  exactObject(
    at(contract, "sharedContent.conditionalPaths"),
    FIXED.conditionalSharedContentPaths,
    "sharedContent.conditionalPaths",
  );
  exactArray(contract.forbiddenSitesCustomDomains, FIXED.forbiddenDomains, "forbiddenSitesCustomDomains");
  return contract;
}

async function json(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} JSON at ${path}: ${error.message}`);
  }
}

export async function loadFormalReleaseContract(path = DEFAULT_CONTRACT) {
  return validateFormalReleaseContract(await json(path, "formal release contract"));
}

function requireExact(errors, evidence, path, expected) {
  const value = at(evidence, path);
  if (value === undefined || value === null || value === "") {
    errors.push(`${path} is required.`);
  } else if (value !== expected) {
    errors.push(`${path} does not match the formal release contract.`);
  }
}

function verifyShas(contract, evidence, errors) {
  const pattern = new RegExp(contract.commitShaPattern, "u");
  const paths = [
    "git.local.commit_sha",
    "git.codeup.commit_sha",
    "git.github.commit_sha",
    "hongKong.release.commit_sha",
    "sites.source.commit_sha",
    "sites.deployment.source_commit_sha",
  ];
  const values = paths.map((path) => ({ path, value: at(evidence, path) }));
  for (const entry of values) {
    if (typeof entry.value !== "string" || !pattern.test(entry.value)) {
      errors.push(`${entry.path} must be a full lowercase 40-character Git SHA.`);
    }
  }
  const expected = values[0].value;
  if (typeof expected === "string" && pattern.test(expected)) {
    for (const entry of values.slice(1)) {
      if (typeof entry.value === "string" && pattern.test(entry.value) && entry.value !== expected) {
        errors.push(`${entry.path} does not match git.local.commit_sha.`);
      }
    }
    return expected;
  }
  return null;
}

function verifyDomains(contract, evidence, errors) {
  const domains = at(evidence, "sites.custom_domains");
  if (!Array.isArray(domains)) {
    errors.push("sites.custom_domains must be an array, including an empty array when none exist.");
    return;
  }
  const forbidden = new Set(contract.forbiddenSitesCustomDomains);
  domains.forEach((entry, index) => {
    requireExactKeys(errors, entry, ["hostname", "status"], `sites.custom_domains[${index}]`);
    const hostname = object(entry) && typeof entry.hostname === "string"
      ? entry.hostname.trim().toLowerCase().replace(/\.+$/u, "")
      : "";
    if (!hostname || hostname !== entry?.hostname || !hostname.includes(".")) {
      errors.push(`sites.custom_domains[${index}].hostname must be a canonical hostname.`);
    } else if (forbidden.has(hostname)) {
      errors.push(`sites.custom_domains[${index}].hostname must not bind a production domain to Sites.`);
    }
    if (!object(entry) || !["pending", "pending_validation"].includes(entry.status)) {
      errors.push(`sites.custom_domains[${index}].status must remain pending and inactive.`);
    }
  });
}

function requireSha256(errors, evidence, path) {
  const value = at(evidence, path);
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    errors.push(`${path} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireNonEmpty(errors, evidence, path) {
  const value = at(evidence, path);
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} must be a non-empty string.`);
  }
  return value;
}

function requireIsoTimestamp(errors, evidence, path) {
  const value = at(evidence, path);
  const instant = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) {
    errors.push(`${path} must be an ISO-8601 UTC timestamp.`);
  }
  return instant;
}

function canonicalSharedLine(entry, endpoint) {
  const observation = entry[endpoint];
  return `${JSON.stringify([entry.path, observation.status, observation.bytes, observation.sha256])}\n`;
}

export function computeSharedContentDigest(entries, endpoint) {
  if (!Array.isArray(entries) || !["hong_kong", "sites"].includes(endpoint)) {
    throw new Error("Shared-content digest input is invalid.");
  }
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(canonicalSharedLine(entry, endpoint), "utf8");
  return hash.digest("hex");
}

function expectedSharedContentPaths(contract, runtimeLock) {
  const activeBundleIds = new Set(
    Array.isArray(runtimeLock?.externalBundles)
      ? runtimeLock.externalBundles.map((bundle) => bundle?.id)
      : [],
  );
  return [
    ...contract.sharedContent.paths,
    ...contract.sharedContent.conditionalPaths
      .filter((entry) => (
        entry.activation === "external-runtime-bundle-active"
        && activeBundleIds.has(entry.bundleId)
      ))
      .map((entry) => entry.path),
  ];
}

function verifySharedContent(contract, evidence, runtimeLock, errors) {
  requireExact(errors, evidence, "sharedContent.schema", contract.sharedContent.schema);
  const entries = at(evidence, "sharedContent.entries");
  if (!Array.isArray(entries)) {
    errors.push("sharedContent.entries must be an array.");
    return;
  }
  const expectedPaths = expectedSharedContentPaths(contract, runtimeLock);
  if (entries.length !== expectedPaths.length) {
    errors.push(`sharedContent.entries must contain exactly ${expectedPaths.length} fixed paths.`);
    return;
  }
  entries.forEach((entry, index) => {
    requireExactKeys(errors, entry, ["path", "hong_kong", "sites"], `sharedContent.entries[${index}]`);
    if (!object(entry) || entry.path !== expectedPaths[index]) {
      errors.push(`sharedContent.entries[${index}].path does not match the fixed path allowlist.`);
      return;
    }
    for (const endpoint of ["hong_kong", "sites"]) {
      const observation = entry[endpoint];
      const label = `sharedContent.entries[${index}].${endpoint}`;
      requireExactKeys(errors, observation, ["status", "bytes", "sha256"], label);
      if (!object(observation)) {
        errors.push(`${label} must be an observation object.`);
        continue;
      }
      if (observation.status !== 200) errors.push(`${label}.status must be 200.`);
      if (!Number.isSafeInteger(observation.bytes) || observation.bytes <= 0) {
        errors.push(`${label}.bytes must be a positive safe integer.`);
      }
      if (typeof observation.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(observation.sha256)) {
        errors.push(`${label}.sha256 must be a lowercase SHA-256 digest.`);
      }
    }
    if (
      object(entry?.hong_kong)
      && object(entry?.sites)
      && entry.hong_kong.status === 200
      && entry.sites.status === 200
      && entry.hong_kong.bytes !== entry.sites.bytes
    ) {
      errors.push(`sharedContent.entries[${index}] byte counts do not match.`);
    }
    if (
      object(entry?.hong_kong)
      && object(entry?.sites)
      && /^[0-9a-f]{64}$/u.test(entry.hong_kong.sha256 ?? "")
      && /^[0-9a-f]{64}$/u.test(entry.sites.sha256 ?? "")
      && entry.hong_kong.sha256 !== entry.sites.sha256
    ) {
      errors.push(`sharedContent.entries[${index}] SHA-256 digests do not match.`);
    }
  });
  if (errors.some((error) => error.startsWith("sharedContent.entries"))) return;
  for (const endpoint of ["hong_kong", "sites"]) {
    const expected = computeSharedContentDigest(entries, endpoint);
    const path = `sharedContent.${endpoint}_aggregate_sha256`;
    const supplied = requireSha256(errors, evidence, path);
    if (supplied && supplied !== expected) errors.push(`${path} does not match the canonical entries digest.`);
  }
}

function verifyLiveEvidence(contract, evidence, sha, runtimeLock, errors) {
  if (sha) {
    requireExact(
      errors,
      evidence,
      "hongKong.release.current_resolved_path",
      `${contract.hongKong.releaseRoot}/${sha}`,
    );
  }
  requireSha256(errors, evidence, "hongKong.release.manifest_sha256");
  requireSha256(errors, evidence, "hongKong.build.archive_sha256");
  requireNonEmpty(errors, evidence, "sites.source.version_id");
  requireNonEmpty(errors, evidence, "sites.deployment.id");
  const sourceVersion = requireNonEmpty(errors, evidence, "sites.deployment.version_id");
  if (sourceVersion && sourceVersion !== at(evidence, "sites.source.version_id")) {
    errors.push("sites.deployment.version_id does not match sites.source.version_id.");
  }
  requireSha256(errors, evidence, "sites.build.archive_sha256");
  const now = Date.now();
  const observedAt = requireIsoTimestamp(errors, evidence, "verification.observed_at");
  if (Number.isFinite(observedAt) && (observedAt > now + 5 * 60_000 || observedAt < now - 24 * 60 * 60_000)) {
    errors.push("verification.observed_at must be no more than 5 minutes in the future or 24 hours old.");
  }
  requireExact(errors, evidence, "verification.dns_gate.status", "passed");
  requireSha256(errors, evidence, "verification.dns_gate.report_sha256");
  requireExact(errors, evidence, "verification.hong_kong_tls.status", "valid");
  const tlsHostnames = at(evidence, "verification.hong_kong_tls.hostnames");
  if (
    !Array.isArray(tlsHostnames)
    || tlsHostnames.length !== 2
    || tlsHostnames[0] !== "fusiondigital.club"
    || tlsHostnames[1] !== "www.fusiondigital.club"
  ) {
    errors.push("verification.hong_kong_tls.hostnames must contain the two production hostnames in canonical order.");
  }
  const notAfter = requireIsoTimestamp(errors, evidence, "verification.hong_kong_tls.not_after");
  if (
    Number.isFinite(notAfter)
    && (notAfter <= observedAt || notAfter <= now + 7 * 24 * 60 * 60_000)
  ) {
    errors.push("verification.hong_kong_tls.not_after must be later than the observation and at least 7 days in the future.");
  }
  requireExact(errors, evidence, "verification.hong_kong_tls.http2", true);
  for (const carrier of ["telecom", "unicom", "mobile"]) {
    requireExact(errors, evidence, `verification.china_carriers.${carrier}`, "passed");
  }
  verifySharedContent(contract, evidence, runtimeLock, errors);
}

export function verifyFormalReleaseEvidence(contract, evidence, runtimeLock, deviceCatalog) {
  validateFormalReleaseContract(contract);
  const errors = [];
  if (!object(evidence)) {
    return { ok: false, commit_sha: null, errors: ["Formal release evidence must be an object."] };
  }
  verifyEvidenceShape(evidence, errors);
  if (evidence.schemaVersion !== 2) errors.push("schemaVersion must be 2.");
  const sha = verifyShas(contract, evidence, errors);
  requireExact(errors, evidence, "git.local.ref", contract.git.local.ref);
  requireExact(errors, evidence, "git.codeup.branch", contract.git.codeup.branch);
  requireExact(errors, evidence, "git.github.branch", contract.git.github.branch);
  requireExact(errors, evidence, "hongKong.release.status", contract.hongKong.requiredStatus);
  requireExact(errors, evidence, "hongKong.release.public_ipv4", contract.hongKong.publicIpv4);
  requireExact(errors, evidence, "hongKong.build.target", contract.hongKong.build.target);
  requireExact(errors, evidence, "hongKong.build.mode", contract.hongKong.build.mode);
  if (sha) {
    requireExact(errors, evidence, "hongKong.release.path", `${contract.hongKong.releaseRoot}/${sha}`);
  } else if (!at(evidence, "hongKong.release.path")) {
    errors.push("hongKong.release.path is required.");
  }
  requireExact(errors, evidence, "sites.project_id", contract.sites.projectId);
  requireExact(errors, evidence, "sites.deployment.status", contract.sites.requiredStatus);
  requireExact(errors, evidence, "sites.deployment.url", contract.sites.platformUrl);
  requireExact(errors, evidence, "sites.build.target", contract.sites.build.target);
  verifyDomains(contract, evidence, errors);
  verifyLiveEvidence(contract, evidence, sha, runtimeLock, errors);
  verifyExternalRuntimeAssets(contract, evidence, runtimeLock, errors);
  verifyCatalogLockCoupling(deviceCatalog, runtimeLock, errors);
  return { ok: errors.length === 0, commit_sha: errors.length === 0 ? sha : null, errors };
}

function actualHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Could not read actual repository HEAD: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

export function validateRepositoryStatus(status) {
  if (typeof status !== "string") throw new Error("Repository status must be text.");
  if (status.trim() !== "") {
    throw new Error("Repository worktree must be clean, including untracked files.");
  }
}

function ensureCleanRepository() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Could not read repository status: ${result.stderr.trim()}`);
  }
  validateRepositoryStatus(result.stdout);
}

function ensureEvidenceOutsideRepository(evidencePath) {
  const pathFromRoot = relative(ROOT, evidencePath);
  if (pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))) {
    throw new Error("Formal release evidence must be stored outside the repository.");
  }
}

function argumentsPath(argv) {
  if (argv.length !== 2 || argv[0] !== "--evidence" || !argv[1]) {
    throw new Error("Usage: npm run release:verify-pair -- --evidence PATH");
  }
  return resolve(process.cwd(), argv[1]);
}

async function main() {
  const evidencePath = argumentsPath(process.argv.slice(2));
  ensureEvidenceOutsideRepository(evidencePath);
  ensureCleanRepository();
  const [contract, evidence, runtimeLock, deviceCatalog] = await Promise.all([
    loadFormalReleaseContract(),
    json(evidencePath, "formal release evidence"),
    json(DEFAULT_RUNTIME_LOCK, "runtime asset lock"),
    json(DEFAULT_DEVICE_CATALOG, "device catalog"),
  ]);
  const result = verifyFormalReleaseEvidence(contract, evidence, runtimeLock, deviceCatalog);
  if (!result.ok) {
    for (const error of result.errors) console.error(`- ${error}`);
    throw new Error(`Formal paired-release evidence failed ${result.errors.length} check(s).`);
  }
  const head = actualHead();
  if (result.commit_sha !== head) {
    throw new Error(`Evidence commit ${result.commit_sha} does not match actual HEAD ${head}.`);
  }
  console.log(`Formal Hong Kong + Sites provenance verified at ${result.commit_sha}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`Formal release verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
