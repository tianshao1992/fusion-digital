import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_ANALYTICS_DATABASE = "/var/lib/fusiondigital-analytics/analytics.sqlite";
export const ANALYTICS_RETENTION_DAYS = 120;
export const ANALYTICS_REPORT_PATH = "/__fusiondigital_analytics_report_v1";
export const ANALYTICS_MAX_PAGE_COUNT = 262_144;

const REPORT_DAYS = new Set([7, 30, 90]);
const REQUEST_KEY_LABEL = "fusiondigital.analytics.report.request-key.v1";
const RESPONSE_KEY_LABEL = "fusiondigital.analytics.report.response-key.v1";
const REQUEST_CONTEXT = "fusiondigital.analytics.report.request.v1";
const RESPONSE_CONTEXT = "fusiondigital.analytics.report.response.v1";
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
const TIMESTAMP_PATTERN = /^\d{10}$/u;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/u;
const BRIDGE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const MAX_CLOCK_SKEW_SECONDS = 300;
const NONCE_RETENTION_SECONDS = 600;
const MAX_RECENT_SESSIONS = 40;
const MAX_JOURNEY_STEPS = 16;

const fixedLabels = new Map([
  ["section:community", "社区与协作"],
  ["section:domains", "专业领域"],
  ["section:prototype-workspace", "数字样机工作台"],
  ["section:resources", "开放资源"],
  ["prototype-device:paramak-full-device", "Paramak 全装置样机"],
  ["prototype-device:exl-50u-2026-upgrade", "EXL-50U 2026 升级样机"],
  ["prototype-device:ehl-2-preliminary", "EHL-2 初步设计样机"],
  ["prototype-device:iter-educational-model", "ITER 教学模型"],
]);

