import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadProductionContract,
  validateProductionContract,
  verifyProductionDns,
} from "../scripts/deployment/verify-production-dns.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = join(ROOT, "deploy", "production-contract.json");
const PRODUCTION_IP = "47.75.119.239";
const LEGACY_HONG_KONG_IP = "47.82.66.79";
const CLOUDFLARE_IP = "172.66.3.26";

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function clone(value) {
  return structuredClone(value);
}

function createSystemResolver({ ipv4 = [PRODUCTION_IP], ipv6 = [] } = {}) {
  return {
    async lookup() {
      return [
        ...ipv4.map((address) => ({ address, family: 4 })),
        ...ipv6.map((address) => ({ address, family: 6 })),
      ];
    },
  };
}

function answer(name, type, data) {
  return { name: `${name}.`, type, TTL: 600, data };
}

function createDnsJsonFetch(responder, requests = []) {
  return async (input) => {
    const url = new URL(input);
    const request = {
      name: url.searchParams.get("name"),
      type: url.searchParams.get("type"),
      ednsClientSubnet: url.searchParams.get("edns_client_subnet"),
    };
    requests.push(request);
    const response = responder(request);
    return new Response(
      JSON.stringify({ Status: response.status ?? 0, Answer: response.answers ?? [] }),
      { status: response.httpStatus ?? 200, headers: { "content-type": "application/dns-json" } },
    );
  };
}

function healthyResponder({ name, type }) {
  if (type === "A") {
    return { answers: [answer(name, 1, PRODUCTION_IP)] };
  }
  return { answers: [] };
}

test("checked-in contract pins both production names to the Aliyun Hong Kong IPv4", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);

  assert.deepEqual(contract.dns.hostnames, [
    "fusiondigital.club",
    "www.fusiondigital.club",
  ]);
  assert.equal(contract.deployment.provider, "aliyun-ecs");
  assert.equal(contract.deployment.region, "cn-hongkong");
  assert.equal(contract.deployment.instanceId, "i-j6c5xpt6lvn9fdpujlt7");
  assert.deepEqual(contract.deployment.publicNetwork, {
    product: "aliyun-eip",
    eipId: "eip-j6cn8zd1yjdjqta887j7f",
    lineType: "BGP_PRO",
    bandwidthMbps: 100,
  });
  assert.equal(contract.deployment.publicIpv4, PRODUCTION_IP);
  assert.deepEqual(contract.dns.expectedFinalAddresses, {
    A: [PRODUCTION_IP],
    AAAA: [],
  });
  assert.ok(contract.dns.forbiddenTargets.hostnames.includes("custom-domains.chatgpt.site"));
  assert.ok(contract.dns.forbiddenTargets.hostnameSuffixes.includes("chatgpt.site"));
  assert.ok(contract.dns.forbiddenTargets.addresses.includes(LEGACY_HONG_KONG_IP));
  assert.ok(contract.dns.forbiddenTargets.addresses.includes("162.159.143.30"));
  assert.ok(contract.dns.forbiddenTargets.addresses.includes(CLOUDFLARE_IP));
  assert.equal(
    contract.dns.probes.find(({ purpose }) => purpose === "global-fallback")
      .ednsClientSubnet,
    "8.8.8.0/24",
  );
  assert.equal(
    contract.dns.probes.find(({ purpose }) => purpose === "default").blocking,
    false,
  );
  assert.deepEqual(
    contract.dns.probes.map(({ purpose }) => purpose).sort(),
    [
      "china-generic",
      "china-mobile",
      "china-telecom",
      "china-unicom",
      "default",
      "global-fallback",
      "no-ecs",
    ],
  );
});

test("production releases keep Sites as an independent preview without changing production DNS", async () => {
  const [agentsRaw, releaseRaw, hostingRaw] = await Promise.all([
    readFile(join(ROOT, "AGENTS.md"), "utf8"),
    readFile(join(ROOT, "docs", "RELEASE.md"), "utf8"),
    readFile(join(ROOT, ".openai", "hosting.json"), "utf8"),
  ]);
  const agents = normalizeWhitespace(agentsRaw);
  const release = normalizeWhitespace(releaseRaw);

  assert.match(agents, /只有用户明确要求生成预览时，才能发布 Sites 平台地址/u);
  assert.match(release, /Sites 预览是独立、非阻塞步骤/u);
  assert.match(release, /DNS-01 预签与安装/u);
  assert.match(release, /维护窗口[^。]{0,160}HTTP-01/u);
  assert.match(release, /一次性人工 DNS-01[\s\S]*?certbot reconfigure/u);
  assert.match(release, /certbot renew --dry-run/u);
  assert.match(release, /不能宣布发布完成/u);
  assert.ok(releaseRaw.indexOf("DNS-01 预签与安装") < releaseRaw.indexOf("DNS 切换与硬门禁"));

  const hosting = JSON.parse(hostingRaw);
  assert.deepEqual(Object.keys(hosting).sort(), ["d1", "project_id", "r2"]);
  assert.doesNotMatch(hostingRaw, /fusiondigital\.club|custom-domains\.chatgpt\.site/u);
});

