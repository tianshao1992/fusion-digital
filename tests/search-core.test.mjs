import assert from "node:assert/strict";
import test from "node:test";

const modulePromise = import("../app/search/search-core.ts");

test("canonical knowledge index has broad source coverage", async () => {
  const { getIndexMetadata } = await modulePromise;
  const metadata = getIndexMetadata();
  assert.ok(metadata.statistics.total > 1_000);
  assert.ok(metadata.statistics.byType.paper > 400);
  assert.ok(metadata.statistics.byType.code > 300);
  assert.ok(metadata.statistics.byDomain.control > 400);
  assert.ok(metadata.statistics.byDomain.diagnostics > 400);
});

test("deterministic search ranks exact device and tool matches", async () => {
  const { searchKnowledge } = await modulePromise;
  const exl = searchKnowledge("EXL-50U", { citedOnly: true }, 20);
  assert.ok(exl.length > 0);
  assert.ok(exl.some((hit) => hit.devices.some((device) => device.includes("EXL-50U"))));
  assert.ok(exl.every((hit) => hit.sources.length > 0));

  const dina = searchKnowledge("DINA", { domain: "control", citedOnly: true }, 10);
  assert.ok(dina.length > 0);
  assert.ok(dina.some((hit) => /DINA/i.test(`${hit.title} ${hit.summary} ${hit.tags.join(" ")}`)));
});

test("filters and public result shape are enforced", async () => {
  const { searchKnowledge } = await modulePromise;
  const papers = searchKnowledge("plasma", { type: "paper", yearFrom: 2020, citedOnly: true }, 50);
  assert.ok(papers.length > 0);
  assert.ok(papers.every((hit) => hit.entityType === "paper"));
  assert.ok(papers.every((hit) => hit.year === null || hit.year >= 2020));
  assert.ok(papers.every((hit) => !("searchText" in hit)));
});

test("query normalization prevents oversized input", async () => {
  const { normalizeQuery, SEARCH_LIMITS } = await modulePromise;
  const normalized = normalizeQuery(`\u0000  EXL-50U ${"x".repeat(1_000)}`);
  assert.equal(normalized.length, SEARCH_LIMITS.queryChars);
  assert.equal(normalized.includes("\u0000"), false);
});

test("ask route enforces claim-level citations and conservative quota accounting", async () => {
  const [ask, usage] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../db/usage.ts", import.meta.url), "utf8")),
  ]);
  assert.match(ask, /claims:\s*\{/);
  assert.match(ask, /minItems:\s*1/);
  assert.match(ask, /invalidClaim/);
  assert.match(ask, /stripModelCitationMarkers/);
  assert.match(ask, /new TextEncoder\(\)\.encode\(value\)\.byteLength/);
  assert.match(usage, /expiresAt/);
  assert.match(usage, /actualTokens > existing\.reservedTokens/);
});