export function openAnalyticsStore(options = {}) {
  const databasePath = options.databasePath ?? DEFAULT_ANALYTICS_DATABASE;
  const database = options.database ?? new DatabaseSync(databasePath, {
    open: true,
    readOnly: false,
    allowExtension: false,
  });
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA trusted_schema = OFF");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA secure_delete = ON");
  database.exec("PRAGMA page_size = 4096");
  if (databasePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = FULL");
    database.exec("PRAGMA wal_autocheckpoint = 1000");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL CHECK (source = 'club'),
      event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'content_view', 'engagement')),
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 160),
      content_key TEXT CHECK (content_key IS NULL OR length(content_key) BETWEEN 1 AND 160),
      referrer_source TEXT CHECK (
        referrer_source IS NULL OR referrer_source IN (
          'search:google', 'search:bing', 'search:baidu', 'search:other',
          'ai:chatgpt', 'code:github', 'social:wechat', 'social:zhihu',
          'social:other', 'other'
        )
      ),
      device_class TEXT NOT NULL CHECK (device_class IN ('desktop', 'tablet', 'mobile', 'other')),
      duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 1000 AND 1800000),
      occurred_at TEXT NOT NULL,
      occurred_date TEXT NOT NULL,
      received_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_local_analytics_occurred_at ON analytics_events (occurred_at);
    CREATE INDEX IF NOT EXISTS idx_local_analytics_date_source ON analytics_events (occurred_date, source);
    CREATE INDEX IF NOT EXISTS idx_local_analytics_path_date ON analytics_events (path, occurred_date);
    CREATE INDEX IF NOT EXISTS idx_local_analytics_visitor_date ON analytics_events (visitor_id, occurred_date);
    CREATE INDEX IF NOT EXISTS idx_local_analytics_session_time ON analytics_events (session_id, occurred_at);
    CREATE TABLE IF NOT EXISTS analytics_report_nonces (
      nonce TEXT PRIMARY KEY NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS analytics_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) STRICT;
  `);
  const pageSize = Number(database.prepare("PRAGMA page_size").get()?.page_size);
  const maxPageCount = Number(database.prepare(`PRAGMA max_page_count = ${ANALYTICS_MAX_PAGE_COUNT}`).get()?.max_page_count);
  if (pageSize !== 4_096 || maxPageCount !== ANALYTICS_MAX_PAGE_COUNT) {
    database.close();
    throw new Error("analytics database capacity contract is unavailable");
  }

  let lastCleanup = 0;
  const insertStatement = database.prepare(`
    INSERT OR IGNORE INTO analytics_events
      (id, source, event_type, visitor_id, session_id, path, content_key,
       referrer_source, device_class, duration_ms, occurred_at, occurred_date, received_at)
    VALUES (?, 'club', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOne = (event) => insertStatement.run(
    event.eventId,
    event.eventType,
    event.visitorId,
    event.sessionId,
    event.path,
    event.contentKey ?? null,
    event.referrerSource ?? null,
    event.deviceClass,
    event.durationMs ?? null,
    event.occurredAt,
    event.occurredDate,
    event.receivedAt ?? event.occurredAt,
  );

  const cleanup = (now = new Date(), force = false) => {
    if (!force && now.getTime() - lastCleanup < 60 * 60 * 1_000) return;
    const cutoff = new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 86_400_000).toISOString();
    database.prepare("DELETE FROM analytics_events WHERE occurred_at < ?").run(cutoff);
    database.prepare("DELETE FROM analytics_report_nonces WHERE expires_at < ?")
      .run(Math.floor(now.getTime() / 1_000));
    if (force && databasePath !== ":memory:") database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    lastCleanup = now.getTime();
  };

  cleanup(new Date(), true);
  return {
    database,
    assertPseudonymSecret(secret) {
      const fingerprint = createHmac("sha256", secret)
        .update("fusiondigital.analytics.pseudonym-key.v1")
        .digest("hex");
      const existing = database.prepare("SELECT value FROM analytics_metadata WHERE key = 'pseudonym_key_fingerprint'").get();
      if (existing && existing.value !== fingerprint) throw new Error("analytics pseudonym key changed without a migration");
      database.prepare("INSERT OR IGNORE INTO analytics_metadata (key, value) VALUES ('pseudonym_key_fingerprint', ?)")
        .run(fingerprint);
    },
    insert(event) {
      const result = insertOne(event);
      cleanup();
      return Number(result.changes) === 1;
    },
    insertBatch(events) {
      database.exec("BEGIN IMMEDIATE");
      let inserted = 0;
      try {
        for (const event of events) inserted += Number(insertOne(event).changes);
        database.exec("COMMIT");
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch { /* preserve the originating failure */ }
        throw error;
      }
      return inserted;
    },
    consumeNonce(nonce, now = new Date()) {
      if (!NONCE_PATTERN.test(nonce)) return false;
      const nowSeconds = Math.floor(now.getTime() / 1_000);
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("DELETE FROM analytics_report_nonces WHERE expires_at < ?").run(nowSeconds);
        const result = database.prepare(
          "INSERT OR IGNORE INTO analytics_report_nonces (nonce, expires_at) VALUES (?, ?)",
        ).run(nonce, nowSeconds + NONCE_RETENTION_SECONDS);
        database.exec("COMMIT");
        return Number(result.changes) === 1;
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch { /* preserve the originating failure */ }
        throw error;
      }
    },
    report(days, now = new Date()) {
      cleanup(now, true);
      return buildAnalyticsReport(database, days, now, options.contentLabelResolver);
    },
    cleanup(now = new Date(), force = true) {
      cleanup(now, force);
    },
    quickCheck() {
      return database.prepare("PRAGMA quick_check").get()?.quick_check === "ok";
    },
    close() {
      try { database.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* in-memory databases have no WAL */ }
      database.close();
    },
  };
}

export function createStoredAnalyticsEvent(journalRecord, secret) {
  const occurredAt = journalRecord.receivedAt;
  const date = new Date(occurredAt);
  if (typeof occurredAt !== "string" || !Number.isFinite(date.getTime())) {
    throw new TypeError("analytics journal timestamp is invalid");
  }
  const digest = (scope, value) => createHmac("sha256", secret)
    .update(`${scope}:${value}`)
    .digest()
    .subarray(0, 18)
    .toString("base64url");
  return {
    eventId: digest("event", journalRecord.eventId),
    eventType: journalRecord.eventType,
    visitorId: digest("visitor", journalRecord.visitorId),
    sessionId: digest("session", journalRecord.sessionId),
    path: journalRecord.path,
    contentKey: journalRecord.contentKey,
    referrerSource: journalRecord.referrerSource,
    deviceClass: journalRecord.deviceClass,
    durationMs: journalRecord.durationMs,
    source: "club",
    occurredAt,
    occurredDate: shanghaiDate(date),
    receivedAt: occurredAt,
  };
}