test("verification passes every hostname through default, no-ECS, global, and carrier probes", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const requests = [];
  const report = await verifyProductionDns(contract, {
    fetchImpl: createDnsJsonFetch(healthyResponder, requests),
    systemResolver: createSystemResolver(),
  });

  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 14);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.equal(requests.length, 36);
  assert.equal(
    requests.filter(({ ednsClientSubnet }) => ednsClientSubnet === null).length,
    6,
  );
  for (const subnet of [
    "8.8.8.0/24",
    "202.112.0.1/24",
    "1.80.0.1/24",
    "111.161.0.1/24",
    "120.192.0.1/24",
  ]) {
    assert.equal(
      requests.filter(({ ednsClientSubnet }) => ednsClientSubnet === subnet).length,
      6,
    );
  }
});

test("verification rejects the Sites CNAME and Cloudflare address", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const sitesTarget = "custom-domains.chatgpt.site";
  const fetchImpl = createDnsJsonFetch(({ name, type }) => {
    if (type === "CNAME" && name !== sitesTarget) {
      return { answers: [answer(name, 5, `${sitesTarget}.`)] };
    }
    if (type === "A") {
      return { answers: [answer(name, 1, CLOUDFLARE_IP)] };
    }
    return { answers: [] };
  });
  const report = await verifyProductionDns(contract, {
    fetchImpl,
    systemResolver: createSystemResolver(),
  });

  assert.equal(report.ok, false);
  assert.equal(report.failures.length, 12);
  for (const failure of report.failures) {
    assert.notEqual(failure.purpose, "default");
    assert.match(failure.errors.join("; "), /forbidden DNS target.*custom-domains\.chatgpt\.site/u);
    assert.match(failure.errors.join("; "), /forbidden address.*172\.66\.3\.26/u);
    assert.match(failure.errors.join("; "), /A expected 47\.75\.119\.239/u);
  }
});

test("verification rejects every trusted view of the legacy Hong Kong light-server IP", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const report = await verifyProductionDns(contract, {
    fetchImpl: createDnsJsonFetch(({ name, type }) => {
      if (type === "A") {
        return { answers: [answer(name, 1, LEGACY_HONG_KONG_IP)] };
      }
      return { answers: [] };
    }),
    systemResolver: createSystemResolver(),
  });

  assert.equal(report.ok, false);
  assert.equal(report.failures.length, 12);
  assert.ok(report.failures.every(({ errors }) =>
    errors.some((message) => message.includes(`forbidden address(es): ${LEGACY_HONG_KONG_IP}`))));
  assert.ok(report.failures.every(({ errors }) =>
    errors.some((message) => message.includes(`A expected ${PRODUCTION_IP}`))));
});

test("one divergent China Mobile view fails without hiding the passing views", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const fetchImpl = createDnsJsonFetch(({ name, type, ednsClientSubnet }) => {
    if (type === "A") {
      const address = ednsClientSubnet === "120.192.0.1/24" ? "203.0.113.8" : PRODUCTION_IP;
      return { answers: [answer(name, 1, address)] };
    }
    return { answers: [] };
  });
  const report = await verifyProductionDns(contract, {
    fetchImpl,
    systemResolver: createSystemResolver(),
  });

  assert.equal(report.ok, false);
  assert.equal(report.failures.length, 2);
  assert.ok(report.failures.every(({ purpose }) => purpose === "china-mobile"));
  assert.ok(report.failures.every(({ errors }) =>
    errors.some((message) => message.includes("observed 203.0.113.8"))));
  assert.equal(report.checks.filter(({ ok }) => ok).length, 12);
});

test("global fallback detects an overseas route that still points to Cloudflare", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const fetchImpl = createDnsJsonFetch(({ name, type, ednsClientSubnet }) => {
    if (type === "A") {
      const address = ednsClientSubnet === "8.8.8.0/24" ? CLOUDFLARE_IP : PRODUCTION_IP;
      return { answers: [answer(name, 1, address)] };
    }
    return { answers: [] };
  });
  const report = await verifyProductionDns(contract, {
    fetchImpl,
    systemResolver: createSystemResolver(),
  });

  assert.equal(report.ok, false);
  assert.equal(report.failures.length, 2);
  assert.ok(report.failures.every(({ purpose }) => purpose === "global-fallback"));
  assert.ok(report.failures.every(({ errors }) =>
    errors.some((message) => message.includes("forbidden address(es): 172.66.3.26"))));
});

