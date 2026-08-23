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

test("every publishable English index field passes the no-Han quality gate", async () => {
  const { readFile } = await import("node:fs/promises");
  const index = JSON.parse(await readFile(new URL("../public/data/fusion-knowledge-index.json", import.meta.url), "utf8"));
  assert.equal(index.schemaVersion, "1.1.0");
  for (const entry of index.entries) {
    assert.ok(entry.titleEn);
    assert.ok(entry.summaryEn);
    assert.doesNotMatch(entry.titleEn, /[\u3400-\u9fff]/u, entry.id);
    assert.doesNotMatch(entry.summaryEn, /[\u3400-\u9fff]/u, entry.id);
    for (const source of entry.sources) {
      assert.ok(source.labelEn);
      assert.doesNotMatch(source.labelEn, /[\u3400-\u9fff]/u, `${entry.id}:source-label`);
      if (source.detailEn) assert.doesNotMatch(source.detailEn, /[\u3400-\u9fff]/u, `${entry.id}:source-detail`);
    }
  }
  assert.equal(index.statistics.englishReviewPending.title, index.entries.filter((entry) => entry.titleEn.includes("awaiting expert English title review")).length);
  assert.equal(index.statistics.englishReviewPending.summary, index.entries.filter((entry) => entry.summaryEn.includes("expert-reviewed English abstract is pending")).length);
});

test("deterministic search ranks exact device and tool matches", async () => {
  const { searchKnowledge } = await modulePromise;
  const exl = searchKnowledge("EXL-50U", { citedOnly: true }, 20);
  assert.ok(exl.length > 0);
  assert.ok(exl.some((hit) => hit.devices.some((device) => device.includes("EXL-50U"))));
  assert.ok(exl.every((hit) => hit.sources.length > 0));
  assert.ok(exl.every((hit) => hit.matchedTerms.length > 0));

  const dina = searchKnowledge("DINA", { domain: "control", citedOnly: true }, 10);
  assert.ok(dina.length > 0);
  assert.ok(dina.some((hit) => /DINA/i.test(`${hit.title} ${hit.summary} ${hit.tags.join(" ")}`)));
  assert.ok(dina.every((hit) => hit.matchedTerms.length > 0));
});

test("source quality never manufactures relevance for a non-empty query", async () => {
  const { searchKnowledge } = await modulePromise;
  assert.deepEqual(searchKnowledge("你是谁", { citedOnly: true }, 20), []);
  assert.ok(searchKnowledge("氚", { citedOnly: true }, 20).length > 0);
  assert.ok(searchKnowledge("氘", { citedOnly: true }, 20).length > 0);
});

test("English questions ignore function words and keep named fusion entities at the top", async () => {
  const { searchKnowledge } = await modulePromise;
  const dina = searchKnowledge("what are the limitations of DINA", { citedOnly: true }, 8, "en");
  assert.ok(dina.length > 0);
  assert.match(`${dina[0].title} ${dina[0].summary}`, /DINA/i);
  assert.ok(dina.slice(0, 4).every((hit) => /DINA/i.test(`${hit.title} ${hit.summary}`)));
  assert.ok(dina.every((hit) => !hit.matchedTerms.includes("the") && !hit.matchedTerms.includes("of") && !hit.matchedTerms.includes("are")));

  const comparison = searchKnowledge("Compare TRANSP and ASTRA", { citedOnly: true }, 8, "en");
  assert.match(comparison[0].title, /TRANSP/i);
  assert.match(comparison[1].title, /ASTRA/i);
});

test("English result projection contains English titles, summaries and source metadata", async () => {
  const { searchKnowledge } = await modulePromise;
  const hits = searchKnowledge("How does DINA support real-time plasma shape control?", { citedOnly: true }, 5, "en");
  assert.ok(hits.length > 0);
  for (const hit of hits) {
    assert.doesNotMatch(JSON.stringify({
      title: hit.title,
      summary: hit.summary,
      excerpt: hit.excerpt,
      organization: hit.organization,
      devices: hit.devices,
      tags: hit.tags,
      evidenceLevel: hit.evidenceLevel,
      deploymentLevel: hit.deploymentLevel,
      sources: hit.sources,
    }), /[\u3400-\u9fff]/u);
  }
});

test("search API forwards the requested locale into result projection", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8");
  assert.match(route, /normalizeSearchLocale\(url\.searchParams\.get\("locale"\)/);
  assert.match(route, /searchKnowledge\(query, filters, limit, locale\)/);
  assert.match(route, /\{ query, locale, filters,/);
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
  const [ask, output, usage] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/ask/conversation-output.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../db/usage.ts", import.meta.url), "utf8")),
  ]);
  assert.match(output, /claims:\s*\{/);
  assert.match(output, /minItems:\s*groundingRequired\s*\?\s*1\s*:\s*0/);
  assert.match(output, /output\.claims\.some\(\(claim\)\s*=>\s*claim\.citationRefs\.length\s*===\s*0\)/);
  assert.match(output, /stripModelCitationMarkers/);
  assert.match(ask, /new TextEncoder\(\)\.encode\(value\)\.byteLength/);
  assert.match(ask, /normalizeHistory/);
  assert.match(ask, /buildRetrievalQuery/);
  assert.match(ask, /保留供应商原生的用户\/助手多轮角色/);
  assert.match(ask, /Write concise English/);
  assert.match(ask, /Today's model Q&A quota has been exhausted/);
  assert.match(ask, /conversationId/);
  assert.match(usage, /expiresAt/);
  assert.match(usage, /actualTokens > existing\.reservedTokens/);
});