export function parseReportRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid report request");
  if (Object.keys(value).length !== 2 || value.schemaVersion !== 1 || !REPORT_DAYS.has(value.days)) {
    throw new TypeError("invalid report request");
  }
  return { schemaVersion: 1, days: value.days };
}

export function verifyReportRequest(input) {
  const { body, timestamp, nonce, signature, secret, now = new Date() } = input;
  if (!validSignedMetadata(timestamp, nonce, signature, secret, now)) return false;
  const expected = reportSignature({
    kind: "request",
    body,
    timestamp,
    nonce,
    secret,
    status: 0,
  });
  return safeHexEqual(signature, expected);
}

export function signReportResponse(input) {
  return reportSignature({ kind: "response", ...input });
}

export function verifyReportResponse(input) {
  const { body, timestamp, nonce, signature, secret, status, now = new Date() } = input;
  if (!validSignedMetadata(timestamp, nonce, signature, secret, now)) return false;
  const expected = reportSignature({ kind: "response", body, timestamp, nonce, secret, status });
  return safeHexEqual(signature, expected);
}

export function reportSignature(input) {
  const { kind, body, timestamp, nonce, secret } = input;
  if (typeof secret !== "string" || !BRIDGE_SECRET_PATTERN.test(secret)) throw new TypeError("analytics report secret is invalid");
  const label = kind === "request" ? REQUEST_KEY_LABEL : RESPONSE_KEY_LABEL;
  const context = kind === "request" ? REQUEST_CONTEXT : RESPONSE_CONTEXT;
  const key = createHmac("sha256", secret).update(label).digest();
  const bodyDigest = createHash("sha256").update(body).digest("hex");
  const prefix = kind === "request"
    ? `${context}\nPOST\n${ANALYTICS_REPORT_PATH}`
    : `${context}\n${Number(input.status)}`;
  return createHmac("sha256", key)
    .update(`${prefix}\n${timestamp}\n${nonce}\n${bodyDigest}`)
    .digest("hex");
}