test("unexpected IPv6 is rejected even when IPv4 is correct", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const report = await verifyProductionDns(contract, {
    fetchImpl: createDnsJsonFetch(({ name, type }) => {
      if (type === "A") {
        return { answers: [answer(name, 1, PRODUCTION_IP)] };
      }
      if (type === "AAAA") {
        return { answers: [answer(name, 28, "2001:db8::79")] };
      }
      return { answers: [] };
    }),
    systemResolver: createSystemResolver({ ipv6: ["2001:db8::79"] }),
  });

  assert.equal(report.ok, false);
  assert.equal(report.failures.length, 12);
  assert.equal(report.warnings.length, 2);
  assert.ok(report.failures.every(({ errors }) =>
    errors.some((message) => message.includes("AAAA expected <none>"))));
});

test("system resolver drift is advisory while trusted DoH probes remain healthy", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const report = await verifyProductionDns(contract, {
    fetchImpl: createDnsJsonFetch(healthyResponder),
    systemResolver: createSystemResolver({ ipv4: ["198.18.0.77"] }),
  });

  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 2);
  assert.ok(report.warnings.every(({ purpose }) => purpose === "default"));
  assert.ok(report.warnings.every(({ blocking }) => blocking === false));
});

test("a stalled system resolver times out as advisory instead of hanging the hard gate", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  contract.dns.timeoutMs = 100;
  const report = await verifyProductionDns(contract, {
    fetchImpl: createDnsJsonFetch(healthyResponder),
    systemResolver: {
      lookup() {
        return new Promise(() => {});
      },
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 2);
  assert.ok(report.warnings.every(({ errors }) =>
    errors.some((message) => message.includes("timed out after 100 ms"))));
});

test("unrelated DNS answer owners cannot satisfy the production address contract", async () => {
  const contract = await loadProductionContract(CONTRACT_PATH);
  const report = await verifyProductionDns(contract, {
    fetchImpl: createDnsJsonFetch(({ type }) => {
      if (type === "A") {
        return { answers: [answer("unrelated.example", 1, PRODUCTION_IP)] };
      }
      return { answers: [] };
    }),
    systemResolver: createSystemResolver(),
  });

  assert.equal(report.ok, false);
  assert.equal(report.failures.length, 12);
  assert.ok(report.failures.every(({ errors }) =>
    errors.some((message) => message.includes("observed <none>"))));
});

test("contract validation prevents removing a required route class", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  contract.dns.probes = contract.dns.probes.filter(({ purpose }) => purpose !== "china-unicom");

  assert.throws(
    () => validateProductionContract(contract),
    /exactly one "china-unicom" probe/u,
  );
});

test("contract validation requires a canonical EIP identifier", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  contract.deployment.publicNetwork.eipId = "legacy-public-ip";

  assert.throws(
    () => validateProductionContract(contract),
    /publicNetwork\.eipId must be a canonical EIP ID/u,
  );
});

test("contract validation requires the global fallback route", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  contract.dns.probes = contract.dns.probes.filter(
    ({ purpose }) => purpose !== "global-fallback",
  );

  assert.throws(
    () => validateProductionContract(contract),
    /exactly one "global-fallback" probe/u,
  );
});

test("contract validation prevents weakening the no-ECS probe", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  const noEcs = contract.dns.probes.find(({ purpose }) => purpose === "no-ecs");
  noEcs.ednsClientSubnet = "0.0.0.0/0";

  assert.throws(
    () => validateProductionContract(contract),
    /must omit ednsClientSubnet/u,
  );
});

test("contract validation prevents downgrading a trusted DNS probe to advisory", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  const globalFallback = contract.dns.probes.find(
    ({ purpose }) => purpose === "global-fallback",
  );
  globalFallback.blocking = false;

  assert.throws(
    () => validateProductionContract(contract),
    /trusted DNS probe must remain blocking/u,
  );
});

test("contract validation keeps the local system resolver advisory", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  const systemDefault = contract.dns.probes.find(({ purpose }) => purpose === "default");
  systemDefault.blocking = true;

  assert.throws(
    () => validateProductionContract(contract),
    /system probe must be advisory/u,
  );
});

test("contract validation pins trusted probes to AliDNS DoH", async () => {
  const contract = clone(await loadProductionContract(CONTRACT_PATH));
  const chinaGeneric = contract.dns.probes.find(
    ({ purpose }) => purpose === "china-generic",
  );
  chinaGeneric.resolver = "https://dns.example.invalid/resolve";

  assert.throws(
    () => validateProductionContract(contract),
    /must be exactly https:\/\/dns\.alidns\.com\/resolve/u,
  );
});
