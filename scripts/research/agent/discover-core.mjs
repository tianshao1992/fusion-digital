import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function loadAgentConfig(path) {
  const config = JSON.parse(await readFile(path, "utf8"));
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  if (!config || config.schemaVersion !== "1.0" || config.candidateOnly !== true) {
    throw new Error("Agent config must use schemaVersion 1.0 and candidateOnly=true");
  }
  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    throw new Error("Agent config requires at least one allowlisted source");
  }
  const ids = new Set();
  for (const source of config.sources) {
    if (!source || !/^[a-z][a-z0-9-]{1,63}$/.test(source.id) || ids.has(source.id)) {
      throw new Error("Source identifiers must be unique slugs");
    }
    ids.add(source.id);
    if (!Array.isArray(source.origins) || !source.origins.length) throw new Error(`Source ${source.id} requires origins`);
    source.origins.forEach(assertOrigin);
    if (!Array.isArray(source.scopes) || !source.scopes.length) throw new Error(`Source ${source.id} requires scopes`);
  }
}

export function assertRecordAllowed(record, config, scope) {
  const source = config.sources.find((entry) => entry.enabled && entry.id === record.sourceId);
  if (!source) throw new Error(`Source is not allowlisted: ${record.sourceId}`);
  if (!source.scopes.includes(scope)) throw new Error(`Source ${record.sourceId} is not allowed for scope ${scope}`);
  const url = new URL(requiredString(record.sourceUrl, "sourceUrl", 2_000));
  if (!source.origins.includes(url.origin)) throw new Error(`URL origin is not allowlisted for ${record.sourceId}`);
  return source;
}

export function normalizeRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Each discovery record must be an object");
  return {
    sourceId: requiredString(record.sourceId, "sourceId", 64),
    sourceUrl: requiredString(record.sourceUrl, "sourceUrl", 2_000),
    externalId: requiredString(record.externalId, "externalId", 500),
    targetType: requiredString(record.targetType, "targetType", 100),
    targetId: optionalString(record.targetId, 300),
    title: requiredString(record.title, "title", 1_000),
    content: optionalString(record.content, 30_000) ?? "",
    existingHash: optionalHash(record.existingHash),
    retired: record.retired === true,
    cursor: optionalString(record.cursor, 4_000),
  };
}

export function snapshotRecord(record) {
  const canonical = stableStringify({
    sourceId: record.sourceId,
    sourceUrl: record.sourceUrl,
    externalId: record.externalId,
    targetType: record.targetType,
    targetId: record.targetId,
    title: record.title,
    content: record.content,
    retired: record.retired,
  });
  return { snapshotHash: sha256(canonical), canonical };
}

export function candidateFromRecord(record, snapshotHash, runId) {
  const action = record.retired ? "retire" : record.targetId ? "update" : "add";
  if (!record.retired && record.existingHash && record.existingHash === snapshotHash) return null;
  return {
    schemaVersion: "1.0",
    kind: "candidate-change",
    runId,
    idempotencyKey: `agent:${record.sourceId}:${sha256(`${record.externalId}:${snapshotHash}`).slice(0, 48)}`,
    action,
    targetType: record.targetType,
    targetId: record.targetId,
    snapshotHash,
    source: { id: record.sourceId, url: record.sourceUrl, externalId: record.externalId },
    proposed: { title: record.title, content: record.content, sourceUrl: record.sourceUrl, externalId: record.externalId, snapshotHash },
    diff: { previousHash: record.existingHash, nextHash: snapshotHash },
    rationale: record.retired
      ? "The allowlisted source marks this record as retired; human review is required before any public change."
      : record.targetId
        ? "The current source snapshot differs from the previously recorded hash."
        : "A new record was discovered from an allowlisted source.",
    status: "candidate",
    publishable: false,
  };
}

export function makeRunBundle({ scope, sourceIds, candidates, cursorBefore, cursorAfter, now }) {
  const snapshotHash = sha256(stableStringify(candidates));
  return {
    schemaVersion: "1.0",
    kind: "research-run-bundle",
    candidateOnly: true,
    run: {
      idempotencyKey: `schedule:${scope}:${now.slice(0, 10)}:${snapshotHash.slice(0, 24)}`,
      triggerType: "schedule",
      scope,
      status: "waiting_review",
      snapshotHash,
      startedAt: now,
      completedAt: now,
      statistics: { sources: sourceIds.length, discovered: candidates.length },
    },
    cursor: { before: cursorBefore, after: cursorAfter },
    candidates,
    release: { applied: false, reason: "Candidate bundles require authenticated human review and a separate release boundary." },
  };
}

function assertOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value || url.username || url.password) {
    throw new Error(`Allowlist entry must be an HTTPS origin: ${value}`);
  }
}
function requiredString(value, field, max) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  if (value.trim().length > max) throw new Error(`${field} is too long`);
  return value.trim();
}
function optionalString(value, max) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new Error("Optional string is invalid");
  return value.trim();
}
function optionalHash(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("existingHash must be SHA-256 hex");
  return value;
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
