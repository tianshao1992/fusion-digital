import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeSharedContentDigest,
  computeExternalRuntimeAssetDigest,
  loadFormalReleaseContract,
  validateRepositoryStatus,
  validateFormalReleaseContract,
  verifyFormalReleaseEvidence,
} from "../scripts/deployment/verify-formal-release.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = join(ROOT, "deploy", "formal-release-contract.json");
const SCRIPT_PATH = join(ROOT, "scripts", "deployment", "verify-formal-release.mjs");
const SHA = "2aee7502b7a3779fd2c2c8d2486de4a208efa6cb";
const OTHER_SHA = "3aee7502b7a3779fd2c2c8d2486de4a208efa6cb";
const PROJECT_ID = "appgprj_6a78141f72588191a3b12afd0ad56022";
const SITES_URL = "https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site";
const PUBLIC_IPV4 = "47.75.119.239";
const ACTUAL_HEAD = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout.trim();
const WORKTREE_DIRTY = spawnSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all"],
  { cwd: ROOT, encoding: "utf8" },
).stdout.trim() !== "";
const HK_ARCHIVE_SHA256 = "a".repeat(64);
const SITES_ARCHIVE_SHA256 = "b".repeat(64);
const MANIFEST_SHA256 = "d".repeat(64);
const DNS_REPORT_SHA256 = "e".repeat(64);
const ASSET_MIRROR_SHA = "0123456789abcdef0123456789abcdef01234567";
const ASSET_MIRROR_ORIGIN = "https://raw.githubusercontent.com";
const ASSET_MIRROR_REPOSITORY = "tianshao1992/fusion-physics-atlas-assets";
const EXL_GENERAL_ASSEMBLY_MANIFEST = "/models/exl50u-general-assembly-v1/model-manifest.json";
const EXL_GENERAL_ASSEMBLY_NOTICE = "/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md";
const EXL_GENERAL_ASSEMBLY_SHARED_PATHS = [
  EXL_GENERAL_ASSEMBLY_MANIFEST,
  EXL_GENERAL_ASSEMBLY_NOTICE,
];
const SHARED_PATHS = [
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
];

let contract;
let runtimeLock;
let deviceCatalog;
let activationContract;
let temporaryDirectory;

function externalRuntimeEvidence(lock = runtimeLock) {
  const headers = {
    content_type: "model/gltf-binary",
    content_encoding: "identity",
    cache_control: "public, max-age=31536000, immutable",
    accept_ranges: "bytes",
  };
  return {
    schema: "fusiondigital.external-runtime-assets-evidence-v1",
    asset_mirror: {
      provider: "github-raw-fixed-commit",
      origin: ASSET_MIRROR_ORIGIN,
      repository_path: ASSET_MIRROR_REPOSITORY,
      commit_sha: ASSET_MIRROR_SHA,
      redirect_count: 0,
    },
    bundles: lock.externalBundles.map((bundle) => {
      const mirrorBase = `${ASSET_MIRROR_ORIGIN}/${ASSET_MIRROR_REPOSITORY}/${ASSET_MIRROR_SHA}/${bundle.id}`;
      const entries = bundle.files.map((file) => ({
        path: file.route,
        hong_kong: {
          status: 200,
          bytes: file.bytes,
          sha256: file.sha256,
          ...headers,
          delivery: "local-hydrated",
        },
        sites: {
          status: 200,
          bytes: file.bytes,
          sha256: file.sha256,
          ...headers,
          delivery: "https-fallback",
          upstream_url: `${mirrorBase}/${file.filename}`,
        },
      }));
      const first = bundle.files[0];
      return {
        id: bundle.id,
        entries,
        hong_kong_aggregate_sha256: computeExternalRuntimeAssetDigest(entries, "hong_kong"),
        sites_aggregate_sha256: computeExternalRuntimeAssetDigest(entries, "sites"),
        range: {
          hong_kong: {
            path: first.route,
            status: 206,
            bytes: 1,
            content_range: `bytes 0-0/${first.bytes}`,
            ...headers,
            delivery: "local-hydrated",
          },
          sites: {
            path: first.route,
            status: 206,
            bytes: 1,
            content_range: `bytes 0-0/${first.bytes}`,
            ...headers,
            delivery: "https-fallback",
            upstream_url: `${mirrorBase}/${first.filename}`,
          },
        },
      };
    }),
    unknown_path: {
      path: "/device-assets/__formal-release-unknown__.glb",
      hong_kong_status: 404,
      sites_status: 404,
    },
  };
}

