import { createHmac, randomBytes } from "node:crypto";
import { constants, readFileSync } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { basename, dirname, join } from "node:path";
import { checkServerIdentity } from "node:tls";
import { isDirectExecution } from "./direct-execution.mjs";
import {
  ANALYTICS_REPORT_PATH,
  DEFAULT_ANALYTICS_DATABASE,
  createStoredAnalyticsEvent,
  createContentLabelResolver,
  openAnalyticsStore,
  parseReportRequest,
  reportSignature,
  signReportResponse,
  verifyReportRequest,
  verifyReportResponse,
} from "./analytics-store.mjs";

export const ANALYTICS_COLLECTOR_HOST = "127.0.0.1";
export const ANALYTICS_COLLECTOR_PORT = 3101;
export const ANALYTICS_COLLECTOR_PATH = "/api/analytics/events";
export const ANALYTICS_COLLECTOR_HEALTH_PATH = "/__fusiondigital_analytics_health";
export const DEFAULT_ANALYTICS_LOG = "/var/log/fusiondigital/analytics.log";

const MAX_BODY_BYTES = 4 * 1024;
const MAX_PENDING_WRITES = 256;
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
const CONTENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/=|+-]{0,159}$/u;
const SEARCH_CONTENT_PATTERN = /^search:domain=(?:all|physics|engineering|control|diagnostics|energy|auxiliary|data|hmi|integration|ai-native|facilities)\|type=(?:all|work|paper|code|tool|device|framework)\|cited=(?:yes|no)\|results=(?:0|1-4|5-14|15\+)$/u;
const KNOWLEDGE_CONTENT_PATTERN = /^knowledge-node:[a-f0-9]{16}$/u;
const EVENT_FIELDS = new Set([
  "eventId", "eventType", "visitorId", "sessionId", "path", "contentKey",
  "referrerSource", "deviceClass", "durationMs",
]);
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const JOURNAL_FIELDS = new Set(["receivedAt", "origin", "method", "status", ...EVENT_FIELDS]);
const MAX_RECOVERY_FILE_BYTES = 512 * 1024 * 1024;
const MAX_REPORT_RESPONSE_BYTES = 256 * 1024;

class CollectorRejection extends Error {
  constructor(status) {
    super("analytics collector rejected the request");
    this.status = status;
  }
}

export function parseCollectorEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject(422);
  const keys = Object.keys(value);
  if (keys.length !== EVENT_FIELDS.size || keys.some((field) => !EVENT_FIELDS.has(field))) reject(422);

  const eventId = boundedId(value.eventId);
  const visitorId = boundedId(value.visitorId);
  const sessionId = boundedId(value.sessionId);
  if (!EVENT_TYPES.has(value.eventType) || !DEVICE_CLASSES.has(value.deviceClass)) reject(422);
  if (typeof value.path !== "string" || !ALLOWED_PATHS.has(value.path)) reject(422);

  const contentKey = optionalContentKey(value.contentKey);
  const referrerSource = optionalReferrerSource(value.referrerSource);
  const durationMs = optionalDuration(value.durationMs);
  if (value.eventType === "engagement") {
    if (durationMs === null) reject(422);
  } else if (durationMs !== null) {
    reject(422);
  }
  if (value.eventType === "content_view" && contentKey === null) reject(422);
  if (value.eventType !== "page_view" && referrerSource !== null) reject(422);
  if (!approvedContent(value.eventType, value.path, contentKey)) reject(422);

  return {
    eventId,
    eventType: value.eventType,
    visitorId,
    sessionId,
    path: value.path,
    contentKey,
    referrerSource,
    deviceClass: value.deviceClass,
    durationMs,
  };
}

export function pseudonymizeCollectorEvent(event, secret) {
  requireSecret(secret);
  const digest = (scope, value) => createHmac("sha256", secret)
    .update(`${scope}:${value}`)
    .digest("base64url");
  return {
    ...event,
    eventId: digest("event", event.eventId),
    visitorId: digest("visitor", event.visitorId),
    sessionId: digest("session", event.sessionId),
  };
}

export async function probeCollector(options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const endpoint = options.endpoint
    ?? `http://${ANALYTICS_COLLECTOR_HOST}:${ANALYTICS_COLLECTOR_PORT}${ANALYTICS_COLLECTOR_HEALTH_PATH}`;
  const response = await fetcher(endpoint, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(3_000),
  });
  if (response.status !== 204) throw new Error("analytics collector health probe failed");
  return { healthy: true };
}

