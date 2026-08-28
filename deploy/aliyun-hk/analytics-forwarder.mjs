import { createHmac } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isDirectExecution } from "./direct-execution.mjs";

export const ANALYTICS_INGEST_URL =
  "https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site/api/analytics/ingest";
export const DEFAULT_ANALYTICS_LOG = "/var/log/fusiondigital/analytics.log";
export const DEFAULT_ANALYTICS_STATE = "/var/lib/fusiondigital-analytics/forwarder-state.json";

const ALLOWED_ORIGINS = new Set([
  "https://fusiondigital.club",
  "https://www.fusiondigital.club",
]);
const ALLOWED_PATHS = new Set([
  "/", "/ai", "/control", "/data-foundation", "/diagnostics",
  "/digital-prototype", "/engineering", "/facilities", "/fusion-data",
  "/knowledge-graph", "/physics", "/platform", "/roadmap", "/search",
]);
const EVENT_TYPES = new Set(["page_view", "content_view", "engagement"]);
const DEVICE_CLASSES = new Set(["desktop", "tablet", "mobile", "other"]);
const REFERRER_SOURCES = new Set([
  "search:google", "search:bing", "search:baidu", "search:other",
  "ai:chatgpt", "code:github", "social:wechat", "social:zhihu",
  "social:other", "other",
]);
const PROTOTYPE_DEVICES = new Set([
  "paramak-full-device", "exl-50u-2026-upgrade", "ehl-2-preliminary", "iter-educational-model",
]);
const EFIT_SHOTS = new Set([
  "18301", "18303", "18304", "18308", "20213", "20289", "20666", "20669", "20707", "20708",
]);
const HOME_SECTIONS = new Set(["community", "domains", "prototype-workspace", "resources"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/u;
const SEARCH_CONTENT_PATTERN = /^search:domain=(?:all|physics|engineering|control|diagnostics|energy|auxiliary|data|hmi|integration|ai-native|facilities)\|type=(?:all|work|paper|code|tool|device|framework)\|cited=(?:yes|no)\|results=(?:0|1-4|5-14|15\+)$/u;
const KNOWLEDGE_CONTENT_PATTERN = /^knowledge-node:[a-f0-9]{16}$/u;
const LOG_FIELDS = new Set([
  "receivedAt", "origin", "method", "status", "eventId", "eventType", "visitorId", "sessionId",
  "path", "contentKey", "referrerSource", "deviceClass", "durationMs",
]);
const MAX_READ_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_EVENTS = 250;
const MAX_EVENTS_PER_RUN = 2_000;
const MAX_FORWARD_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export function parseAnalyticsLogLine(line, now = new Date()) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Object.keys(raw).some((field) => !LOG_FIELDS.has(field))) return null;
  if (!ALLOWED_ORIGINS.has(raw.origin)) return null;
  if (raw.method !== "POST" || raw.status !== 204) return null;
  if (!ID_PATTERN.test(raw.eventId ?? "") || !ID_PATTERN.test(raw.visitorId ?? "") || !ID_PATTERN.test(raw.sessionId ?? "")) return null;
  if (!EVENT_TYPES.has(raw.eventType) || !DEVICE_CLASSES.has(raw.deviceClass)) return null;

  const path = safeDecode(raw.path);
  const contentKey = safeDecode(raw.contentKey);
  const referrerSource = safeDecode(raw.referrerSource);
  if (!ALLOWED_PATHS.has(path) || !approvedContent(raw.eventType, path, contentKey || null)) return null;
  if (referrerSource && !REFERRER_SOURCES.has(referrerSource)) return null;
  if (raw.eventType !== "page_view" && referrerSource) return null;

  const receivedAt = new Date(raw.receivedAt ?? "");
  const age = now.getTime() - receivedAt.getTime();
  if (!Number.isFinite(age) || age > MAX_FORWARD_DELAY_MS || age < -MAX_FUTURE_SKEW_MS) return null;
  const durationMs = raw.durationMs === "" || raw.durationMs === undefined
    ? null
    : Number(raw.durationMs);
  if (raw.eventType === "engagement") {
    if (!Number.isSafeInteger(durationMs) || durationMs < 1_000 || durationMs > 1_800_000) return null;
  } else if (durationMs !== null) {
    return null;
  }
  if (raw.eventType === "content_view" && !contentKey) return null;

  return {
    eventId: raw.eventId,
    eventType: raw.eventType,
    visitorId: raw.visitorId,
    sessionId: raw.sessionId,
    path,
    contentKey: contentKey || null,
    referrerSource: referrerSource || null,
    deviceClass: raw.deviceClass,
    durationMs,
    receivedAt: receivedAt.toISOString(),
  };
}

export function signAnalyticsBatch(body, timestamp, secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("FUSIONDIGITAL_ANALYTICS_INGEST_SECRET must contain at least 32 characters");
  }
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function probeAnalytics(options = {}) {
  return postSignedEnvelope({ schemaVersion: 1, probe: true, events: [] }, options);
}

