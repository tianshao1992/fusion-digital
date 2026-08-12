import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertRecordAllowed,
  candidateFromRecord,
  makeRunBundle,
  normalizeRecord,
  snapshotRecord,
  validateConfig,
} from "../scripts/research/agent/discover-core.mjs";

const config = JSON.parse(await readFile(new URL("../research/agent/config.json", import.meta.url), "utf8"));

test("agent configuration is candidate-only and source allowlisted", () => {
  assert.doesNotThrow(() => validateConfig(config));
  assert.equal(config.candidateOnly, true);
  assert.throws(() => validateConfig({ ...config, candidateOnly: false }), /candidateOnly=true/);
});

test("record origin and scope must match exact allowlist", () => {
  const allowed = normalizeRecord({ sourceId: "crossref", sourceUrl: "https://api.crossref.org/works/x", externalId: "x", targetType: "paper", title: "X" });
  assert.equal(assertRecordAllowed(allowed, config, "diagnostics").id, "crossref");
  const redirectTarget = { ...allowed, sourceUrl: "https://api.crossref.org.evil.example/works/x" };
  assert.throws(() => assertRecordAllowed(redirectTarget, config, "diagnostics"), /not allowlisted/);
  assert.throws(() => assertRecordAllowed(allowed, config, "facilities"), /not allowed for scope/);
});

test("snapshot hash is deterministic and unchanged records are skipped", () => {
  const record = normalizeRecord({ sourceId: "crossref", sourceUrl: "https://api.crossref.org/works/x", externalId: "x", targetType: "paper", title: "X" });
  const first = snapshotRecord(record).snapshotHash;
  const second = snapshotRecord({ ...record }).snapshotHash;
  assert.equal(first, second);
  assert.equal(candidateFromRecord({ ...record, existingHash: first }, first, "run"), null);
});

test("candidate contract maps add, update, and retire but never publish", () => {
  const base = normalizeRecord({ sourceId: "crossref", sourceUrl: "https://api.crossref.org/works/x", externalId: "x", targetType: "paper", title: "X" });
  const hash = snapshotRecord(base).snapshotHash;
  const add = candidateFromRecord(base, hash, "run");
  const update = candidateFromRecord({ ...base, targetId: "paper_x", existingHash: "a".repeat(64) }, hash, "run");
  const retire = candidateFromRecord({ ...base, targetId: "paper_x", retired: true }, hash, "run");
  assert.deepEqual([add.action, update.action, retire.action], ["add", "update", "retire"]);
  for (const candidate of [add, update, retire]) {
    assert.equal(candidate.status, "candidate");
    assert.equal(candidate.publishable, false);
    assert.equal("published" in candidate, false);
  }
});

test("run bundle keeps release boundary closed", () => {
  const bundle = makeRunBundle({ scope: "all", sourceIds: [], candidates: [], cursorBefore: {}, cursorAfter: {}, now: "2026-08-12T00:00:00.000Z" });
  assert.equal(bundle.candidateOnly, true);
  assert.equal(bundle.release.applied, false);
  assert.equal(bundle.run.status, "waiting_review");
});

test("research API keeps no-store, RBAC, origin, idempotency and self-review guards", async () => {
  const files = await Promise.all([
    "../app/api/research/runs/route.ts",
    "../app/api/research/candidates/route.ts",
    "../app/api/research/candidates/[id]/review/route.ts",
    "../app/api/research/_lib/validation.ts",
    "../app/api/_lib/http.ts",
    "../db/research.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const text = files.join("\n");
  assert.match(text, /requireRole\(\["reviewer", "admin"\]/);
  assert.match(text, /assertSameOrigin\(request\)/);
  assert.match(text, /Idempotency-Key/);
  assert.match(text, /Self-review is not permitted|A proposer cannot review their own/);
  assert.match(text, /cache-control", "no-store"/i);
  assert.doesNotMatch(text, /export async function markCandidatePublished/);
});

test("research mutations atomically enforce parent run state and append success audit", async () => {
  const research = await readFile(new URL("../db/research.ts", import.meta.url), "utf8");
  const mutationRoutes = await Promise.all([
    "../app/api/research/runs/route.ts",
    "../app/api/research/candidates/route.ts",
    "../app/api/research/candidates/[id]/submit/route.ts",
    "../app/api/research/candidates/[id]/review/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

  assert.match(research, /INSERT INTO candidate_changes[\s\S]*SELECT \?, id,[\s\S]*FROM research_runs[\s\S]*status IN \('queued', 'running'\)/);
  assert.match(research, /research_runs\.id = candidate_changes\.research_run_id[\s\S]*status IN \('queued', 'running', 'waiting_review'\)/);
  assert.match(research, /getD1\(\)\.batch\(\[/);
  for (const action of ["research.run.create", "research.candidate.create", "research.candidate.submit", "research.candidate.review"]) {
    assert.match(research, new RegExp(`INSERT INTO audit_events[\\s\\S]*'${action.replaceAll(".", "\\.")}'`));
  }
  assert.match(research, /'research\.run\.transition'/);
  assert.match(research, /exactChanges\(results, \[1, 1, 1\]\)/);
  assert.match(research, /proposed_by_user_id IS NULL OR proposed_by_user_id != \?/);
  for (const route of mutationRoutes) {
    assert.doesNotMatch(route, /appendAuditEvent/);
  }
});