export async function probeReportBridge(options = {}) {
  const secret = requireSecret(options.secret ?? process.env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET);
  const fetcher = options.fetcher ?? globalThis.fetch;
  const endpoint = options.endpoint
    ?? `http://${ANALYTICS_COLLECTOR_HOST}:${ANALYTICS_COLLECTOR_PORT}${ANALYTICS_REPORT_PATH}`;
  const now = options.now ?? new Date();
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const nonce = options.nonce ?? randomBytes(16).toString("base64url");
  const body = JSON.stringify({ schemaVersion: 1, days: 7 });
  const signature = reportSignature({ kind: "request", body, timestamp, nonce, secret, status: 0 });
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-fd-analytics-report-nonce": nonce,
      "x-fd-analytics-report-signature": signature,
      "x-fd-analytics-report-timestamp": timestamp,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(3_000),
  });
  const responseBody = await response.text();
  const responseTimestamp = response.headers.get("x-fd-analytics-report-timestamp");
  const responseSignature = response.headers.get("x-fd-analytics-report-signature");
  if (response.status !== 200 || !responseTimestamp || !responseSignature || !verifyReportResponse({
    body: responseBody,
    timestamp: responseTimestamp,
    nonce,
    signature: responseSignature,
    secret,
    status: response.status,
    now,
  })) throw new Error("analytics report bridge probe failed");
  const envelope = JSON.parse(responseBody);
  if (!envelope || envelope.schemaVersion !== 1 || !envelope.report) {
    throw new Error("analytics report bridge probe failed");
  }
  return { healthy: true };
}

export async function probeReportBridgeTls(options = {}) {
  const endpoint = `https://fusiondigital.club${ANALYTICS_REPORT_PATH}`;
  return probeReportBridge({
    ...options,
    endpoint,
    fetcher: options.fetcher ?? localNginxTlsFetch,
  });
}

function localNginxTlsFetch(endpoint, options = {}) {
  const url = new URL(endpoint);
  if (url.origin !== "https://fusiondigital.club" || url.pathname !== ANALYTICS_REPORT_PATH
    || url.search || url.hash || options.method !== "POST" || typeof options.body !== "string") {
    return Promise.reject(new Error("invalid local analytics TLS probe"));
  }
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      hostname: "127.0.0.1",
      port: 443,
      path: ANALYTICS_REPORT_PATH,
      method: "POST",
      servername: "fusiondigital.club",
      rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity("fusiondigital.club", certificate),
      headers: { ...options.headers, host: "fusiondigital.club" },
    }, async (response) => {
      try {
        const chunks = [];
        let total = 0;
        for await (const chunk of response) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.byteLength;
          if (total > MAX_REPORT_RESPONSE_BYTES) throw new Error("analytics TLS probe response is oversized");
          chunks.push(bytes);
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        resolve(new Response(Buffer.concat(chunks, total), {
          status: response.statusCode ?? 500,
          headers,
        }));
      } catch (error) {
        reject(error);
      }
    });
    request.setTimeout(5_000, () => request.destroy(new Error("analytics TLS probe timed out")));
    request.once("error", reject);
    request.end(options.body);
  });
}