export async function forwardAnalytics(options = {}) {
  const logPath = options.logPath ?? DEFAULT_ANALYTICS_LOG;
  const statePath = options.statePath ?? DEFAULT_ANALYTICS_STATE;
  const secret = options.secret ?? process.env.FUSIONDIGITAL_ANALYTICS_INGEST_SECRET;
  if (!secret || secret.length < 32) throw new Error("Analytics ingest secret is unavailable");

  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  const segments = await listLogSegments(logPath);
  if (segments.length === 0) return { forwarded: 0, rejected: 0, offset: 0 };
  const previous = await readState(statePath);
  const previousIndex = previous
    ? segments.findIndex((segment) => segment.stats.dev === previous.dev && segment.stats.ino === previous.ino)
    : -1;
  let segmentIndex = previousIndex >= 0 ? previousIndex : 0;
  const segmentOffset = previousIndex >= 0 && previous.offset <= segments[previousIndex].stats.size
    ? previous.offset
    : 0;
  let bytesBudget = MAX_READ_BYTES;
  let rejected = 0;
  const events = [];
  let finalState = null;
  const now = new Date();

  for (; segmentIndex < segments.length && bytesBudget > 0 && events.length < MAX_EVENTS_PER_RUN; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const startOffset = segmentIndex === previousIndex ? segmentOffset : 0;
    if (startOffset === segment.stats.size) {
      finalState = stateFor(segment, startOffset);
      continue;
    }
    const bytesToRead = Math.min(bytesBudget, segment.stats.size - startOffset);
    if (bytesToRead <= 0) continue;
    const buffer = Buffer.alloc(bytesToRead);
    const handle = await open(segment.path, "r");
    let bytesRead;
    try {
      const openedStats = await handle.stat();
      if (openedStats.dev !== segment.stats.dev || openedStats.ino !== segment.stats.ino) {
        throw new Error("Analytics log rotated during segment open; retrying without advancing state");
      }
      ({ bytesRead } = await handle.read(buffer, 0, bytesToRead, startOffset));
    } finally {
      await handle.close();
    }
    bytesBudget -= bytesRead;

    const slice = buffer.subarray(0, bytesRead);
    let consumed = 0;
    let lineStart = 0;
    for (let index = 0; index < slice.length; index += 1) {
      if (slice[index] !== 0x0a) continue;
      const line = slice.subarray(lineStart, index).toString("utf8").trim();
      lineStart = index + 1;
      consumed = lineStart;
      if (line) {
        const event = parseAnalyticsLogLine(line, now);
        if (event) events.push(event);
        else rejected += 1;
      }
      if (events.length >= MAX_EVENTS_PER_RUN) break;
    }
    if (consumed > 0) finalState = stateFor(segment, startOffset + consumed);
    if (events.length >= MAX_EVENTS_PER_RUN || consumed < bytesRead || bytesBudget === 0) break;
  }

  for (let offset = 0; offset < events.length; offset += MAX_BATCH_EVENTS) {
    await postSignedEnvelope(
      { schemaVersion: 1, events: events.slice(offset, offset + MAX_BATCH_EVENTS) },
      { ...options, secret },
    );
  }
  if (finalState) await writeState(statePath, finalState);
  return { forwarded: events.length, rejected, offset: finalState?.offset ?? previous?.offset ?? 0 };
}

async function postSignedEnvelope(envelope, options) {
  const endpoint = options.endpoint ?? ANALYTICS_INGEST_URL;
  const secret = options.secret ?? process.env.FUSIONDIGITAL_ANALYTICS_INGEST_SECRET;
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (endpoint !== ANALYTICS_INGEST_URL) throw new Error("Analytics ingest URL is not the fixed Sites endpoint");
  if (!secret || secret.length < 32) throw new Error("Analytics ingest secret is unavailable");
  const body = JSON.stringify(envelope);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = signAnalyticsBatch(body, timestamp, secret);
  const response = await fetcher(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-fd-analytics-timestamp": timestamp,
      "x-fd-analytics-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 202) throw new Error(`Analytics ingest rejected the batch with HTTP ${response.status}`);
  return { verified: true };
}

async function listLogSegments(logPath) {
  const directory = dirname(logPath);
  const filename = basename(logPath);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const rotatedPattern = new RegExp(`^${escaped}\\.(\\d+)$`, "u");
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = rotatedPattern.exec(entry.name);
    if (entry.name !== filename && !match) continue;
    const path = join(directory, entry.name);
    const stats = await stat(path);
    if (!stats.isFile()) continue;
    candidates.push({ path, stats, rotation: match ? Number(match[1]) : 0 });
  }
  return candidates.sort((left, right) => right.rotation - left.rotation);
}

function stateFor(segment, offset) {
  return { version: 1, dev: segment.stats.dev, ino: segment.stats.ino, offset };
}

async function readState(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return value?.version === 1 && Number.isSafeInteger(value.offset) && value.offset >= 0
      ? value
      : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function writeState(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function approvedContent(eventType, path, contentKey) {
  if (contentKey === null) return eventType !== "content_view";
  const detailEvent = eventType === "content_view" || eventType === "engagement";
  return (
    (path === "/" && (eventType === "page_view" || eventType === "engagement")
      && contentKey.startsWith("section:") && HOME_SECTIONS.has(contentKey.slice("section:".length)))
    || (path === "/" && detailEvent && contentKey.startsWith("prototype-device:")
      && PROTOTYPE_DEVICES.has(contentKey.slice("prototype-device:".length)))
    || (path === "/" && detailEvent && contentKey.startsWith("efit-shot:")
      && EFIT_SHOTS.has(contentKey.slice("efit-shot:".length)))
    || (path === "/knowledge-graph" && detailEvent && KNOWLEDGE_CONTENT_PATTERN.test(contentKey))
    || (path === "/search" && detailEvent && SEARCH_CONTENT_PATTERN.test(contentKey))
  );
}

function safeDecode(value) {
  if (typeof value !== "string" || value.length > 512) return "";
  try {
    return decodeURIComponent(value).normalize("NFKC").trim();
  } catch {
    return "";
  }
}

if (isDirectExecution(import.meta.url)) {
  const result = process.argv.includes("--probe")
    ? await probeAnalytics()
    : await forwardAnalytics();
  console.log(JSON.stringify(result));
}
