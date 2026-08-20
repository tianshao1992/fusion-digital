import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadFormalReleaseContract,
  validateFormalReleaseContract,
  verifyFormalReleaseEvidence,
} from "../scripts/deployment/verify-formal-release.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = join(ROOT, "deploy", "formal-release-contract.json");
const SCRIPT_PATH = join(ROOT, "scripts", "deployment", "verify-formal-release.mjs");
const SHA = "a2973cdce3d7dc69bbe3b53737fcfab4f516d26e";
const OTHER_SHA = "b2973cdce3d7dc69bbe3b53737fcfab4f516d26e";
const SITES_PROJECT_ID = "appgprj_6a78141f72588191a3b12afd0ad56022";
const SITES_URL = "https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site";

let contract;
let temporaryDirectory;

function validEvidence() {
  return {
    schemaVersion: 1,
    git: {
      local: { ref: "HEAD", commit_sha: SHA },
      codeup: { branch: "master", commit_sha: SHA },
      github: { branch: "main", commit_sha: SHA },
    },
    hongKong: {
      release: {
        status: "active",
        path: `/srv/fusiondigital/releases/${SHA}`,
        commit_sha: SHA,
      },
      build: { target: "aliyun-hk", mode: "public-anonymous" },
    },
    sites: {
      project_id: SITES_PROJECT_ID,
      source: { commit_sha: SHA },
      deployment: { status: "succeeded", url: SITES_URL },
      build: { target: "sites" },
      custom_domains: [],
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

function assertFailure(evidence, pattern) {
  const report = verifyFormalReleaseEvidence(contract, evidence);
  assert.equal(report.ok, false);
  assert.equal(report.commit_sha, null);
  assert.match(report.errors.join("\n"), pattern);
}

before(async () => {
  contract = await loadFormalReleaseContract(CONTRACT_PATH);
  temporaryDirectory = await mkdtemp(join(tmpdir(), "fusiondigital-formal-release-"));
});

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("checked-in contract pins the two repositories and both deployment targets", async () => {
  assert.equal(contract.git.local.ref, "HEAD");
  assert.equal(contract.git.codeup.branch, "master");
  assert.equal(contract.git.github.branch, "main");
  assert.equal(contract.hongKong.releaseRoot, "/srv/fusiondigital/releases");
  assert.deepEqual(contract.hongKong.build, {
    target: "aliyun-hk",
    mode: "public-anonymous",
  });
  assert.equal(contract.sites.projectId, SITES_PROJECT_ID);
  assert.equal(contract.sites.platformUrl, SITES_URL);
  assert.equal(contract.sites.requiredStatus, "succeeded");
  assert.equal(contract.sites.build.target, "sites");
  assert.deepEqual(contract.forbiddenSitesCustomDomains, [
    "fusiondigital.club",
    "www.fusiondigital.club",
  ]);

  const raw = await readFile(CONTRACT_PATH, "utf8");
  assert.doesNotMatch(raw, /password|private[_-]?key|access[_-]?token|cookie/iu);
});

test("contract validation rejects changes to fixed Sites identity", () => {
  const changedProject = clone(contract);
  changedProject.sites.projectId = "appgprj_changed";
  assert.throws(
    () => validateFormalReleaseContract(changedProject),
    /sites\.projectId/u,
  );

  const changedUrl = clone(contract);
  changedUrl.sites.platformUrl = "https://different.chatgpt.site";
  assert.throws(
    () => validateFormalReleaseContract(changedUrl),
    /sites\.platformUrl/u,
  );
});

test("matching Git and deployment provenance passes", () => {
  const report = verifyFormalReleaseEvidence(contract, validEvidence());
  assert.deepEqual(report, { ok: true, commit_sha: SHA, errors: [] });
});

test("an unrelated pending Sites domain does not block the release", () => {
  const evidence = validEvidence();
  evidence.sites.custom_domains.push({
    hostname: "preview.example.org",
    status: "pending",
  });
  const report = verifyFormalReleaseEvidence(contract, evidence);
  assert.equal(report.ok, true);
});

test("missing evidence fields fail closed", () => {
  const evidence = validEvidence();
  delete evidence.git.github.commit_sha;
  delete evidence.sites.custom_domains;
  assertFailure(evidence, /git\.github\.commit_sha must be/u);
  assertFailure(evidence, /sites\.custom_domains must be an array/u);
});

test("malformed and divergent SHAs fail for every provenance source", () => {
  for (const mutate of [
    (evidence) => { evidence.git.local.commit_sha = "a2973cd"; },
    (evidence) => { evidence.git.codeup.commit_sha = OTHER_SHA; },
    (evidence) => { evidence.git.github.commit_sha = OTHER_SHA; },
    (evidence) => { evidence.hongKong.release.commit_sha = OTHER_SHA; },
    (evidence) => { evidence.sites.source.commit_sha = OTHER_SHA; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    assertFailure(evidence, /40-character Git SHA|does not match git\.local\.commit_sha/u);
  }
});

test("repository refs and branches cannot drift", () => {
  for (const [path, value] of [
    [["git", "local", "ref"], "main"],
    [["git", "codeup", "branch"], "develop"],
    [["git", "github", "branch"], "master"],
  ]) {
    const evidence = validEvidence();
    evidence[path[0]][path[1]][path[2]] = value;
    assertFailure(evidence, /does not match the formal release contract/u);
  }
});

test("Hong Kong release path, active state, target, and anonymous mode are mandatory", () => {
  const cases = [
    [(evidence) => { evidence.hongKong.release.path = `/tmp/${SHA}`; }, /release\.path/u],
    [(evidence) => { evidence.hongKong.release.status = "installed"; }, /release\.status/u],
    [(evidence) => { evidence.hongKong.build.target = "sites"; }, /build\.target/u],
    [(evidence) => { evidence.hongKong.build.mode = "authenticated"; }, /build\.mode/u],
  ];
  for (const [mutate, pattern] of cases) {
    const evidence = validEvidence();
    mutate(evidence);
    assertFailure(evidence, pattern);
  }
});

test("Sites project, successful status, exact URL, and build target are mandatory", () => {
  const cases = [
    [(evidence) => { evidence.sites.project_id = "appgprj_other"; }, /project_id/u],
    [(evidence) => { evidence.sites.deployment.status = "pending"; }, /deployment\.status/u],
    [(evidence) => { evidence.sites.deployment.url = `${SITES_URL}/`; }, /deployment\.url/u],
    [(evidence) => { evidence.sites.build.target = "aliyun-hk"; }, /build\.target/u],
  ];
  for (const [mutate, pattern] of cases) {
    const evidence = validEvidence();
    mutate(evidence);
    assertFailure(evidence, pattern);
  }
});

test("production domains may not appear in Sites custom-domain evidence", () => {
  for (const hostname of ["fusiondigital.club", "www.fusiondigital.club"]) {
    const evidence = validEvidence();
    evidence.sites.custom_domains.push({ hostname, status: "pending" });
    assertFailure(evidence, /must not bind a production domain/u);
  }
});

test("CLI succeeds for valid JSON and exits nonzero for missing or drifted evidence", async () => {
  const validPath = join(temporaryDirectory, "valid.json");
  const driftedPath = join(temporaryDirectory, "drifted.json");
  const drifted = validEvidence();
  drifted.sites.source.commit_sha = OTHER_SHA;
  await Promise.all([
    writeFile(validPath, `${JSON.stringify(validEvidence())}\n`, "utf8"),
    writeFile(driftedPath, `${JSON.stringify(drifted)}\n`, "utf8"),
  ]);

  const successful = spawnSync(process.execPath, [SCRIPT_PATH, "--evidence", validPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(successful.status, 0, successful.stderr);
  assert.match(successful.stdout, new RegExp(SHA, "u"));

  const missing = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--evidence", join(temporaryDirectory, "missing.json")],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Could not read formal release evidence JSON/u);

  const failed = spawnSync(process.execPath, [SCRIPT_PATH, "--evidence", driftedPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /does not match git\.local\.commit_sha/u);
});