export async function startCollector(options = {}) {
  const logPath = options.logPath ?? DEFAULT_ANALYTICS_LOG;
  const reportSecret = options.reportSecret
    ?? options.secret
    ?? process.env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET;
  const pseudonymSecret = options.pseudonymSecret
    ?? process.env.FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET
    ?? (logPath !== DEFAULT_ANALYTICS_LOG ? reportSecret : undefined);
  const databasePath = options.databasePath
    ?? (logPath === DEFAULT_ANALYTICS_LOG ? DEFAULT_ANALYTICS_DATABASE : `${logPath}.sqlite`);
  const host = options.host ?? ANALYTICS_COLLECTOR_HOST;
  const port = options.port ?? ANALYTICS_COLLECTOR_PORT;
  requireSecret(reportSecret);
  requireSecret(pseudonymSecret);
  const store = options.store ?? openAnalyticsStore({
    databasePath,
    contentLabelResolver: loadContentLabelResolver(
      options.contentLabelsPath,
      logPath !== DEFAULT_ANALYTICS_LOG,
    ),
  });
  try {
    store.assertPseudonymSecret(pseudonymSecret);
    if (options.replayJournal !== false) await replayAnalyticsJournal({ logPath, secret: pseudonymSecret, store });
    store.cleanup(new Date(), true);
    if (!store.quickCheck()) throw new Error("analytics database integrity check failed");
  } catch (error) {
    if (!options.store) store.close();
    throw error;
  }

  let pendingWrites = 0;
  let writeTail = Promise.resolve();
  let storageFailed = false;
  const terminateForStorageFailure = options.onStorageFailure ?? (() => process.exit(1));
  const markStorageFailed = () => {
    if (storageFailed) return;
    storageFailed = true;
    const termination = setTimeout(terminateForStorageFailure, 25);
    termination.unref();
  };
  const cleanupTimer = setInterval(() => {
    try { store.cleanup(new Date(), true); } catch { markStorageFailed(); }
  }, 60 * 60 * 1_000);
  cleanupTimer.unref();
  const persist = async (record) => {
    if (storageFailed) reject(503);
    if (pendingWrites >= MAX_PENDING_WRITES) reject(503);
    pendingWrites += 1;
    const operation = writeTail.then(async () => {
      await appendSanitizedRecord(logPath, record);
      store.insert(createStoredAnalyticsEvent(record, pseudonymSecret));
    });
    writeTail = operation.catch(() => undefined);
    try {
      await operation;
    } catch (error) {
      markStorageFailed();
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  };

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === ANALYTICS_COLLECTOR_HEALTH_PATH) {
        respond(response, storageFailed ? 503 : 204);
        return;
      }
      if (storageFailed) reject(503);
      if (request.url === ANALYTICS_REPORT_PATH) {
        await handleReportRequest({ request, response, secret: reportSecret, store, markStorageFailed });
        return;
      }
      if (request.url !== ANALYTICS_COLLECTOR_PATH) reject(404);
      if (request.method !== "POST") reject(405);
      if (!singleHeaderEquals(request.headers.origin, ALLOWED_ORIGINS)) reject(403);
      if (!singleHeaderMatches(request.headers["content-type"], JSON_CONTENT_TYPE)) reject(415);
      validateContentLength(request.headers["content-length"]);

      const body = await readBoundedBody(request);
      let value;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
      } catch {
        reject(400);
      }
      const event = parseCollectorEvent(value);
      const sanitized = pseudonymizeCollectorEvent(event, pseudonymSecret);
      await persist({
        receivedAt: new Date().toISOString(),
        origin: request.headers.origin,
        method: "POST",
        status: 204,
        ...sanitized,
      });
      respond(response, 204);
    } catch (error) {
      request.resume();
      respond(response, error instanceof CollectorRejection ? error.status : 503);
    }
  });

  server.maxConnections = 128;
  server.headersTimeout = 5_000;
  server.requestTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });

  try {
    await new Promise((resolve, rejectListen) => {
      const onError = () => rejectListen(new Error("analytics collector could not bind its loopback socket"));
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve();
      });
    });
  } catch (error) {
    clearInterval(cleanupTimer);
    if (!options.store) store.close();
    throw error;
  }
  return {
    server,
    store,
    async close() {
      clearInterval(cleanupTimer);
      await new Promise((resolve, rejectClose) => server.close((error) => error ? rejectClose(error) : resolve()));
      await writeTail;
      if (!options.store) store.close();
    },
  };
}

async function handleReportRequest({ request, response, secret, store, markStorageFailed }) {
  if (request.method !== "POST") reject(405);
  if (!singleHeaderMatches(request.headers["content-type"], JSON_CONTENT_TYPE)) reject(415);
  validateContentLength(request.headers["content-length"]);
  const bodyBytes = await readBoundedBody(request);
  const body = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  const timestamp = singleHeader(request.headers["x-fd-analytics-report-timestamp"]);
  const nonce = singleHeader(request.headers["x-fd-analytics-report-nonce"]);
  const signature = singleHeader(request.headers["x-fd-analytics-report-signature"]);
  const now = new Date();
  if (!verifyReportRequest({ body, timestamp, nonce, signature, secret, now })) reject(403);
  if (!store.consumeNonce(nonce, now)) reject(409);
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    reject(400);
  }
  const requestValue = parseReportRequest(value);
  let report;
  try {
    report = store.report(requestValue.days, now);
  } catch (error) {
    markStorageFailed();
    throw error;
  }
  const responseBody = JSON.stringify({ schemaVersion: 1, report });
  const responseTimestamp = String(Math.floor(Date.now() / 1_000));
  const responseSignature = signReportResponse({
    body: responseBody,
    timestamp: responseTimestamp,
    nonce,
    secret,
    status: 200,
  });
  respondJson(response, responseBody, {
    "x-fd-analytics-report-signature": responseSignature,
    "x-fd-analytics-report-timestamp": responseTimestamp,
  });
}