export function buildAnalyticsReport(database, days, now = new Date(), labelResolver = contentDisplayLabel) {
  if (!REPORT_DAYS.has(days)) throw new TypeError("analytics report days is invalid");
  const { startDate, endDate, dates } = analyticsDateWindow(days, now);
  const monthStart = `${endDate.slice(0, 7)}-01`;
  const weekStart = analyticsDateWindow(7, now).startDate;
  const queryStart = startDate < monthStart ? startDate : monthStart;
  const summary = database.prepare(`
    SELECT
      coalesce(sum(CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN 1 ELSE 0 END), 0) AS page_views,
      count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN visitor_id END) AS visitors,
      count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN session_id END) AS sessions,
      count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date = ? THEN visitor_id END) AS dau,
      count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN visitor_id END) AS wau,
      count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN visitor_id END) AS mau,
      coalesce(avg(CASE WHEN event_type = 'engagement' AND occurred_date >= ? THEN duration_ms END), 0) AS average_duration_ms,
      max(CASE WHEN occurred_date >= ? THEN occurred_at END) AS updated_at
    FROM analytics_events WHERE occurred_date BETWEEN ? AND ?
  `).get(startDate, startDate, startDate, endDate, weekStart, monthStart, startDate, startDate, queryStart, endDate);
  const bounce = database.prepare(`
    SELECT count(*) AS session_count,
      coalesce(sum(CASE WHEN page_views = 1 THEN 1 ELSE 0 END), 0) AS bounced_sessions
    FROM (
      SELECT session_id, count(*) AS page_views FROM analytics_events
      WHERE event_type = 'page_view' AND occurred_date BETWEEN ? AND ? GROUP BY session_id
    )
  `).get(startDate, endDate);
  const dailyRows = database.prepare(`
    SELECT occurred_date AS date,
      sum(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      count(DISTINCT CASE WHEN event_type = 'page_view' THEN visitor_id END) AS visitors,
      count(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END) AS sessions
    FROM analytics_events WHERE occurred_date BETWEEN ? AND ?
    GROUP BY occurred_date ORDER BY occurred_date
  `).all(startDate, endDate);
  const topRows = database.prepare(`
    SELECT path, content_key,
      sum(CASE WHEN event_type IN ('page_view', 'content_view') THEN 1 ELSE 0 END) AS views,
      count(DISTINCT CASE WHEN event_type IN ('page_view', 'content_view') THEN visitor_id END) AS visitors,
      coalesce(avg(CASE WHEN event_type = 'engagement' THEN duration_ms END), 0) AS average_duration_ms
    FROM analytics_events WHERE occurred_date BETWEEN ? AND ?
    GROUP BY path, content_key
    HAVING sum(CASE WHEN event_type IN ('page_view', 'content_view') THEN 1 ELSE 0 END) > 0
    ORDER BY views DESC, visitors DESC, path, content_key LIMIT 80
  `).all(startDate, endDate);
  const heatmapRows = database.prepare(`
    SELECT cast(strftime('%w', occurred_at, '+8 hours') AS integer) AS weekday,
      cast(strftime('%H', occurred_at, '+8 hours') AS integer) AS hour,
      count(*) AS page_views
    FROM analytics_events WHERE event_type = 'page_view' AND occurred_date BETWEEN ? AND ?
    GROUP BY weekday, hour ORDER BY weekday, hour
  `).all(startDate, endDate);
  const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]));
  const sessionCount = integer(bounce?.session_count);
  const bouncedSessions = integer(bounce?.bounced_sessions);
  return {
    days,
    startDate,
    endDate,
    timeZone: "Asia/Shanghai",
    updatedAt: summary?.updated_at ?? null,
    summary: {
      dau: integer(summary?.dau),
      wau: integer(summary?.wau),
      mau: integer(summary?.mau),
      visitors: integer(summary?.visitors),
      pageViews: integer(summary?.page_views),
      sessions: integer(summary?.sessions),
      bounceRate: sessionCount > 0 ? bouncedSessions / sessionCount : 0,
      averageEngagedSeconds: millisecondsToSeconds(summary?.average_duration_ms),
    },
    daily: dates.map((date) => {
      const row = dailyByDate.get(date);
      return { date, pageViews: integer(row?.page_views), visitors: integer(row?.visitors), sessions: integer(row?.sessions) };
    }),
    topContent: topRows.map((row) => ({
      path: row.path,
      contentKey: row.content_key,
      displayLabel: labelResolver(row.content_key),
      views: integer(row.views),
      visitors: integer(row.visitors),
      averageEngagedSeconds: millisecondsToSeconds(row.average_duration_ms),
    })),
    hourlyHeatmap: heatmapRows.map((row) => ({
      weekday: integer(row.weekday), hour: integer(row.hour), pageViews: integer(row.page_views),
    })),
    sourceBreakdown: breakdown(database, "source", startDate, endDate),
    deviceBreakdown: breakdown(database, "device_class", startDate, endDate),
    recentSessions: recentSessions(database, startDate, endDate, labelResolver),
  };
}

function breakdown(database, field, startDate, endDate) {
  return database.prepare(`
    SELECT ${field} AS key, count(*) AS page_views, count(DISTINCT visitor_id) AS visitors
    FROM analytics_events WHERE event_type = 'page_view' AND occurred_date BETWEEN ? AND ?
    GROUP BY ${field} ORDER BY page_views DESC, key
  `).all(startDate, endDate).map((row) => ({
    key: row.key, pageViews: integer(row.page_views), visitors: integer(row.visitors),
  }));
}

