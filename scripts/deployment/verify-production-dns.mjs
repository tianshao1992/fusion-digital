#!/usr/bin/env node

import { lookup as systemLookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_CONTRACT_PATH = resolve(
  REPOSITORY_ROOT,
  "deploy",
  "production-contract.json",
);
const REQUIRED_PROBE_PURPOSES = Object.freeze([
  "default",
  "no-ecs",
  "global-fallback",
  "china-generic",
  "china-telecom",
  "china-unicom",
  "china-mobile",
]);
const SYSTEM_RESOLVER = Object.freeze({
  lookup: systemLookup,
});

function normalizeHostname(value) {
  return String(value).trim().toLowerCase().replace(/\.+$/u, "");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function formatValues(values) {
  return values.length > 0 ? values.join(", ") : "<none>";
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertStringArray(value, label, { allowEmpty = true } = {}) {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    const qualifier = allowEmpty ? "" : " non-empty";
    throw new Error(`${label} must be a${qualifier} string array.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
}

function assertCidr(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a CIDR string.`);
  }
  const [address, rawPrefix, extra] = value.split("/");
  const version = isIP(address);
  const prefix = Number(rawPrefix);
  const maximum = version === 4 ? 32 : version === 6 ? 128 : -1;
  if (
    extra !== undefined
    || maximum < 0
    || !Number.isInteger(prefix)
    || prefix < 0
    || prefix > maximum
  ) {
    throw new Error(`${label} must be a valid IPv4 or IPv6 CIDR.`);
  }
}

export function validateProductionContract(contract) {
  assertObject(contract, "Production contract");
  if (contract.schemaVersion !== 1) {
    throw new Error("Production contract schemaVersion must be 1.");
  }
  if (contract.environment !== "production") {
    throw new Error('Production contract environment must be "production".');
  }

  assertObject(contract.deployment, "deployment");
  if (typeof contract.deployment.provider !== "string" || contract.deployment.provider === "") {
    throw new Error("deployment.provider must be a non-empty string.");
  }
  if (typeof contract.deployment.region !== "string" || contract.deployment.region === "") {
    throw new Error("deployment.region must be a non-empty string.");
  }
  if (
    typeof contract.deployment.instanceId !== "string"
    || !/^i-[a-z0-9]+$/u.test(contract.deployment.instanceId)
  ) {
    throw new Error("deployment.instanceId must be a canonical ECS instance ID.");
  }
  assertObject(contract.deployment.publicNetwork, "deployment.publicNetwork");
  if (
    typeof contract.deployment.publicNetwork.product !== "string"
    || contract.deployment.publicNetwork.product === ""
  ) {
    throw new Error("deployment.publicNetwork.product must be a non-empty string.");
  }
  if (
    typeof contract.deployment.publicNetwork.lineType !== "string"
    || contract.deployment.publicNetwork.lineType === ""
  ) {
    throw new Error("deployment.publicNetwork.lineType must be a non-empty string.");
  }
  if (
    !Number.isInteger(contract.deployment.publicNetwork.bandwidthMbps)
    || contract.deployment.publicNetwork.bandwidthMbps < 1
  ) {
    throw new Error("deployment.publicNetwork.bandwidthMbps must be a positive integer.");
  }
  if (isIP(contract.deployment.publicIpv4) !== 4) {
    throw new Error("deployment.publicIpv4 must be an IPv4 address.");
  }

  assertObject(contract.dns, "dns");
  const dns = contract.dns;
  assertStringArray(dns.hostnames, "dns.hostnames", { allowEmpty: false });
  for (const hostname of dns.hostnames) {
    if (hostname !== normalizeHostname(hostname) || !hostname.includes(".")) {
      throw new Error(`dns.hostnames contains a non-canonical hostname: ${hostname}.`);
    }
  }

  assertObject(dns.expectedFinalAddresses, "dns.expectedFinalAddresses");
  assertStringArray(dns.expectedFinalAddresses.A, "dns.expectedFinalAddresses.A", {
    allowEmpty: false,
  });
  assertStringArray(dns.expectedFinalAddresses.AAAA, "dns.expectedFinalAddresses.AAAA");
  for (const address of dns.expectedFinalAddresses.A) {
    if (isIP(address) !== 4) {
      throw new Error(`dns.expectedFinalAddresses.A contains invalid IPv4: ${address}.`);
    }
  }
  for (const address of dns.expectedFinalAddresses.AAAA) {
    if (isIP(address) !== 6) {
      throw new Error(`dns.expectedFinalAddresses.AAAA contains invalid IPv6: ${address}.`);
    }
  }
  if (
    dns.expectedFinalAddresses.A.length !== 1
    || dns.expectedFinalAddresses.A[0] !== contract.deployment.publicIpv4
  ) {
    throw new Error(
      "dns.expectedFinalAddresses.A must contain only deployment.publicIpv4.",
    );
  }

  assertObject(dns.forbiddenTargets, "dns.forbiddenTargets");
  assertStringArray(dns.forbiddenTargets.hostnames, "dns.forbiddenTargets.hostnames");
  assertStringArray(
    dns.forbiddenTargets.hostnameSuffixes,
    "dns.forbiddenTargets.hostnameSuffixes",
  );
  assertStringArray(dns.forbiddenTargets.addresses, "dns.forbiddenTargets.addresses");
  for (const hostname of [
    ...dns.forbiddenTargets.hostnames,
    ...dns.forbiddenTargets.hostnameSuffixes,
  ]) {
    if (hostname !== normalizeHostname(hostname) || !hostname.includes(".")) {
      throw new Error(`dns.forbiddenTargets contains a non-canonical hostname: ${hostname}.`);
    }
  }
  for (const address of dns.forbiddenTargets.addresses) {
    if (isIP(address) === 0) {
      throw new Error(`dns.forbiddenTargets.addresses contains invalid IP: ${address}.`);
    }
  }

  if (!Number.isInteger(dns.maxCnameDepth) || dns.maxCnameDepth < 1 || dns.maxCnameDepth > 32) {
    throw new Error("dns.maxCnameDepth must be an integer from 1 through 32.");
  }
  if (!Number.isInteger(dns.timeoutMs) || dns.timeoutMs < 100 || dns.timeoutMs > 60_000) {
    throw new Error("dns.timeoutMs must be an integer from 100 through 60000.");
  }
  if (!Array.isArray(dns.probes) || dns.probes.length === 0) {
    throw new Error("dns.probes must be a non-empty array.");
  }

  const probeIds = new Set();
  const purposeCounts = new Map();
  for (const [index, probe] of dns.probes.entries()) {
    const label = `dns.probes[${index}]`;
    assertObject(probe, label);
    if (typeof probe.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(probe.id)) {
      throw new Error(`${label}.id must use lowercase letters, numbers, and hyphens.`);
    }
    if (probeIds.has(probe.id)) {
      throw new Error(`dns.probes contains duplicate id: ${probe.id}.`);
    }
    probeIds.add(probe.id);
    purposeCounts.set(probe.purpose, (purposeCounts.get(probe.purpose) ?? 0) + 1);

    if (!REQUIRED_PROBE_PURPOSES.includes(probe.purpose)) {
      throw new Error(`${label}.purpose is not a supported production DNS purpose.`);
    }
    if (probe.transport !== "system" && probe.transport !== "dns-json") {
      throw new Error(`${label}.transport must be "system" or "dns-json".`);
    }
    if ("blocking" in probe && typeof probe.blocking !== "boolean") {
      throw new Error(`${label}.blocking must be a boolean when provided.`);
    }
    if (probe.purpose === "default" && probe.blocking !== false) {
      throw new Error('The "default" system probe must be advisory (blocking=false).');
    }
    if (probe.purpose !== "default" && probe.blocking === false) {
      throw new Error(`The "${probe.purpose}" trusted DNS probe must remain blocking.`);
    }
    if (probe.purpose === "default" && probe.transport !== "system") {
      throw new Error('The "default" probe must use the system resolver.');
    }
    if (probe.purpose !== "default" && probe.transport !== "dns-json") {
      throw new Error(`The "${probe.purpose}" probe must use DNS-over-HTTPS JSON.`);
    }
    if (probe.transport === "dns-json") {
      let resolver;
      try {
        resolver = new URL(probe.resolver);
      } catch {
        throw new Error(`${label}.resolver must be a valid HTTPS URL.`);
      }
      if (
        resolver.protocol !== "https:"
        || resolver.hostname !== "dns.alidns.com"
        || resolver.port !== ""
        || resolver.pathname !== "/resolve"
        || resolver.username !== ""
        || resolver.password !== ""
        || resolver.search !== ""
        || resolver.hash !== ""
      ) {
        throw new Error(`${label}.resolver must be exactly https://dns.alidns.com/resolve.`);
      }
    }
    if (probe.purpose === "no-ecs" && "ednsClientSubnet" in probe) {
      throw new Error('The "no-ecs" probe must omit ednsClientSubnet.');
    }
    if (probe.purpose === "global-fallback" || probe.purpose.startsWith("china-")) {
      assertCidr(probe.ednsClientSubnet, `${label}.ednsClientSubnet`);
    }
  }
  for (const purpose of REQUIRED_PROBE_PURPOSES) {
    if (purposeCounts.get(purpose) !== 1) {
      throw new Error(`dns.probes must contain exactly one "${purpose}" probe.`);
    }
  }

  return contract;
}

export async function loadProductionContract(path = DEFAULT_CONTRACT_PATH) {
  let contract;
  try {
    contract = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read production contract ${path}: ${error.message}`);
  }
  return validateProductionContract(contract);
}

async function queryDnsJson(hostname, recordType, probe, { fetchImpl, timeoutMs }) {
  const url = new URL(probe.resolver);
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", recordType);
  if (probe.ednsClientSubnet) {
    url.searchParams.set("edns_client_subnet", probe.ednsClientSubnet);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`${probe.id} could not query ${recordType} for ${hostname}: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(
      `${probe.id} returned HTTP ${response.status} for ${recordType} ${hostname}.`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`${probe.id} returned invalid DNS JSON for ${hostname}: ${error.message}`);
  }
  if (payload.Status !== 0) {
    throw new Error(
      `${probe.id} returned DNS status ${String(payload.Status)} for ${recordType} ${hostname}.`,
    );
  }
  if (payload.Answer !== undefined && !Array.isArray(payload.Answer)) {
    throw new Error(`${probe.id} returned a malformed Answer for ${recordType} ${hostname}.`);
  }
  return payload.Answer ?? [];
}

function cnameTargetsFor(answers, owner) {
  return uniqueSorted(
    answers
      .filter(
        (answer) => Number(answer?.type) === 5 && normalizeHostname(answer?.name) === owner,
      )
      .map((answer) => normalizeHostname(answer.data)),
  );
}

async function followDnsJsonCnames(hostname, probe, options) {
  const trail = [];
  const seen = new Set([hostname]);
  let current = hostname;

  for (let depth = 0; depth <= options.maxCnameDepth; depth += 1) {
    const answers = await queryDnsJson(current, "CNAME", probe, options);
    const targets = cnameTargetsFor(answers, current);
    if (targets.length === 0) {
      return { finalName: current, trail };
    }
    if (targets.length !== 1) {
      throw new Error(`${current} returned multiple CNAME targets: ${targets.join(", ")}.`);
    }
    if (depth === options.maxCnameDepth) {
      throw new Error(`${hostname} exceeds the CNAME depth limit (${options.maxCnameDepth}).`);
    }
    const target = targets[0];
    if (seen.has(target)) {
      throw new Error(`${hostname} contains a CNAME loop at ${target}.`);
    }
    trail.push({ owner: current, target });
    seen.add(target);
    current = target;
  }

  throw new Error(`${hostname} could not complete DNS JSON CNAME resolution.`);
}

function addressesFromAnswers(answers, recordType, hostname) {
  const numericType = recordType === "A" ? 1 : 28;
  const version = recordType === "A" ? 4 : 6;
  const addresses = answers
    .filter(
      (answer) => Number(answer?.type) === numericType
        && normalizeHostname(answer?.name) === normalizeHostname(hostname),
    )
    .map((answer) => String(answer.data).trim());
  for (const address of addresses) {
    if (isIP(address) !== version) {
      throw new Error(`${hostname} returned invalid ${recordType} data: ${address}.`);
    }
  }
  return uniqueSorted(addresses);
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () => rejectPromise(new Error(`${label} timed out after ${timeoutMs} ms.`)),
      timeoutMs,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

async function resolveHostname(hostname, probe, options) {
  if (probe.transport === "system") {
    const records = await withTimeout(
      options.systemResolver.lookup(hostname, {
        all: true,
        verbatim: true,
      }),
      options.timeoutMs,
      `${probe.id} system lookup for ${hostname}`,
    );
    const ipv4 = records
      .filter(({ family }) => Number(family) === 4)
      .map(({ address }) => address);
    const ipv6 = records
      .filter(({ family }) => Number(family) === 6)
      .map(({ address }) => address);
    return {
      finalName: hostname,
      trail: [],
      addresses: {
        A: uniqueSorted(ipv4.map(String)),
        AAAA: uniqueSorted(ipv6.map(String)),
      },
    };
  }

  const { finalName, trail } = await followDnsJsonCnames(hostname, probe, options);
  const [ipv4Answers, ipv6Answers] = await Promise.all([
    queryDnsJson(finalName, "A", probe, options),
    queryDnsJson(finalName, "AAAA", probe, options),
  ]);
  return {
    finalName,
    trail,
    addresses: {
      A: addressesFromAnswers(ipv4Answers, "A", finalName),
      AAAA: addressesFromAnswers(ipv6Answers, "AAAA", finalName),
    },
  };
}

function setsMatch(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function hostnameIsForbidden(hostname, forbiddenTargets) {
  const normalized = normalizeHostname(hostname);
  if (forbiddenTargets.hostnames.includes(normalized)) {
    return true;
  }
  return forbiddenTargets.hostnameSuffixes.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function evaluateResolution(resolution, dns) {
  const errors = [];
  const names = uniqueSorted([
    resolution.finalName,
    ...resolution.trail.flatMap(({ owner, target }) => [owner, target]),
  ]);
  const forbiddenNames = names.filter((name) => hostnameIsForbidden(name, dns.forbiddenTargets));
  if (forbiddenNames.length > 0) {
    errors.push(`forbidden DNS target(s): ${forbiddenNames.join(", ")}`);
  }

  const allAddresses = [...resolution.addresses.A, ...resolution.addresses.AAAA];
  const forbiddenAddresses = allAddresses.filter((address) =>
    dns.forbiddenTargets.addresses.includes(address));
  if (forbiddenAddresses.length > 0) {
    errors.push(`forbidden address(es): ${forbiddenAddresses.join(", ")}`);
  }

  for (const recordType of ["A", "AAAA"]) {
    const actual = uniqueSorted(resolution.addresses[recordType]);
    const expected = uniqueSorted(dns.expectedFinalAddresses[recordType]);
    if (!setsMatch(actual, expected)) {
      errors.push(
        `${recordType} expected ${formatValues(expected)} but observed ${formatValues(actual)}`,
      );
    }
  }
  return errors;
}

export async function verifyProductionDns(
  contract,
  {
    fetchImpl = globalThis.fetch,
    systemResolver = SYSTEM_RESOLVER,
  } = {},
) {
  validateProductionContract(contract);
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for DNS JSON probes.");
  }
  for (const method of ["lookup"]) {
    if (typeof systemResolver?.[method] !== "function") {
      throw new Error(`systemResolver.${method} must be a function.`);
    }
  }

  const options = {
    fetchImpl,
    maxCnameDepth: contract.dns.maxCnameDepth,
    systemResolver,
    timeoutMs: contract.dns.timeoutMs,
  };
  const pending = contract.dns.hostnames.flatMap((hostname) =>
    contract.dns.probes.map(async (probe) => {
      try {
        const resolution = await resolveHostname(hostname, probe, options);
        const errors = evaluateResolution(resolution, contract.dns);
        return {
          hostname,
          probe: probe.id,
          purpose: probe.purpose,
          blocking: probe.blocking !== false,
          ok: errors.length === 0,
          ...resolution,
          errors,
        };
      } catch (error) {
        return {
          hostname,
          probe: probe.id,
          purpose: probe.purpose,
          blocking: probe.blocking !== false,
          ok: false,
          errors: [error.message],
        };
      }
    }),
  );
  const checks = await Promise.all(pending);
  const failures = checks.filter((check) => check.blocking && !check.ok);
  const warnings = checks.filter((check) => !check.blocking && !check.ok);
  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    deployment: contract.deployment,
    checks,
    failures,
    warnings,
  };
}

function parseArguments(args) {
  const options = { contractPath: DEFAULT_CONTRACT_PATH, json: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--contract") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--contract requires a path.");
      }
      options.contractPath = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}.`);
    }
  }
  return options;
}

function printHumanReport(report, contractPath) {
  console.log(`Production DNS contract: ${contractPath}`);
  for (const check of report.checks) {
    if (check.ok) {
      console.log(
        `PASS ${check.hostname} [${check.probe}] A=${formatValues(check.addresses.A)} AAAA=${formatValues(check.addresses.AAAA)}`,
      );
    } else if (!check.blocking) {
      console.warn(`WARN ${check.hostname} [${check.probe}] ${check.errors.join("; ")}`);
    } else {
      console.error(`FAIL ${check.hostname} [${check.probe}] ${check.errors.join("; ")}`);
    }
  }
  const requiredChecks = report.checks.filter((check) => check.blocking);
  const summary = `${requiredChecks.length - report.failures.length}/${requiredChecks.length} required checks passed`;
  if (report.ok) {
    console.log(
      `Production DNS verification passed: ${summary}; ${report.warnings.length} advisory warning(s).`,
    );
  } else {
    console.error(`Production DNS verification failed: ${summary}.`);
  }
}

async function main(args) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(
      "Usage: node scripts/deployment/verify-production-dns.mjs [--contract PATH] [--json]",
    );
    return;
  }

  const contract = await loadProductionContract(options.contractPath);
  const report = await verifyProductionDns(contract);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, options.contractPath);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`Production DNS verification aborted: ${error.message}`);
    process.exitCode = 1;
  }
}