export async function replayAnalyticsJournal({ logPath, secret, store }) {
  requireSecret(secret);
  const directory = dirname(logPath);
  const base = basename(logPath);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return { replayed: 0 };
    throw error;
  }
  const files = names
    .map((name) => {
      if (name === base) return { name, rotation: 0 };
      const match = new RegExp(`^${escapeRegExp(base)}\\.([1-9][0-9]*)$`, "u").exec(name);
      return match ? { name, rotation: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.rotation - left.rotation);
  let replayed = 0;
  let batch = [];
  const flush = () => {
    if (batch.length === 0) return;
    replayed += store.insertBatch(batch);
    batch = [];
  };
  for (const file of files) {
    const path = join(directory, file.name);
    const handle = await open(
      path,
      (file.rotation === 0 ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW,
    );
    try {
      let stats = await handle.stat();
      if (!stats.isFile() || stats.nlink !== 1 || stats.size > MAX_RECOVERY_FILE_BYTES) {
        throw new Error("analytics journal segment is unsafe");
      }
      let endsWithNewline = true;
      if (stats.size > 0) {
        const finalByte = Buffer.allocUnsafe(1);
        await handle.read(finalByte, 0, 1, stats.size - 1);
        endsWithNewline = finalByte[0] === 0x0a;
      }
      if (file.rotation === 0 && !endsWithNewline) {
        const lastLineFeed = await findLastLineFeed(handle, stats.size);
        await handle.truncate(lastLineFeed + 1);
        stats = await handle.stat();
        endsWithNewline = true;
      }
      let pendingLine = null;
      const replayLine = (line) => {
        if (!line) return;
        if (Buffer.byteLength(line, "utf8") > MAX_BODY_BYTES) throw new Error("analytics journal line is oversized");
        const record = parseJournalRecord(line);
        batch.push(createStoredAnalyticsEvent(record, secret));
        if (batch.length >= 250) flush();
      };
      for await (const line of handle.readLines({ encoding: "utf8" })) {
        if (pendingLine !== null) replayLine(pendingLine);
        pendingLine = line;
      }
      if (pendingLine !== null && endsWithNewline) replayLine(pendingLine);
    } finally {
      await handle.close();
    }
  }
  flush();
  return { replayed };
}

async function findLastLineFeed(handle, size) {
  const chunkSize = 64 * 1024;
  for (let end = size; end > 0;) {
    const start = Math.max(0, end - chunkSize);
    const buffer = Buffer.allocUnsafe(end - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, start);
    const index = buffer.subarray(0, bytesRead).lastIndexOf(0x0a);
    if (index >= 0) return start + index;
    end = start;
  }
  return -1;
}

function parseJournalRecord(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("analytics journal line is invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== JOURNAL_FIELDS.size
    || Object.keys(value).some((field) => !JOURNAL_FIELDS.has(field))
    || !ALLOWED_ORIGINS.has(value.origin)
    || value.method !== "POST"
    || value.status !== 204
    || typeof value.receivedAt !== "string"
    || value.receivedAt.length > 40
    || !Number.isFinite(new Date(value.receivedAt).getTime())) {
    throw new Error("analytics journal line is invalid");
  }
  const event = Object.fromEntries(Array.from(EVENT_FIELDS, (field) => [field, value[field]]));
  return { receivedAt: value.receivedAt, ...parseCollectorEvent(event) };
}

function loadContentLabelResolver(
  path = new URL("./analytics-content-labels.json", import.meta.url),
  allowMissing = false,
) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 2_000) {
      throw new TypeError("analytics content label map is invalid");
    }
    for (const [digest, label] of Object.entries(value)) {
      if (!/^[a-f0-9]{16}$/u.test(digest) || typeof label !== "string" || label.length < 1 || label.length > 200) {
        throw new TypeError("analytics content label map is invalid");
      }
    }
    return createContentLabelResolver(value);
  } catch (error) {
    if (error?.code === "ENOENT" && allowMissing) return createContentLabelResolver();
    throw error;
  }
}

