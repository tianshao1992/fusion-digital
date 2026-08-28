import { createHmac } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createServer } from "node:http";
import { isDirectExecution } from "./direct-execution.mjs";

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

export async function startCollector(options = {}) {
  const secret = options.secret ?? process.env.FUSIONDIGITAL_ANALYTICS_INGEST_SECRET;
  const logPath = options.logPath ?? DEFAULT_ANALYTICS_LOG;
  const host = options.host ?? ANALYTICS_COLLECTOR_HOST;
  const port = options.port ?? ANALYTICS_COLLECTOR_PORT;
  requireSecret(secret);

  let pendingWrites = 0;
  let writeTail = Promise.resolve();
  const persist = async (record) => {
    if (pendingWrites >= MAX_PENDING_WRITES) reject(503);
    pendingWrites += 1;
    const operation = writeTail.then(() => appendSanitizedRecord(logPath, record));
    writeTail = operation.catch(() => undefined);
    try {
      await operation;
    } finally {
      pendingWrites -= 1;
    }
  };

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === ANALYTICS_COLLECTOR_HEALTH_PATH) {
        respond(response, 204);
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
      const sanitized = pseudonymizeCollectorEvent(event, secret);
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

  await new Promise((resolve, rejectListen) => {
    const onError = () => rejectListen(new Error("analytics collector could not bind its loopback socket"));
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
  return {
    server,
    async close() {
      await new Promise((resolve, rejectClose) => server.close((error) => error ? rejectClose(error) : resolve()));
      await writeTail;
    },
  };
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

function respond(response, status) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": "0",
    "x-content-type-options": "nosniff",
  });
  response.end();
}

if (isDirectExecution(import.meta.url)) {
  try {
    if (process.argv.includes("--probe")) {
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
