#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_CONTRACT_PATH = resolve(
  REPOSITORY_ROOT,
  "deploy",
  "formal-release-contract.json",
);

const EXPECTED_CONTRACT = Object.freeze({
  commitShaPattern: "^[0-9a-f]{40}$",
  localRef: "HEAD",
  codeupBranch: "master",
  githubBranch: "main",
  hongKongReleaseRoot: "/srv/fusiondigital/releases",
  hongKongStatus: "active",
  hongKongBuildTarget: "aliyun-hk",
  hongKongMode: "public-anonymous",
  sitesProjectId: "appgprj_6a78141f72588191a3b12afd0ad56022",
  sitesPlatformUrl: "https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site",
  sitesStatus: "succeeded",
  sitesBuildTarget: "sites",
  forbiddenSitesCustomDomains: Object.freeze([
    "fusiondigital.club",
    "www.fusiondigital.club",
  ]),
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueAt(value, path) {
  return path.split(".").reduce(
    (current, key) => (isObject(current) ? current[key] : undefined),
    value,
  );
}

function canonicalHostname(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\.+$/u, "")
    : "";
}

function assertExact(value, expected, label) {
  if (value !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

function assertExactStringArray(value, expected, label) {
  if (
    !Array.isArray(value)
    || value.length !== expected.length
    || value.some((item, index) => item !== expected[index])
  ) {
    throw new Error(`${label} does not match the fixed formal-release policy.`);
  }
}

function assertPlatformUrl(value, label) {
  assertExact(value, EXPECTED_CONTRACT.sitesPlatformUrl, label);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (
    url.protocol !== "https:"
    || !url.hostname.endsWith(".chatgpt.site")
    || url.hostname === "chatgpt.site"
    || url.username !== ""
    || url.password !== ""
    || url.port !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new Error(`${label} must be the fixed HTTPS chatgpt.site platform URL.`);
  }
}

export function validateFormalReleaseContract(contract) {
  if (!isObject(contract)) {
    throw new Error("Formal release contract must be an object.");
  }
  assertExact(contract.schemaVersion, 1, "schemaVersion");
  assertExact(contract.environment, "formal-release", "environment");
  assertExact(
    contract.commitShaPattern,
    EXPECTED_CONTRACT.commitShaPattern,
    "commitShaPattern",
  );
  assertExact(valueAt(contract, "git.local.ref"), EXPECTED_CONTRACT.localRef, "git.local.ref");
  assertExact(
    valueAt(contract, "git.codeup.branch"),
    EXPECTED_CONTRACT.codeupBranch,
    "git.codeup.branch",
  );
  assertExact(
    valueAt(contract, "git.github.branch"),
    EXPECTED_CONTRACT.githubBranch,
    "git.github.branch",
  );
  assertExact(
    valueAt(contract, "hongKong.releaseRoot"),
    EXPECTED_CONTRACT.hongKongReleaseRoot,
    "hongKong.releaseRoot",
  );
  assertExact(
    valueAt(contract, "hongKong.requiredStatus"),
    EXPECTED_CONTRACT.hongKongStatus,
    "hongKong.requiredStatus",
  );
  assertExact(
    valueAt(contract, "hongKong.build.target"),
    EXPECTED_CONTRACT.hongKongBuildTarget,
    "hongKong.build.target",
  );
  assertExact(
    valueAt(contract, "hongKong.build.mode"),
    EXPECTED_CONTRACT.hongKongMode,
    "hongKong.build.mode",
  );
  assertExact(
    valueAt(contract, "sites.projectId"),
    EXPECTED_CONTRACT.sitesProjectId,
    "sites.projectId",
  );
  assertPlatformUrl(valueAt(contract, "sites.platformUrl"), "sites.platformUrl");
  assertExact(
    valueAt(contract, "sites.requiredStatus"),
    EXPECTED_CONTRACT.sitesStatus,
    "sites.requiredStatus",
  );
  assertExact(
    valueAt(contract, "sites.build.target"),
    EXPECTED_CONTRACT.sitesBuildTarget,
    "sites.build.target",
  );
  assertExactStringArray(
    contract.forbiddenSitesCustomDomains,
    EXPECTED_CONTRACT.forbiddenSitesCustomDomains,
    "forbiddenSitesCustomDomains",
  );
  return contract;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} JSON at ${path}: ${error.message}`);
  }
}

export async function loadFormalReleaseContract(path = DEFAULT_CONTRACT_PATH) {
  return validateFormalReleaseContract(await readJson(path, "formal release contract"));
}

function addRequiredExactCheck(errors, evidence, path, expected) {
  const value = valueAt(evidence, path);
  if (value === undefined || value === null || value === "") {
    errors.push(`${path} is required.`);
  } else if (value !== expected) {
    errors.push(`${path} does not match the formal release contract.`);
  }
}

function collectCommitShas(contract, evidence, errors) {
  const pattern = new RegExp(contract.commitShaPattern, "u");
  const paths = [
    "git.local.commit_sha",
    "git.codeup.commit_sha",
    "git.github.commit_sha",
    "hongKong.release.commit_sha",
    "sites.source.commit_sha",
  ];
  const entries = paths.map((path) => ({ path, value: valueAt(evidence, path) }));

  for (const { path, value } of entries) {
    if (typeof value !== "string" || !pattern.test(value)) {
      errors.push(`${path} must be a full lowercase 40-character Git SHA.`);
    }
  }

  const validEntries = entries.filter(
    ({ value }) => typeof value === "string" && pattern.test(value),
  );
  const expectedSha = validEntries.find(({ path }) => path === "git.local.commit_sha")?.value;
  if (expectedSha) {
    for (const { path, value } of validEntries) {
      if (value !== expectedSha) {
        errors.push(`${path} does not match git.local.commit_sha.`);
      }
    }
  }

  return expectedSha;
}

function checkHongKongRelease(contract, evidence, expectedSha, errors) {
  addRequiredExactCheck(
    errors,
    evidence,
    "hongKong.release.status",
    contract.hongKong.requiredStatus,
  );
  addRequiredExactCheck(
    errors,
    evidence,
    "hongKong.build.target",
    contract.hongKong.build.target,
  );
  addRequiredExactCheck(
    errors,
    evidence,
    "hongKong.build.mode",
    contract.hongKong.build.mode,
  );

  const path = valueAt(evidence, "hongKong.release.path");
  if (typeof path !== "string" || path === "") {
    errors.push("hongKong.release.path is required.");
  } else if (expectedSha) {
    const expectedPath = `${contract.hongKong.releaseRoot}/${expectedSha}`;
    if (path !== expectedPath) {
      errors.push(
        "hongKong.release.path must be the active /srv/fusiondigital/releases/<sha> path.",
      );
    }
  }
}

function checkSitesCustomDomains(contract, evidence, errors) {
  const customDomains = valueAt(evidence, "sites.custom_domains");
  if (!Array.isArray(customDomains)) {
    errors.push("sites.custom_domains must be an array, including an empty array when none exist.");
    return;
  }

  const forbidden = new Set(contract.forbiddenSitesCustomDomains);
  customDomains.forEach((entry, index) => {
    const label = `sites.custom_domains[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    const hostname = canonicalHostname(entry.hostname);
    if (!hostname || entry.hostname !== hostname || !hostname.includes(".")) {
      errors.push(`${label}.hostname must be a canonical hostname.`);
    } else if (forbidden.has(hostname)) {
      errors.push(`${label}.hostname must not bind a production domain to OpenAI Sites.`);
    }
    if (typeof entry.status !== "string" || entry.status.trim() === "") {
      errors.push(`${label}.status must be a non-empty string.`);
    }
  });
}

export function verifyFormalReleaseEvidence(contract, evidence) {
  validateFormalReleaseContract(contract);
  const errors = [];
  if (!isObject(evidence)) {
    return {
      ok: false,
      commit_sha: null,
      errors: ["Formal release evidence must be an object."],
    };
  }
  if (evidence.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  const expectedSha = collectCommitShas(contract, evidence, errors);
  addRequiredExactCheck(errors, evidence, "git.local.ref", contract.git.local.ref);
  addRequiredExactCheck(errors, evidence, "git.codeup.branch", contract.git.codeup.branch);
  addRequiredExactCheck(errors, evidence, "git.github.branch", contract.git.github.branch);
  checkHongKongRelease(contract, evidence, expectedSha, errors);
  addRequiredExactCheck(errors, evidence, "sites.project_id", contract.sites.projectId);
  addRequiredExactCheck(
    errors,
    evidence,
    "sites.deployment.status",
    contract.sites.requiredStatus,
  );
  addRequiredExactCheck(errors, evidence, "sites.deployment.url", contract.sites.platformUrl);
  addRequiredExactCheck(errors, evidence, "sites.build.target", contract.sites.build.target);
  checkSitesCustomDomains(contract, evidence, errors);

  return {
    ok: errors.length === 0,
    commit_sha: errors.length === 0 ? expectedSha : null,
    errors,
  };
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--evidence" || !argv[1]) {
    throw new Error("Usage: npm run release:verify-pair -- --evidence PATH");
  }
  return resolve(process.cwd(), argv[1]);
}

async function main() {
  const evidencePath = parseArguments(process.argv.slice(2));
  const [contract, evidence] = await Promise.all([
    loadFormalReleaseContract(),
    readJson(evidencePath, "formal release evidence"),
  ]);
  const report = verifyFormalReleaseEvidence(contract, evidence);
  if (!report.ok) {
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
    throw new Error(`Formal release evidence failed ${report.errors.length} check(s).`);
  }
  console.log(`Formal release pair verified at ${report.commit_sha}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`Formal release verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