async function readRootAnalyticsSecrets(path = "/etc/fusiondigital/analytics.env") {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    throw new Error("analytics report probe requires root");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1 || stats.uid !== 0 || (stats.mode & 0o077) !== 0 || stats.size > 512) {
      throw new Error("analytics secret file is unsafe");
    }
    const text = await handle.readFile("utf8");
    const values = new Map();
    for (const line of text.split(/\r?\n/u).filter(Boolean)) {
      const match = /^(FUSIONDIGITAL_ANALYTICS_(?:PSEUDONYM|REPORT|INGEST)_SECRET)=([A-Za-z0-9_-]{43,128})$/u.exec(line);
      if (!match || values.has(match[1])) throw new Error("analytics secret file is invalid");
      values.set(match[1], match[2]);
    }
    const pseudonymSecret = values.get("FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET");
    const reportSecret = values.get("FUSIONDIGITAL_ANALYTICS_REPORT_SECRET");
    if (!pseudonymSecret || !reportSecret || values.size > 3) throw new Error("analytics secret file is invalid");
    return { pseudonymSecret, reportSecret };
  } finally {
    await handle.close();
  }
}

async function appendSanitizedRecord(logPath, record) {
  const line = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  if (line.byteLength > MAX_BODY_BYTES) throw new Error("sanitized analytics record exceeded its fixed bound");
  const handle = await open(
    logPath,
    constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o640,
  );
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.nlink !== 1) throw new Error("analytics log is not a single regular file");
    let offset = 0;
    while (offset < line.byteLength) {
      const { bytesWritten } = await handle.write(line, offset, line.byteLength - offset, null);
      if (bytesWritten < 1) throw new Error("analytics log append made no progress");
      offset += bytesWritten;
    }
  } finally {
    await handle.close();
  }
}

async function readBoundedBody(request) {
  const chunks = [];
  let bytes = 0;
  let exceeded = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      exceeded = true;
      continue;
    }
    chunks.push(buffer);
  }
  if (exceeded || bytes === 0) reject(exceeded ? 413 : 400);
  return Buffer.concat(chunks, bytes);
}

function validateContentLength(value) {
  if (value === undefined) return;
  if (Array.isArray(value) || !/^\d{1,5}$/u.test(value)) reject(400);
  const length = Number(value);
  if (length < 1) reject(400);
  if (length > MAX_BODY_BYTES) reject(413);
}

function singleHeaderEquals(value, allowed) {
  return typeof value === "string" && !value.includes(",") && allowed.has(value);
}

function singleHeaderMatches(value, pattern) {
  return typeof value === "string" && !value.includes(",") && pattern.test(value);
}

function singleHeader(value) {
  return typeof value === "string" && !value.includes(",") ? value : null;
}

function boundedId(value) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) reject(422);
  return value;
}

function optionalContentKey(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value !== value.normalize("NFKC").trim() || !CONTENT_KEY_PATTERN.test(value)) reject(422);
  return value;
}

function optionalReferrerSource(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !REFERRER_SOURCES.has(value)) reject(422);
  return value;
}

function optionalDuration(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 1_800_000) reject(422);
  return value;
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

function requireSecret(value) {
  if (typeof value !== "string" || !SECRET_PATTERN.test(value)) {
    throw new Error("analytics collector secret is unavailable");
  }
  return value;
}

function reject(status) {
  throw new CollectorRejection(status);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function respond(response, status) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": "0",
    "x-content-type-options": "nosniff",
  });
  response.end();
}

function respondJson(response, body, additionalHeaders = {}) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body, "utf8"),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...additionalHeaders,
  });
  response.end(body);
}

if (isDirectExecution(import.meta.url)) {
  try {
    if (process.argv.includes("--report-probe") || process.argv.includes("--report-tls-probe")) {
      const rootSecrets = process.env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET
        ? null
        : await readRootAnalyticsSecrets();
      const secret = process.env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET ?? rootSecrets?.reportSecret;
      const result = process.argv.includes("--report-tls-probe")
        ? await probeReportBridgeTls({ secret })
        : await probeReportBridge({ secret });
      console.log(JSON.stringify(result));
    } else if (process.argv.includes("--probe")) {
      console.log(JSON.stringify(await probeCollector()));
    } else {
      const collector = await startCollector();
      let closing = false;
      const close = async () => {
        if (closing) return;
        closing = true;
        try {
          await collector.close();
        } catch {
          process.exitCode = 1;
        }
      };
      process.once("SIGTERM", close);
      process.once("SIGINT", close);
    }
  } catch {
    console.error("FusionDigital analytics collector failed without persisting request data.");
    process.exitCode = 1;
  }
}
