#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_CONTRACT = resolve(ROOT, "deploy", "formal-release-contract.json");

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
  sharedContentSchema: "fusiondigital.shared-content-v1",
  sharedContentPaths: [
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
  ],
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
    [evidence, ["schemaVersion", "git", "hongKong", "sites", "verification", "sharedContent"], "evidence"],
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
  exact(at(contract, "sharedContent.schema"), FIXED.sharedContentSchema, "sharedContent.schema");
  exactArray(at(contract, "sharedContent.paths"), FIXED.sharedContentPaths, "sharedContent.paths");
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

function verifySharedContent(contract, evidence, errors) {
  requireExact(errors, evidence, "sharedContent.schema", contract.sharedContent.schema);
  const entries = at(evidence, "sharedContent.entries");
  if (!Array.isArray(entries)) {
    errors.push("sharedContent.entries must be an array.");
    return;
  }
  const expectedPaths = contract.sharedContent.paths;
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

function verifyLiveEvidence(contract, evidence, sha, errors) {
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
  verifySharedContent(contract, evidence, errors);
}

export function verifyFormalReleaseEvidence(contract, evidence) {
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
  verifyLiveEvidence(contract, evidence, sha, errors);
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
  const [contract, evidence] = await Promise.all([
    loadFormalReleaseContract(),
    json(evidencePath, "formal release evidence"),
  ]);
  const result = verifyFormalReleaseEvidence(contract, evidence);
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