function validEvidence(sha = SHA, lock = runtimeLock) {
  const activeSharedPaths = lock.externalBundles.some(
    (bundle) => bundle.id === "exl50u-general-assembly-v1",
  ) ? [...SHARED_PATHS, ...EXL_GENERAL_ASSEMBLY_SHARED_PATHS] : SHARED_PATHS;
  const entries = activeSharedPaths.map((path, index) => {
    const sha256 = createHash("sha256").update(path, "utf8").digest("hex");
    const observation = { status: 200, bytes: 1000 + index, sha256 };
    return { path, hong_kong: { ...observation }, sites: { ...observation } };
  });
  const evidence = {
    schemaVersion: 2,
    git: {
      local: { ref: "HEAD", commit_sha: sha },
      codeup: { branch: "master", commit_sha: sha },
      github: { branch: "main", commit_sha: sha },
    },
    hongKong: {
      release: {
        status: "active",
        path: `/srv/fusiondigital/releases/${sha}`,
        current_resolved_path: `/srv/fusiondigital/releases/${sha}`,
        commit_sha: sha,
        public_ipv4: PUBLIC_IPV4,
        manifest_sha256: MANIFEST_SHA256,
      },
      build: {
        target: "aliyun-hk",
        mode: "public-anonymous",
        archive_sha256: HK_ARCHIVE_SHA256,
      },
    },
    sites: {
      project_id: PROJECT_ID,
      source: { commit_sha: sha, version_id: "appgver_test" },
      deployment: {
        id: "deployment_test",
        version_id: "appgver_test",
        source_commit_sha: sha,
        status: "succeeded",
        url: SITES_URL,
      },
      build: { target: "sites", archive_sha256: SITES_ARCHIVE_SHA256 },
      custom_domains: [],
    },
    verification: {
      observed_at: new Date(Date.now() - 60_000).toISOString(),
      dns_gate: { status: "passed", report_sha256: DNS_REPORT_SHA256 },
      hong_kong_tls: {
        status: "valid",
        hostnames: ["fusiondigital.club", "www.fusiondigital.club"],
        not_after: new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString(),
        http2: true,
      },
      china_carriers: { telecom: "passed", unicom: "passed", mobile: "passed" },
    },
    sharedContent: {
      schema: "fusiondigital.shared-content-v1",
      entries,
      hong_kong_aggregate_sha256: computeSharedContentDigest(entries, "hong_kong"),
      sites_aggregate_sha256: computeSharedContentDigest(entries, "sites"),
    },
    externalRuntimeAssets: externalRuntimeEvidence(lock),
  };
  return evidence;
}

function clone(value) {
  return structuredClone(value);
}

function catalogForLock(lock) {
  if (!lock.externalBundles.some((bundle) => bundle.id === "exl50u-general-assembly-v1")) {
    return deviceCatalog;
  }
  const catalog = clone(deviceCatalog);
  catalog.devices = catalog.devices.map((device) => (
    device.id === "exl50u-general-assembly-20260630"
      ? clone(activationContract.replacement)
      : device
  ));
  return catalog;
}

function failure(evidence, pattern, lock = runtimeLock, catalog = catalogForLock(lock)) {
  const result = verifyFormalReleaseEvidence(contract, evidence, lock, catalog);
  assert.equal(result.ok, false);
  assert.equal(result.commit_sha, null);
  assert.match(result.errors.join("\n"), pattern);
}

