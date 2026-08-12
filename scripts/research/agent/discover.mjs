#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRecordAllowed, candidateFromRecord, loadAgentConfig, makeRunBundle, normalizeRecord, snapshotRecord } from "./discover-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const options = parseArgs(process.argv.slice(2));
if (!options.dryRun) fail("Phase one requires --dry-run; production writes are intentionally unsupported.");
const config = await loadAgentConfig(resolve(root, "research/agent/config.json"));
if (!/^[a-z][a-z0-9-]{1,63}$/.test(options.scope)) fail("--scope must be a slug");
const cursorState = JSON.parse(await readFile(resolve(root, "research/agent/cursors.json"), "utf8"));
const input = options.fixture ? JSON.parse(await readFile(resolve(process.cwd(), options.fixture), "utf8")) : [];
if (!Array.isArray(input)) fail("Fixture must be a JSON array");

const now = new Date().toISOString();
const runId = `dry_${now.replace(/[-:.TZ]/g, "").slice(0, 17)}`;
const candidates = [];
const cursorAfter = { ...(cursorState.sources ?? {}) };
for (const raw of input) {
  const record = normalizeRecord(raw);
  assertRecordAllowed(record, config, options.scope);
  const { snapshotHash } = snapshotRecord(record);
  const candidate = candidateFromRecord(record, snapshotHash, runId);
  if (candidate) candidates.push(candidate);
  if (record.cursor) cursorAfter[record.sourceId] = record.cursor;
}
const sources = [...new Set(input.map((record) => record.sourceId))].sort();
const bundle = makeRunBundle({ scope: options.scope, sourceIds: sources, candidates, cursorBefore: cursorState.sources ?? {}, cursorAfter, now });
const output = resolve(root, options.output ?? `research/agent/artifacts/${now.slice(0, 10)}-${options.scope}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ mode: "dry-run", output, candidates: candidates.length, snapshotHash: bundle.run.snapshotHash }));

function parseArgs(args) {
  const result = { dryRun: false, scope: "all", fixture: null, output: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") result.dryRun = true;
    else if (["--scope", "--fixture", "--output"].includes(arg)) result[arg.slice(2)] = args[++index] ?? fail(`${arg} requires a value`);
    else fail(`Unknown argument: ${arg}`);
  }
  return result;
}
function fail(message) {
  console.error(message);
  process.exitCode = 2;
  throw new Error(message);
}
