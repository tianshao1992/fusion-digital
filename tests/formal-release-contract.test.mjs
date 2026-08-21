import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeSharedContentDigest,
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
const SHARED_PATHS = [
  "/models/device-catalog.json",
  "/models/ehl2-preliminary-v1/model-manifest.json",
  "/models/ehl2-preliminary-v1/diagview2-ports.json",
  "/models/ehl2-preliminary-v1/ehl2-preliminary.meshopt.glb",
  "/device-data/exl50u-efit/index.json",
  "/device-data/exl50u-efit/shot-18303.bin",
  "/device-data/exl50u-efit-v2/index.json",
  "/device-data/exl50u-efit-v2/shot-20213-part-000.jsonl.gz",
  "/models/iter-public-simplified/model-manifest.json",
  "/device-assets/iter-high-detail/v1/cryostat-base.f4daa0cabe2cdc3fb44057d57c5b5863c295015b2d692ea34f86cc7a96a9a34e.high.meshopt.glb",
];

let contract;
let temporaryDirectory;

function validEvidence(sha = SHA) {
  const entries = SHARED_PATHS.map((path, index) => {
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
  };
  return evidence;
}

function clone(value) {
  return structuredClone(value);
}

function failure(evidence, pattern) {
  const result = verifyFormalReleaseEvidence(contract, evidence);
  assert.equal(result.ok, false);
  assert.equal(result.commit_sha, null);
  assert.match(result.errors.join("\n"), pattern);
}

before(async () => {
  contract = await loadFormalReleaseContract(CONTRACT_PATH);
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
  assert.deepEqual(contract.sharedContent, {
    schema: "fusiondigital.shared-content-v1",
    paths: SHARED_PATHS,
  });
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
  ]) {
    const changed = clone(contract);
    mutate(changed);
    assert.throws(() => validateFormalReleaseContract(changed));
  }
});

test("exactly matching Git, Hong Kong, and Sites provenance passes", () => {
  assert.deepEqual(verifyFormalReleaseEvidence(contract, validEvidence()), {
    ok: true,
    commit_sha: SHA,
    errors: [],
  });
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
  assert.equal(verifyFormalReleaseEvidence(contract, unrelated).ok, true);
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