function twoActiveBundleRuntimeLock() {
  const files = Array.from({ length: 21 }, (_value, index) => {
    const role = index === 0 ? "preview" : `anonymous-shard-${String(index).padStart(2, "0")}`;
    const sha256 = createHash("sha256").update(`EXL ACTIVE PAIR FIXTURE ${index}`, "utf8").digest("hex");
    const filename = index === 0
      ? `device.preview.${sha256}.meshopt.glb`
      : `anonymous-shard-${String(index).padStart(2, "0")}.${sha256}.high.meshopt.glb`;
    return {
      role,
      filename,
      route: `/device-assets/exl50u-general-assembly/v1/${filename}`,
      bytes: 4_096 + index,
      sha256,
    };
  });
  const aggregate = createHash("sha256");
  for (const file of [...files].sort((left, right) => left.filename.localeCompare(right.filename, "en"))) {
    aggregate.update(`${file.filename}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }
  const exlBundle = {
    id: "exl50u-general-assembly-v1",
    title: "EXL-50U integrated-assembly anonymous browser visualization derivative",
    classification: "PUBLIC",
    redistributionAllowed: true,
    engineeringUseAllowed: false,
    sourceCadIncluded: false,
    licensePath: "public/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md",
    destinationRoot: "public/models/exl50u-general-assembly-v1",
    stageDirectoryName: "exl50u-general-assembly-v1",
    routeRoot: "/device-assets/exl50u-general-assembly/v1",
    acquisition: {
      defaultBaseUrl: null,
      baseUrlEnv: "FUSION_EXL50U_GA_ASSET_BASE_URL",
      sourceDirEnv: "FUSION_EXL50U_GA_ASSET_SOURCE_DIR",
    },
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    aggregateSha256: aggregate.digest("hex"),
    files,
  };
  const lock = clone(runtimeLock);
  lock.externalBundles = lock.externalBundles.filter(
    (bundle) => bundle.id !== "exl50u-general-assembly-v1",
  );
  lock.externalBundles.push(exlBundle);
  assert.deepEqual(
    lock.externalBundles.map((bundle) => bundle.id),
    ["iter-high-detail-v1", "exl50u-general-assembly-v1"],
  );
  return lock;
}

before(async () => {
  [contract, runtimeLock, deviceCatalog, activationContract] = await Promise.all([
    loadFormalReleaseContract(CONTRACT_PATH),
    readFile(join(ROOT, "assets/runtime-assets.lock.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "public/models/device-catalog.json"), "utf8").then(JSON.parse),
    readFile(join(ROOT, "scripts/assets/exl50u-general-assembly-catalog-activation-contract.json"), "utf8").then(JSON.parse),
  ]);
  temporaryDirectory = await mkdtemp(join(tmpdir(), "fusiondigital-paired-release-"));
});

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("contract pins both repositories, Hong Kong premium EIP, and Sites", () => {
  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.environment, "formal-paired-release");
  assert.equal(contract.git.local.ref, "HEAD");
  assert.equal(contract.git.codeup.branch, "master");
  assert.equal(contract.git.github.branch, "main");
  assert.equal(contract.hongKong.releaseRoot, "/srv/fusiondigital/releases");
  assert.equal(contract.hongKong.publicIpv4, PUBLIC_IPV4);
  assert.deepEqual(contract.hongKong.build, {
    target: "aliyun-hk",
    mode: "public-anonymous",
  });
  assert.equal(contract.sites.projectId, PROJECT_ID);
  assert.equal(contract.sites.platformUrl, SITES_URL);
  assert.equal(contract.sites.requiredStatus, "succeeded");
  assert.equal(contract.externalRuntimeAssets.lockPath, "assets/runtime-assets.lock.json");
  assert.equal(contract.externalRuntimeAssets.hongKong.verifyEveryFile, true);
  assert.equal(contract.externalRuntimeAssets.hongKong.contentEncoding, "identity");
  assert.equal(contract.externalRuntimeAssets.evidenceSchema, "fusiondigital.external-runtime-assets-evidence-v1");
  assert.equal(contract.externalRuntimeAssets.sites.fallbackProbeEveryBundle, true);
  assert.equal(contract.externalRuntimeAssets.sites.hydrated, false);
  assert.equal(contract.externalRuntimeAssets.sites.archiveLimitBytes, 256 * 1024 * 1024);
  assert.deepEqual(contract.externalRuntimeAssets.sites.mirror, {
    provider: "github-raw-fixed-commit",
    origin: ASSET_MIRROR_ORIGIN,
    repositoryPath: ASSET_MIRROR_REPOSITORY,
    commitShaPattern: "^[0-9a-f]{40}$",
    bundlePathPolicy: "exact-bundle-id",
    requireNoRedirects: true,
  });
  assert.deepEqual(
    contract.externalRuntimeAssets.bundles.map((bundle) => ({
      id: bundle.id,
      activation: bundle.activation,
      sourceDirEnv: bundle.sourceDirEnv,
      baseUrlEnv: bundle.baseUrlEnv,
    })),
    [
      {
        id: "iter-high-detail-v1",
        activation: "required",
        sourceDirEnv: "FUSION_ASSET_SOURCE_DIR",
        baseUrlEnv: "FUSION_ASSET_BASE_URL",
      },
      {
        id: "exl50u-general-assembly-v1",
        activation: "catalog-real-3d",
        sourceDirEnv: "FUSION_EXL50U_GA_ASSET_SOURCE_DIR",
        baseUrlEnv: "FUSION_EXL50U_GA_ASSET_BASE_URL",
      },
    ],
  );
  assert.deepEqual(contract.sharedContent, {
    schema: "fusiondigital.shared-content-v1",
    paths: SHARED_PATHS,
    conditionalPaths: EXL_GENERAL_ASSEMBLY_SHARED_PATHS.map((path) => ({
      activation: "external-runtime-bundle-active",
      bundleId: "exl50u-general-assembly-v1",
      path,
    })),
  });
  assert.deepEqual(
    contract.sharedContent.paths.filter((path) => path.startsWith("/models/exl50u-diagview2-v1/")),
    [
      "/models/exl50u-diagview2-v1/manifest.json",
      "/models/exl50u-diagview2-v1/diagview2-ports.json",
    ],
  );
  assert.deepEqual(
    contract.sharedContent.paths.filter((path) => path.startsWith("/models/exl50u-sensor-points-v1/")),
    [
      "/models/exl50u-sensor-points-v1/manifest.json",
      "/models/exl50u-sensor-points-v1/sensor-points.json",
    ],
  );
  assert.equal(contract.sharedContent.paths.includes(EXL_GENERAL_ASSEMBLY_MANIFEST), false);
  assert.deepEqual(
    contract.sharedContent.conditionalPaths,
    EXL_GENERAL_ASSEMBLY_SHARED_PATHS.map((path) => ({
      activation: "external-runtime-bundle-active",
      bundleId: "exl50u-general-assembly-v1",
      path,
    })),
  );
  assert.deepEqual(
    contract.sharedContent.paths.filter((path) => path.startsWith("/data/exl50u-mdsplus-snapshot-v1/")),
    [
      "/data/exl50u-mdsplus-snapshot-v1/manifest.json",
      "/data/exl50u-mdsplus-snapshot-v1/shot-20831.jsonl.gz",
      "/data/exl50u-mdsplus-snapshot-v1/shot-20833.jsonl.gz",
      "/data/exl50u-mdsplus-snapshot-v1/shot-20835.jsonl.gz",
      "/data/exl50u-mdsplus-snapshot-v1/shot-20836.jsonl.gz",
    ],
  );
  assert.deepEqual(contract.forbiddenSitesCustomDomains, [
    "fusiondigital.club",
    "www.fusiondigital.club",
  ]);
});

test("fixed contract rejects EIP, Sites identity, and policy drift", () => {
  for (const mutate of [
    (value) => { value.hongKong.publicIpv4 = "47.82.66.79"; },
    (value) => { value.sites.projectId = "appgprj_other"; },
    (value) => { value.sites.platformUrl = "https://other.chatgpt.site"; },
    (value) => { value.sites.requiredStatus = "optional"; },
    (value) => { value.externalRuntimeAssets.sites.hydrated = true; },
    (value) => { value.externalRuntimeAssets.sites.mirror.repositoryPath = "other/assets"; },
    (value) => { value.externalRuntimeAssets.sites.mirror.requireNoRedirects = false; },
    (value) => { value.externalRuntimeAssets.bundles[1].fileCount = 20; },
    (value) => { value.sharedContent.conditionalPaths[0].bundleId = "other-bundle"; },
  ]) {
    const changed = clone(contract);
    mutate(changed);
    assert.throws(() => validateFormalReleaseContract(changed));
  }
});

test("exactly matching Git, Hong Kong, and Sites provenance passes", () => {
  assert.deepEqual(verifyFormalReleaseEvidence(contract, validEvidence(), runtimeLock, deviceCatalog), {
    ok: true,
    commit_sha: SHA,
    errors: [],
  });
});

test("pair evidence accepts every path for ITER and an activated EXL bundle", () => {
  const lock = twoActiveBundleRuntimeLock();
  const evidence = validEvidence(SHA, lock);
  assert.deepEqual(
    evidence.externalRuntimeAssets.bundles.map(({ id, entries }) => [id, entries.length]),
    [["iter-high-detail-v1", 18], ["exl50u-general-assembly-v1", 21]],
  );
  assert.deepEqual(
    evidence.sharedContent.entries.slice(-2).map(({ path }) => path),
    EXL_GENERAL_ASSEMBLY_SHARED_PATHS,
  );
  assert.deepEqual(verifyFormalReleaseEvidence(contract, evidence, lock, catalogForLock(lock)), {
    ok: true,
    commit_sha: SHA,
    errors: [],
  });
});

test("EXL manifest pair evidence is conditional on runtime-lock activation", () => {
  const metadataEvidence = validEvidence();
  assert.equal(
    metadataEvidence.sharedContent.entries.some(({ path }) => EXL_GENERAL_ASSEMBLY_SHARED_PATHS.includes(path)),
    false,
  );
  assert.equal(
    verifyFormalReleaseEvidence(contract, metadataEvidence, runtimeLock, deviceCatalog).ok,
    true,
  );

  const activeLock = twoActiveBundleRuntimeLock();
  const activeCatalog = catalogForLock(activeLock);
  for (const requiredPath of EXL_GENERAL_ASSEMBLY_SHARED_PATHS) {
    const missing = validEvidence(SHA, activeLock);
    missing.sharedContent.entries = missing.sharedContent.entries.filter(({ path }) => path !== requiredPath);
    missing.sharedContent.hong_kong_aggregate_sha256 = computeSharedContentDigest(
      missing.sharedContent.entries,
      "hong_kong",
    );
    missing.sharedContent.sites_aggregate_sha256 = computeSharedContentDigest(
      missing.sharedContent.entries,
      "sites",
    );
    failure(missing, /sharedContent\.entries must contain exactly/u, activeLock, activeCatalog);

    for (const mutate of [
      (entry) => { entry.sites.status = 404; },
      (entry) => { entry.sites.sha256 = "f".repeat(64); },
      (entry) => { entry.sites.bytes += 1; },
    ]) {
      const evidence = validEvidence(SHA, activeLock);
      mutate(evidence.sharedContent.entries.find(({ path }) => path === requiredPath));
      failure(evidence, /sharedContent\.entries/u, activeLock, activeCatalog);
    }
  }
});

test("pair evidence fails closed when the second active bundle is omitted or loses independent delivery proof", () => {
  const lock = twoActiveBundleRuntimeLock();
  const missingBundle = validEvidence(SHA, lock);
  missingBundle.externalRuntimeAssets.bundles.pop();
  failure(missingBundle, /exactly 2 active locked bundles/u, lock);

  const forgedFallback = validEvidence(SHA, lock);
  forgedFallback.externalRuntimeAssets.bundles[1].entries[20].sites.upstream_url =
    `https://fusiondigital.club/${lock.externalBundles[1].files[20].filename}`;
  failure(forgedFallback, /independent HTTPS fallback/u, lock);

  const missingRange = validEvidence(SHA, lock);
  missingRange.externalRuntimeAssets.bundles[1].range.sites.status = 200;
  failure(missingRange, /one-byte 206/u, lock);
});

test("formal evidence requires the fixed-repository, fixed-commit raw fallback", () => {
  const filename = runtimeLock.externalBundles[0].files[0].filename;
  for (const url of [
    `https://user:secret@assets.example.test/releases/${filename}`,
    `https://@assets.example.test/releases/${filename}`,
    `https://assets.example.test/releases/${filename}?`,
    `https://assets.example.test/releases/${filename}#`,
    `https://assets.fusiondigital.club/releases/${filename}`,
    `https://fusiondigital.club./releases/${filename}`,
    `https://another-project.chatgpt.site/releases/${filename}`,
    `https://another-project.chatgpt.site./releases/${filename}`,
    `https://raw.githubusercontent.com/other/fusion-physics-atlas-assets/${ASSET_MIRROR_SHA}/iter-high-detail-v1/${filename}`,
    `https://raw.githubusercontent.com/${ASSET_MIRROR_REPOSITORY}/main/iter-high-detail-v1/${filename}`,
    `https://raw.githubusercontent.com/${ASSET_MIRROR_REPOSITORY}/${ASSET_MIRROR_SHA.slice(0, 39)}/iter-high-detail-v1/${filename}`,
    `https://raw.githubusercontent.com/${ASSET_MIRROR_REPOSITORY}/${ASSET_MIRROR_SHA.toUpperCase()}/iter-high-detail-v1/${filename}`,
    `https://raw.githubusercontent.com/${ASSET_MIRROR_REPOSITORY}/${ASSET_MIRROR_SHA}/exl50u-general-assembly-v1/${filename}`,
    `https://raw.githubusercontent.com/${ASSET_MIRROR_REPOSITORY}/${ASSET_MIRROR_SHA}/iter-high-detail-v1/extra/${filename}`,
  ]) {
    const evidence = validEvidence();
    evidence.externalRuntimeAssets.bundles[0].entries[0].sites.upstream_url = url;
    failure(evidence, /independent HTTPS fallback/u);
  }

  const rangeEvidence = validEvidence();
  const rangeFilename = runtimeLock.externalBundles[0].files[0].filename;
  rangeEvidence.externalRuntimeAssets.bundles[0].range.sites.upstream_url =
    `https://user:secret@assets.example.test/releases/${rangeFilename}`;
  failure(rangeEvidence, /independent HTTPS fallback/u);

  const splitMirror = validEvidence();
  const secondFilename = runtimeLock.externalBundles[0].files[1].filename;
  splitMirror.externalRuntimeAssets.bundles[0].entries[1].sites.upstream_url =
    `https://raw.githubusercontent.com/${ASSET_MIRROR_REPOSITORY}/${"1".repeat(40)}/iter-high-detail-v1/${secondFilename}`;
  failure(splitMirror, /independent HTTPS fallback/u);

  for (const mutate of [
    (evidence) => { evidence.externalRuntimeAssets.asset_mirror.commit_sha = "main"; },
    (evidence) => { evidence.externalRuntimeAssets.asset_mirror.commit_sha = ASSET_MIRROR_SHA.toUpperCase(); },
    (evidence) => { evidence.externalRuntimeAssets.asset_mirror.repository_path = "other/assets"; },
    (evidence) => { evidence.externalRuntimeAssets.asset_mirror.redirect_count = 1; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    failure(evidence, /asset_mirror/u);
  }

  const fixedRawMirror = validEvidence();
  const rawBase = `${ASSET_MIRROR_ORIGIN}/${ASSET_MIRROR_REPOSITORY}/${ASSET_MIRROR_SHA}/iter-high-detail-v1`;
  for (let index = 0; index < runtimeLock.externalBundles[0].files.length; index += 1) {
    fixedRawMirror.externalRuntimeAssets.bundles[0].entries[index].sites.upstream_url =
      `${rawBase}/${runtimeLock.externalBundles[0].files[index].filename}`;
  }
  fixedRawMirror.externalRuntimeAssets.bundles[0].range.sites.upstream_url =
    `${rawBase}/${runtimeLock.externalBundles[0].files[0].filename}`;
  assert.equal(
    verifyFormalReleaseEvidence(contract, fixedRawMirror, runtimeLock, deviceCatalog).ok,
    true,
    "a fixed-commit raw.githubusercontent.com direct mirror remains permitted",
  );
});

test("formal verification performs complete runtime-lock validation", () => {
  const active = twoActiveBundleRuntimeLock();
  const mutations = [
    (lock) => { lock.externalBundles[0].title = "forged"; },
    (lock) => { lock.externalBundles[0].files[0].partId = "forged"; },
    (lock) => { lock.externalBundles[0].files[0].manifestPartId = "ITER-FORGED"; },
    (lock) => { lock.externalBundles[0].secret = "private"; },
    (lock) => { lock.externalBundles[1].classification = "INTERNAL"; },
    (lock) => { lock.externalBundles[1].redistributionAllowed = false; },
    (lock) => { lock.externalBundles[1].engineeringUseAllowed = true; },
    (lock) => { lock.externalBundles[1].sourceCadIncluded = true; },
    (lock) => { lock.externalBundles[1].sourceCad = "private/source.stp"; },
    (lock) => { lock.externalBundles[0].acquisition.defaultBaseUrl = "http://assets.example.test/releases"; },
    (lock) => { lock.externalBundles[0].acquisition.defaultBaseUrl = "https://user:secret@assets.example.test/releases"; },
    (lock) => { lock.externalBundles[1].files[0].bytes = null; },
    (lock) => { lock.externalBundles[1].files[0].sha256 = null; },
  ];
  for (const mutate of mutations) {
    const lock = clone(active);
    mutate(lock);
    const evidence = validEvidence(SHA, lock);
    failure(evidence, /runtime asset lock failed complete validation/u, lock, catalogForLock(active));
  }
});

test("formal verification binds EXL runtime-lock activation to the catalog state", () => {
  const active = twoActiveBundleRuntimeLock();
  failure(
    validEvidence(SHA, active),
    /active EXL-50U runtime lock requires the exact real-3d catalog card/u,
    active,
    deviceCatalog,
  );
  failure(
    validEvidence(),
    /metadata-only EXL-50U runtime lock requires the exact pending catalog state/u,
    runtimeLock,
    catalogForLock(active),
  );
  const activeWithPrivateExtra = catalogForLock(active);
  activeWithPrivateExtra.devices.find(({ id }) => id === "exl50u-general-assembly-20260630")
    .privateSourceCad = "D:/private/source.stp";
  failure(
    validEvidence(SHA, active),
    /exact real-3d catalog card/u,
    active,
    activeWithPrivateExtra,
  );
  const metadataWithPrivateExtra = clone(deviceCatalog);
  metadataWithPrivateExtra.devices.find(({ id }) => id === "exl50u-general-assembly-20260630")
    .privateSourceCad = "D:/private/source.stp";
  failure(
    validEvidence(),
    /missing or unknown fields/u,
    runtimeLock,
    metadataWithPrivateExtra,
  );
});

test("any missing or divergent deployment SHA fails closed", () => {
  const paths = [
    ["git", "codeup", "commit_sha"],
    ["git", "github", "commit_sha"],
    ["hongKong", "release", "commit_sha"],
    ["sites", "source", "commit_sha"],
    ["sites", "deployment", "source_commit_sha"],
  ];
  for (const path of paths) {
    const evidence = validEvidence();
    evidence[path[0]][path[1]][path[2]] = OTHER_SHA;
    failure(evidence, /does not match git\.local\.commit_sha/u);
  }
  const missing = validEvidence();
  delete missing.sites.source.commit_sha;
  failure(missing, /sites\.source\.commit_sha must be/u);
});

test("Hong Kong active path, EIP, target, and anonymous mode are mandatory", () => {
  for (const mutate of [
    (value) => { value.hongKong.release.status = "installed"; },
    (value) => { value.hongKong.release.path = `/tmp/${SHA}`; },
    (value) => { value.hongKong.release.current_resolved_path = `/tmp/${SHA}`; },
    (value) => { value.hongKong.release.public_ipv4 = "47.82.66.79"; },
    (value) => { value.hongKong.build.target = "sites"; },
    (value) => { value.hongKong.build.mode = "authenticated"; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    failure(evidence, /hongKong/u);
  }
});

test("Sites successful deployment, exact platform URL, and target are mandatory", () => {
  for (const mutate of [
    (value) => { value.sites.project_id = "appgprj_other"; },
    (value) => { value.sites.deployment.status = "pending"; },
    (value) => { value.sites.deployment.url = `${SITES_URL}/`; },
    (value) => { value.sites.deployment.version_id = "appgver_other"; },
    (value) => { value.sites.build.target = "aliyun-hk"; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    failure(evidence, /sites\./u);
  }
});

test("Sites permits only inactive unrelated domain records and never production domains", () => {
  const unrelated = validEvidence();
  unrelated.sites.custom_domains.push({ hostname: "preview.example.org", status: "pending" });
  assert.equal(verifyFormalReleaseEvidence(contract, unrelated, runtimeLock, deviceCatalog).ok, true);
  const active = validEvidence();
  active.sites.custom_domains.push({ hostname: "preview.example.org", status: "active" });
  failure(active, /must remain pending and inactive/u);
  for (const hostname of ["fusiondigital.club", "www.fusiondigital.club"]) {
    const evidence = validEvidence();
    evidence.sites.custom_domains.push({ hostname, status: "active" });
    failure(evidence, /must not bind a production domain/u);
  }
});

test("CLI accepts complete evidence and rejects drift", {
  skip: WORKTREE_DIRTY ? "repository must be committed before CLI acceptance is tested" : false,
}, async () => {
  const validPath = join(temporaryDirectory, "valid.json");
  const badPath = join(temporaryDirectory, "bad.json");
  const bad = validEvidence(ACTUAL_HEAD);
  bad.sites.source.commit_sha = OTHER_SHA;
  await Promise.all([
    writeFile(validPath, `${JSON.stringify(validEvidence(ACTUAL_HEAD))}\n`, "utf8"),
    writeFile(badPath, `${JSON.stringify(bad)}\n`, "utf8"),
  ]);
  const accepted = spawnSync(process.execPath, [SCRIPT_PATH, "--evidence", validPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, new RegExp(ACTUAL_HEAD, "u"));
  const rejected = spawnSync(process.execPath, [SCRIPT_PATH, "--evidence", badPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /does not match git\.local\.commit_sha/u);
});

test("CLI rejects internally consistent evidence for a commit other than actual HEAD", {
  skip: WORKTREE_DIRTY ? "repository must be committed before CLI acceptance is tested" : false,
}, async () => {
  const oldPath = join(temporaryDirectory, "old-head.json");
  await writeFile(oldPath, `${JSON.stringify(validEvidence())}\n`, "utf8");
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--evidence", oldPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match actual HEAD/u);
});

test("shared content and live deployment identity cannot drift", () => {
  for (const mutate of [
    (value) => { value.sharedContent.entries[0].path = "/forged"; },
    (value) => { value.sharedContent.entries[1].sites.sha256 = "f".repeat(64); },
    (value) => { value.sharedContent.entries[2].sites.bytes += 1; },
    (value) => { value.sharedContent.sites_aggregate_sha256 = "f".repeat(64); },
    (value) => { value.sites.deployment.commit_sha = OTHER_SHA; },
    (value) => { value.sites.deployment.id = ""; },
    (value) => { value.hongKong.release.manifest_sha256 = "not-a-hash"; },
    (value) => { value.verification.dns_gate.status = "failed"; },
    (value) => { value.verification.china_carriers.mobile = "failed"; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    failure(evidence, /sharedContent|sites\.deployment|deployment\.id|manifest_sha256|verification\./u);
  }
});

test("canonical shared-content digest is path, status, byte, and hash sensitive", () => {
  const evidence = validEvidence();
  const original = computeSharedContentDigest(evidence.sharedContent.entries, "hong_kong");
  for (const mutate of [
    (entries) => { entries[0].path = "/different"; },
    (entries) => { entries[0].hong_kong.status = 206; },
    (entries) => { entries[0].hong_kong.bytes += 1; },
    (entries) => { entries[0].hong_kong.sha256 = "0".repeat(64); },
  ]) {
    const entries = clone(evidence.sharedContent.entries);
    mutate(entries);
    assert.notEqual(computeSharedContentDigest(entries, "hong_kong"), original);
  }
});

test("every active external-runtime path, digest, header, range, fallback and unknown 404 is mandatory", () => {
  for (const [mutate, pattern] of [
    [(value) => { value.externalRuntimeAssets.bundles[0].entries.pop(); }, /cover every locked file/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].entries[0].hong_kong.bytes += 1; }, /runtime lock/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].entries[0].sites.sha256 = "0".repeat(64); }, /runtime lock/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].hong_kong_aggregate_sha256 = "0".repeat(64); }, /aggregate_sha256/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].entries[0].hong_kong.content_encoding = "gzip"; }, /identity/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].entries[0].sites.cache_control = "no-store"; }, /immutable/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].range.hong_kong.status = 200; }, /one-byte 206/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].range.sites.content_range = "bytes 1-1/2"; }, /content_range/u],
    [(value) => { value.externalRuntimeAssets.bundles[0].entries[0].sites.upstream_url = SITES_URL; }, /independent HTTPS fallback/u],
    [(value) => { value.externalRuntimeAssets.unknown_path.sites_status = 200; }, /prove 404/u],
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    failure(evidence, pattern);
  }
});

test("formal release verification requires a fully clean repository", () => {
  assert.doesNotThrow(() => validateRepositoryStatus("\n"));
  assert.throws(
    () => validateRepositoryStatus(" M app/page.tsx\n?? evidence.json\n"),
    /must be clean/u,
  );
});

test("live observations cannot be stale, future-dated, or backed by an expiring certificate", () => {
  for (const mutate of [
    (value) => { value.verification.observed_at = new Date(Date.now() - 25 * 60 * 60_000).toISOString(); },
    (value) => { value.verification.observed_at = new Date(Date.now() + 6 * 60_000).toISOString(); },
    (value) => { value.verification.hong_kong_tls.not_after = new Date(Date.now() + 6 * 24 * 60 * 60_000).toISOString(); },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    failure(evidence, /observed_at|not_after/u);
  }
});