function recentSessions(database, startDate, endDate, labelResolver) {
  const sessions = database.prepare(`
    SELECT session_id, visitor_id, source, device_class,
      min(occurred_at) AS started_at, max(occurred_at) AS ended_at,
      sum(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      coalesce(sum(CASE WHEN event_type = 'engagement' THEN duration_ms ELSE 0 END), 0) AS engaged_ms,
      max(referrer_source) AS referrer_source
    FROM analytics_events WHERE occurred_date BETWEEN ? AND ?
    GROUP BY session_id, visitor_id, source, device_class
    HAVING sum(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) > 0
    ORDER BY ended_at DESC, session_id LIMIT ?
  `).all(startDate, endDate, MAX_RECENT_SESSIONS);
  if (sessions.length === 0) return [];
  const ids = sessions.map((row) => row.session_id);
  const placeholders = ids.map(() => "?").join(", ");
  const events = database.prepare(`
    SELECT session_id, path, content_key, occurred_at FROM analytics_events
    WHERE event_type IN ('page_view', 'content_view') AND session_id IN (${placeholders})
    ORDER BY occurred_at, id
  `).all(...ids);
  const journeys = new Map();
  for (const event of events) {
    const journey = journeys.get(event.session_id) ?? [];
    const label = labelResolver(event.content_key);
    const step = label ? `${event.path}#${label}` : event.path;
    if (journey.at(-1) !== step && journey.length < MAX_JOURNEY_STEPS) journey.push(step);
    journeys.set(event.session_id, journey);
  }
  return sessions.map((row) => {
    const journey = journeys.get(row.session_id) ?? [];
    return {
      sessionLabel: `S-${publicIdDigest(row.session_id).slice(0, 10)}`,
      visitorLabel: `V-${publicIdDigest(row.visitor_id).slice(0, 10)}`,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pageViews: integer(row.page_views),
      engagedSeconds: millisecondsToSeconds(row.engaged_ms),
      entryPath: journey[0] ?? "/",
      exitPath: journey.at(-1) ?? journey[0] ?? "/",
      journey,
      referrerSource: row.referrer_source,
      deviceClass: row.device_class,
      source: row.source,
    };
  });
}

function analyticsDateWindow(days, now) {
  const endDate = shanghaiDate(now);
  const endUtc = new Date(`${endDate}T00:00:00.000Z`);
  const dates = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(new Date(endUtc.getTime() - offset * 86_400_000).toISOString().slice(0, 10));
  }
  return { startDate: dates[0], endDate, dates };
}

function shanghaiDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function contentDisplayLabel(contentKey) {
  if (!contentKey) return null;
  if (fixedLabels.has(contentKey)) return fixedLabels.get(contentKey);
  if (contentKey.startsWith("efit-shot:")) return `EFIT 炮号 ${contentKey.slice(10)}`;
  if (contentKey.startsWith("knowledge-node:")) return `知识节点 ${contentKey.slice(15, 23)}`;
  if (contentKey.startsWith("search:")) return contentKey.slice(7);
  return contentKey;
}

export function createContentLabelResolver(entries = {}) {
  const knowledgeLabels = new Map(Object.entries(entries));
  return (contentKey) => {
    if (typeof contentKey === "string" && contentKey.startsWith("knowledge-node:")) {
      const digest = contentKey.slice("knowledge-node:".length);
      return knowledgeLabels.get(digest) ?? `知识节点 ${digest.slice(0, 8)}`;
    }
    return contentDisplayLabel(contentKey);
  };
}

function publicIdDigest(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function validSignedMetadata(timestamp, nonce, signature, secret, now) {
  if (typeof secret !== "string" || !BRIDGE_SECRET_PATTERN.test(secret)) return false;
  if (!TIMESTAMP_PATTERN.test(timestamp ?? "") || !NONCE_PATTERN.test(nonce ?? "") || !SIGNATURE_PATTERN.test(signature ?? "")) return false;
  const seconds = Number(timestamp);
  return Number.isSafeInteger(seconds) && Math.abs(Math.floor(now.getTime() / 1_000) - seconds) <= MAX_CLOCK_SKEW_SECONDS;
}

function safeHexEqual(actual, expected) {
  if (!SIGNATURE_PATTERN.test(actual ?? "") || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function integer(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function millisecondsToSeconds(value) {
  const milliseconds = Number(value ?? 0);
  return Number.isFinite(milliseconds) ? Math.max(0, Math.round(milliseconds / 100) / 10) : 0;
}
