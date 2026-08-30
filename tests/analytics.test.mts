import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import {
  analyticsPublicIdDigest,
  classifyAnalyticsReferrerHost,
  parseAnalyticsEventInput,
  parseAnalyticsReport,
  shanghaiDate,
  type StoredAnalyticsEvent,
} from "../app/analytics/contracts.ts";
import {
  parseForwardedAnalyticsEvents,
  pseudonymizeAnalyticsEvents,
  storedAnalyticsEvent,
  verifyAnalyticsSignature,
} from "../app/analytics/server.ts";
import {
  analyticsDateWindow,
  getAnalyticsReport,
  insertAnalyticsEvents,
} from "../db/analytics.ts";
import {
  ANALYTICS_COLLECTOR_HEALTH_PATH,
  ANALYTICS_COLLECTOR_PATH,
  probeReportBridge,
  parseCollectorEvent,
  probeCollector,
  pseudonymizeCollectorEvent,
  startCollector,
} from "../deploy/aliyun-hk/analytics-collector.mjs";
import {
  ANALYTICS_REPORT_PATH,
  createStoredAnalyticsEvent,
  openAnalyticsStore,
  reportSignature as nodeReportSignature,
  verifyReportRequest as verifyNodeReportRequest,
  verifyReportResponse as verifyNodeReportResponse,
} from "../deploy/aliyun-hk/analytics-store.mjs";
import {
  reportSignature as webReportSignature,
  verifyReportSignature as verifyWebReportSignature,
  fetchClubAnalyticsReport,
} from "../app/analytics/report-bridge.ts";

const opaque = (seed: string) => seed.padEnd(24, "x");
const validEvent = {
  eventId: opaque("event"),
  eventType: "page_view" as const,
  visitorId: opaque("visitor"),
  sessionId: opaque("session"),
  path: "/fusion-data",
  contentKey: null,
  referrerSource: "search:google" as const,
  deviceClass: "desktop" as const,
  durationMs: null,
};

test("analytics input is strict, semantic, and excludes free text and network identities", () => {
  assert.deepEqual(parseAnalyticsEventInput(validEvent), validEvent);
  assert.throws(() => parseAnalyticsEventInput({ ...validEvent, path: "/search?q=private" }), /approved public/u);
  assert.throws(() => parseAnalyticsEventInput({ ...validEvent, visitorId: "short" }), /opaque/u);
  assert.throws(() => parseAnalyticsEventInput({ ...validEvent, email: "person@example.org" }), /unsupported field/u);
  assert.throws(() => parseAnalyticsEventInput({
    ...validEvent,
    eventType: "content_view",
    path: "/physics",
    contentKey: "search:ssn=123-45-6789",
    referrerSource: null,
  }), /not approved/u);
  assert.throws(() => parseAnalyticsEventInput({
    ...validEvent,
    eventType: "engagement",
    durationMs: 10_000,
  }), /only accepted for page_view/u);
  assert.throws(() => parseAnalyticsEventInput({ ...validEvent, referrerSource: "192.168.1.10" }), /referrerSource/u);
  assert.equal(classifyAnalyticsReferrerHost("accounts.google.com"), "search:google");
  assert.equal(classifyAnalyticsReferrerHost("192.168.1.10"), "other");
  assert.equal(classifyAnalyticsReferrerHost("private-host"), "other");
  assert.match(analyticsPublicIdDigest("paper:public-record"), /^[a-f0-9]{16}$/u);
});

test("analytics dates use Asia/Shanghai boundaries and complete report windows", () => {
  assert.equal(shanghaiDate(new Date("2026-08-27T15:59:59.000Z")), "2026-08-27");
  assert.equal(shanghaiDate(new Date("2026-08-27T16:00:00.000Z")), "2026-08-28");
  assert.deepEqual(analyticsDateWindow(7, new Date("2026-08-28T01:00:00.000Z")), {
    startDate: "2026-08-22",
    endDate: "2026-08-28",
    dates: ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"],
  });
});

test("signed Hong Kong batches are fresh, authenticated, strict, and server-pseudonymized", async () => {
  const secret = "A".repeat(43);
  const timestamp = "1787882400";
  const body = JSON.stringify({ schemaVersion: 1, events: [] });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(await verifyAnalyticsSignature({
    body,
    timestamp,
    signature,
    secret,
    now: new Date(Number(timestamp) * 1_000),
  }), true);
  assert.equal(await verifyAnalyticsSignature({
    body: `${body} `,
    timestamp,
    signature,
    secret,
    now: new Date(Number(timestamp) * 1_000),
  }), false);

  const receivedAt = "2026-08-28T09:00:00.000Z";
  const [forwarded] = parseForwardedAnalyticsEvents({
    schemaVersion: 1,
    events: [{ ...validEvent, receivedAt }],
  }, new Date("2026-08-28T10:00:00.000Z"));
  assert.equal(forwarded.source, "club");
  assert.equal(forwarded.occurredAt, receivedAt);
  assert.throws(() => parseForwardedAnalyticsEvents({
    schemaVersion: 1,
    events: [{ ...validEvent, receivedAt, prompt: "private" }],
  }, new Date("2026-08-28T10:00:00.000Z")), /unsupported field/u);
  assert.throws(() => parseForwardedAnalyticsEvents({
    schemaVersion: 1,
    events: [{ ...validEvent, receivedAt: "2026-08-01T00:00:00.000Z" }],
  }, new Date("2026-08-28T10:00:00.000Z")), /time window/u);

  const [pseudonymous] = await pseudonymizeAnalyticsEvents([forwarded], secret);
  const [again] = await pseudonymizeAnalyticsEvents([forwarded], secret);
  assert.notEqual(pseudonymous.eventId, forwarded.eventId);
  assert.notEqual(pseudonymous.visitorId, forwarded.visitorId);
  assert.notEqual(pseudonymous.sessionId, forwarded.sessionId);
  assert.equal(pseudonymous.eventId, again.eventId);
  assert.equal(pseudonymous.visitorId, again.visitorId);
  assert.equal(pseudonymous.sessionId, again.sessionId);
});

test("report bridge uses matching domain-separated Node and WebCrypto signatures", async () => {
  const secret = "A".repeat(43);
  const timestamp = "1787882400";
  const nonce = "abcdefghijklmnopqrstuv";
  const requestBody = JSON.stringify({ schemaVersion: 1, days: 30 });
  const request = { kind: "request" as const, body: requestBody, timestamp, nonce, secret, status: 0 };
  const nodeRequest = nodeReportSignature(request);
  assert.equal(await webReportSignature(request), nodeRequest);
  assert.equal(await verifyWebReportSignature({ ...request, signature: nodeRequest }), true);
  assert.equal(await verifyWebReportSignature({ ...request, body: `${requestBody} `, signature: nodeRequest }), false);

  const responseBody = JSON.stringify({ schemaVersion: 1, report: { days: 30 } });
  const response = { kind: "response" as const, body: responseBody, timestamp, nonce, secret, status: 200 };
  const nodeResponse = nodeReportSignature(response);
  assert.equal(await webReportSignature(response), nodeResponse);
  assert.equal(verifyNodeReportResponse({ ...response, signature: nodeResponse, now: new Date(Number(timestamp) * 1_000) }), true);
  assert.equal(verifyNodeReportRequest({ ...request, signature: nodeRequest, now: new Date((Number(timestamp) + 301) * 1_000) }), false);
  assert.equal(verifyNodeReportRequest({ ...request, signature: nodeRequest, now: new Date((Number(timestamp) - 301) * 1_000) }), false);
  assert.equal(verifyNodeReportRequest({ ...request, signature: nodeResponse, now: new Date(Number(timestamp) * 1_000) }), false);
  assert.notEqual(nodeRequest, nodeResponse);

  await assert.rejects(() => fetchClubAnalyticsReport(30, secret, {
    now: new Date(Number(timestamp) * 1_000),
    nonce,
    fetcher: async () => new Response(new Uint8Array(256 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  }), /unavailable/u);
});

test("loopback collector validates in memory and persists only scoped HMAC identifiers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusiondigital-analytics-collector-"));
  const logPath = join(directory, "analytics.log");
  const pseudonymSecret = "A".repeat(43);
  const reportSecret = "B".repeat(43);
  const sharedId = opaque("same-client-id");
  const scoped = pseudonymizeCollectorEvent(parseCollectorEvent({
    ...validEvent,
    eventId: sharedId,
    visitorId: sharedId,
    sessionId: sharedId,
  }), pseudonymSecret);
  assert.match(scoped.eventId, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(scoped.eventId, scoped.visitorId);
  assert.notEqual(scoped.visitorId, scoped.sessionId);

  const collector = await startCollector({ reportSecret, pseudonymSecret, logPath, port: 0 });
  try {
    const address = collector.server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await probeCollector({ endpoint: `${baseUrl}${ANALYTICS_COLLECTOR_HEALTH_PATH}` });

    const accepted = await fetch(`${baseUrl}${ANALYTICS_COLLECTOR_PATH}`, {
      method: "POST",
      headers: { origin: "https://fusiondigital.club", "content-type": "application/json" },
      body: JSON.stringify(validEvent),
      redirect: "error",
    });
    assert.equal(accepted.status, 204);

    const rejected = await fetch(`${baseUrl}${ANALYTICS_COLLECTOR_PATH}`, {
      method: "POST",
      headers: { origin: "https://fusiondigital.club", "content-type": "application/json" },
      body: JSON.stringify({
        ...validEvent,
        eventType: "content_view",
        path: "/search",
        contentKey: "search:ssn=123-45-6789",
        referrerSource: null,
      }),
      redirect: "error",
    });
    assert.equal(rejected.status, 422);

    const lines = (await readFile(logPath, "utf8")).trim().split(/\r?\n/u);
    assert.equal(lines.length, 1);
    const persisted = JSON.parse(lines[0]) as Record<string, unknown>;
    for (const field of ["eventId", "visitorId", "sessionId"] as const) {
      assert.match(String(persisted[field]), /^[A-Za-z0-9_-]{43}$/u);
      assert.notEqual(persisted[field], validEvent[field]);
    }
    assert.doesNotMatch(lines[0], /same-client-id|visitorx|sessionx|ssn|123-45-6789/iu);
    await probeReportBridge({ secret: reportSecret, endpoint: `${baseUrl}${ANALYTICS_REPORT_PATH}` });
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const nonce = "zyxwvutsrqponmlkjihgfe";
    const reportBody = JSON.stringify({ schemaVersion: 1, days: 7 });
    const signature = nodeReportSignature({
      kind: "request", body: reportBody, timestamp, nonce, secret: reportSecret, status: 0,
    });
    const reportResponse = await fetch(`${baseUrl}${ANALYTICS_REPORT_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fd-analytics-report-timestamp": timestamp,
        "x-fd-analytics-report-nonce": nonce,
        "x-fd-analytics-report-signature": signature,
      },
      body: reportBody,
    });
    assert.equal(reportResponse.status, 200);
    const reportEnvelope = await reportResponse.json() as { report: unknown };
    assert.equal(parseAnalyticsReport(reportEnvelope.report).summary.pageViews, 1);
    const replayed = await fetch(`${baseUrl}${ANALYTICS_REPORT_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fd-analytics-report-timestamp": timestamp,
        "x-fd-analytics-report-nonce": nonce,
        "x-fd-analytics-report-signature": signature,
      },
      body: reportBody,
    });
    assert.equal(replayed.status, 409);
  } finally {
    await collector.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("collector repairs only an incomplete active journal tail and remains restart-idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusiondigital-analytics-recovery-"));
  const logPath = join(directory, "analytics.log");
  const databasePath = join(directory, "analytics.sqlite");
  const pseudonymSecret = "A".repeat(43);
  const reportSecret = "B".repeat(43);
  const start = () => startCollector({
    reportSecret,
    pseudonymSecret,
    logPath,
    databasePath,
    port: 0,
  });
  const send = async (collector: Awaited<ReturnType<typeof startCollector>>, eventId: string) => {
    const address = collector.server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}${ANALYTICS_COLLECTOR_PATH}`, {
      method: "POST",
      headers: { origin: "https://fusiondigital.club", "content-type": "application/json" },
      body: JSON.stringify({ ...validEvent, eventId: opaque(eventId) }),
    });
    assert.equal(response.status, 204);
  };

  try {
    let collector = await start();
    await send(collector, "recovery-event-1");
    await collector.close();
    await appendFile(logPath, '{"receivedAt":"incomplete', "utf8");

    collector = await start();
    assert.doesNotMatch(await readFile(logPath, "utf8"), /incomplete/u);
    await send(collector, "recovery-event-2");
    await collector.close();

    collector = await start();
    assert.equal(collector.store.report(7, new Date()).summary.pageViews, 2);
    await collector.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local SQLite store persists events, nonce replay state, and its pseudonym key across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusiondigital-analytics-store-"));
  const databasePath = join(directory, "analytics.sqlite");
  const secret = "A".repeat(43);
  const now = new Date();
  const receivedAt = now.toISOString();
  let store = openAnalyticsStore({ databasePath });
  try {
    store.assertPseudonymSecret(secret);
    store.assertPseudonymSecret(secret);
    assert.throws(() => store.assertPseudonymSecret("B".repeat(43)), /pseudonym key changed/u);
    const journal = {
      receivedAt,
      eventId: opaqueForwarded("event-local"),
      eventType: "page_view",
      visitorId: opaqueForwarded("visitor-local"),
      sessionId: opaqueForwarded("session-local"),
      path: "/fusion-data",
      contentKey: null,
      referrerSource: "search:google",
      deviceClass: "desktop",
      durationMs: null,
    };
    const stored = createStoredAnalyticsEvent(journal, secret);
    assert.match(stored.eventId, /^[A-Za-z0-9_-]{24}$/u);
    assert.equal(store.insert(stored), true);
    assert.equal(store.insert(stored), false);
    const report = store.report(7, now);
    assert.equal(report.summary.pageViews, 1);
    assert.equal(report.summary.visitors, 1);
    assert.equal(report.updatedAt, journal.receivedAt);
    assert.equal(store.consumeNonce("abcdefghijklmnopqrstuv", now), true);
    assert.equal(store.quickCheck(), true);
    assert.equal(Number(store.database.prepare("PRAGMA page_size").get()?.page_size), 4_096);
    assert.equal(Number(store.database.prepare("PRAGMA max_page_count").get()?.max_page_count), 262_144);
    store.close();

    store = openAnalyticsStore({ databasePath });
    store.assertPseudonymSecret(secret);
    assert.throws(() => store.assertPseudonymSecret("B".repeat(43)), /pseudonym key changed/u);
    assert.equal(store.report(7, new Date(now.getTime() + 1_000)).summary.pageViews, 1);
    assert.equal(store.consumeNonce("abcdefghijklmnopqrstuv", new Date(now.getTime() + 1_000)), false);
    assert.equal(store.quickCheck(), true);
  } finally {
    try { store.close(); } catch { /* the first close is intentional before reopen */ }
    await rm(directory, { recursive: true, force: true });
  }
});

test("D1 reports distinguish DAU, rolling WAU, current-month MAU, and selected-window UV", async () => {
  const database = analyticsDatabase();
  const binding = new NodeD1(database);
  const localStore = openAnalyticsStore({ databasePath: ":memory:" });
  globalThis.__FUSIONDIGITAL_DB__ = binding as unknown as Cloudflare.D1Database;
  try {
    const page = (overrides: Partial<StoredAnalyticsEvent>): StoredAnalyticsEvent => ({
      ...storedAnalyticsEvent({ ...validEvent, referrerSource: null }, "club", new Date("2026-08-28T02:00:00.000Z")),
      ...overrides,
    });
    const old = page({
      eventId: opaque("old-event"),
      occurredAt: "2020-01-01T00:00:00.000Z",
      occurredDate: "2020-01-01",
    });
    await insertAnalyticsEvents([old]);
    assert.equal(Number(database.prepare("SELECT count(*) AS count FROM analytics_events").get()?.count), 0);

    const events: StoredAnalyticsEvent[] = [
      page({ eventId: opaque("event-1"), visitorId: opaque("visitor-1"), sessionId: opaque("session-1"), path: "/" }),
      page({ eventId: opaque("event-2"), visitorId: opaque("visitor-1"), sessionId: opaque("session-1"), path: "/search" }),
      page({
        eventId: opaque("event-3"), visitorId: opaque("visitor-2"), sessionId: opaque("session-2"), path: "/fusion-data", deviceClass: "mobile",
        occurredAt: "2026-08-27T02:00:00.000Z", occurredDate: "2026-08-27",
      }),
      page({
        eventId: opaque("event-4"), visitorId: opaque("visitor-3"), sessionId: opaque("session-3"), path: "/physics",
        occurredAt: "2026-08-20T02:00:00.000Z", occurredDate: "2026-08-20",
      }),
      page({
        eventId: opaque("event-5"), visitorId: opaque("visitor-4"), sessionId: opaque("session-4"), path: "/ai",
        occurredAt: "2026-07-31T02:00:00.000Z", occurredDate: "2026-07-31",
      }),
      page({
        eventId: opaque("event-6"), visitorId: opaque("visitor-1"), sessionId: opaque("session-1"), path: "/search",
        eventType: "engagement", durationMs: 60_000, referrerSource: null,
      }),
      page({
        eventId: opaque("event-7"), visitorId: opaque("visitor-5"), sessionId: opaque("session-5"), path: "/engineering",
        occurredAt: "2026-06-15T02:00:00.000Z", occurredDate: "2026-06-15",
      }),
    ];
    assert.equal(await insertAnalyticsEvents(events), 7);
    await insertAnalyticsEvents([events[0]]);
    assert.equal(localStore.insertBatch([old, ...events]), 8);

    const report30 = await getAnalyticsReport(30, new Date("2026-08-28T10:00:00.000Z"));
    assert.equal(report30.summary.dau, 1);
    assert.equal(report30.summary.wau, 2);
    assert.equal(report30.summary.mau, 3);
    assert.equal(report30.summary.visitors, 4);
    assert.equal(report30.summary.pageViews, 5);
    assert.equal(report30.summary.sessions, 4);
    assert.equal(report30.summary.averageEngagedSeconds, 60);
    assert.ok(Math.abs(report30.summary.bounceRate - 3 / 4) < 0.0001);
    assert.equal(report30.daily.length, 30);
    assert.equal(report30.sourceBreakdown.reduce((sum, row) => sum + row.pageViews, 0), 5);
    assert.equal(report30.deviceBreakdown.find((row) => row.key === "mobile")?.pageViews, 1);
    assert.equal(report30.recentSessions.some((row) => "sessionId" in row), false);
    assert.deepEqual(report30.recentSessions.find((row) => row.pageViews === 2)?.journey, ["/", "/search"]);
    assert.equal(parseAnalyticsReport(report30), report30);
    assert.deepEqual(localStore.report(30, new Date("2026-08-28T10:00:00.000Z")), report30);
    assert.throws(() => parseAnalyticsReport({ ...report30, summary: { ...report30.summary, wau: "2" } }), /wau/u);

    const report7 = await getAnalyticsReport(7, new Date("2026-08-28T10:00:00.000Z"));
    assert.equal(report7.startDate, "2026-08-22");
    assert.equal(report7.summary.visitors, 2);
    assert.equal(report7.daily.length, 7);
    const report90 = await getAnalyticsReport(90, new Date("2026-08-28T10:00:00.000Z"));
    assert.equal(report90.startDate, "2026-05-31");
    assert.equal(report90.summary.visitors, 5);
    assert.equal(report90.summary.pageViews, 6);
    assert.equal(report90.daily.length, 90);
  } finally {
    delete globalThis.__FUSIONDIGITAL_DB__;
    localStore.close();
    database.close();
  }
});

test("rolling WAU crosses a month boundary while MAU remains in the current calendar month", async () => {
  const database = analyticsDatabase();
  const binding = new NodeD1(database);
  globalThis.__FUSIONDIGITAL_DB__ = binding as unknown as Cloudflare.D1Database;
  try {
    const page = (eventId: string, visitorId: string, sessionId: string, occurredAt: string, occurredDate: string): StoredAnalyticsEvent => ({
      ...storedAnalyticsEvent({ ...validEvent, referrerSource: null }, "club", new Date(occurredAt)),
      eventId: opaque(eventId),
      visitorId: opaque(visitorId),
      sessionId: opaque(sessionId),
      occurredAt,
      occurredDate,
    });
    await insertAnalyticsEvents([
      page("cross-month-1", "stable-visitor", "august-session", "2026-08-30T02:00:00.000Z", "2026-08-30"),
      page("cross-month-2", "stable-visitor", "september-session", "2026-09-01T02:00:00.000Z", "2026-09-01"),
      page("cross-month-3", "stable-visitor", "september-session", "2026-09-02T02:00:00.000Z", "2026-09-02"),
      page("cross-month-4", "august-only", "august-only-session", "2026-08-29T02:00:00.000Z", "2026-08-29"),
    ]);

    const report = await getAnalyticsReport(7, new Date("2026-09-02T10:00:00.000Z"));
    assert.equal(report.startDate, "2026-08-27");
    assert.equal(report.summary.dau, 1);
    assert.equal(report.summary.wau, 2);
    assert.equal(report.summary.mau, 1);
    assert.equal(report.summary.visitors, 2);
  } finally {
    delete globalThis.__FUSIONDIGITAL_DB__;
    database.close();
  }
});

test("analytics charts retain accessible tables and dashboard controls expose semantic roles", () => {
  const charts = readFileSync(new URL("../app/admin/analytics/AnalyticsCharts.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/admin/analytics/AdminAnalyticsDashboard.tsx", import.meta.url), "utf8");

  assert.equal((charts.match(/keepFallbackAccessible/gu) ?? []).length, 3);
  for (const caption of ["Daily activity data", "Most visited content data", "Non-zero weekday and hour activity"]) {
    assert.match(charts, new RegExp(`<caption>\\{en \\? "${caption}"`, "u"));
  }
  assert.match(dashboard, /className="analyticsRange" role="group"/u);
  assert.match(dashboard, /className="analyticsKpis" role="list"/u);
  assert.match(dashboard, /<article role="listitem"/u);
  assert.match(dashboard, /analyticsLoading" role="status" aria-live="polite"/u);
  assert.match(dashboard, /<p className="srOnly" role="status">/u);
});

test("admin APIs and Hong Kong ingress remain fail-closed and privacy-minimized", () => {
  const reportRoute = readFileSync(new URL("../app/api/analytics/report/route.ts", import.meta.url), "utf8");
  const bridge = readFileSync(new URL("../app/analytics/report-bridge.ts", import.meta.url), "utf8");
  const nginx = readFileSync(new URL("../deploy/aliyun-hk/nginx.conf", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../app/analytics/AnalyticsTracker.tsx", import.meta.url), "utf8");
  const collector = readFileSync(new URL("../deploy/aliyun-hk/analytics-collector.mjs", import.meta.url), "utf8");
  const store = readFileSync(new URL("../deploy/aliyun-hk/analytics-store.mjs", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const cloudflareEnv = readFileSync(new URL("../cloudflare-env.d.ts", import.meta.url), "utf8");
  const collectorService = readFileSync(new URL("../deploy/aliyun-hk/fusiondigital-analytics-collector.service", import.meta.url), "utf8");
  const installer = readFileSync(new URL("../deploy/aliyun-hk/install-analytics-forwarder.sh", import.meta.url), "utf8");
  const logrotate = readFileSync(new URL("../deploy/aliyun-hk/fusiondigital-analytics.logrotate", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0002_unique_morbius.sql", import.meta.url), "utf8");

  assert.match(reportRoute, /requireRole\(\["admin"\]/u);
  assert.ok(reportRoute.indexOf("requireRole") < reportRoute.indexOf("fetchClubAnalyticsReport"));
  assert.match(reportRoute, /isPublicAnonymousMode\(\).*status: 404/u);
  assert.equal(existsSync(new URL("../app/api/analytics/ingest/route.ts", import.meta.url)), false);
  assert.match(bridge, /https:\/\/fusiondigital\.club/u);
  assert.match(bridge, /redirect: "error"/u);
  assert.match(bridge, /parseAnalyticsReport/u);
  assert.match(bridge, /response\.body\.getReader\(\)/u);
  assert.match(nginx, /location = \/admin\/analytics \{ return 404; \}/u);
  const eventLocation = nginx.slice(nginx.indexOf("location = /api/analytics/events"), nginx.indexOf("location = /__fusiondigital_analytics_report_v1"));
  const reportLocation = nginx.slice(nginx.indexOf("location = /__fusiondigital_analytics_report_v1"), nginx.indexOf("location = /api/analytics {"));
  assert.match(eventLocation, /access_log off;/u);
  assert.match(eventLocation, /proxy_pass_request_headers off;/u);
  assert.match(eventLocation, /proxy_set_header Origin \$http_origin;/u);
  assert.doesNotMatch(eventLocation, /\$http_x_fd|Cookie|User-Agent|X-Forwarded/u);
  assert.match(reportLocation, /if \(\$scheme != https\) \{ return 404; \}/u);
  assert.match(reportLocation, /access_log off;/u);
  assert.match(reportLocation, /proxy_pass_request_headers off;/u);
  for (const header of ["Timestamp", "Nonce", "Signature"]) {
    assert.match(reportLocation, new RegExp(`X-FD-Analytics-Report-${header}`, "u"));
  }
  assert.doesNotMatch(reportLocation, /Origin|Cookie|User-Agent|X-Forwarded|oai-authenticated/u);
  assert.doesNotMatch(nginx, /fusiondigital_analytics_loggable|log_format fusiondigital_analytics/u);
  assert.match(nginx, /location \^~ \/api\/analytics\/ \{ return 404; \}/u);
  assert.match(tracker, /credentials: "omit"/u);
  assert.match(tracker, /referrerPolicy: "no-referrer"/u);
  assert.match(tracker, /navigator\.doNotTrack === "1"/u);
  assert.doesNotMatch(tracker, /location\.search|document\.cookie|navigator\.userAgent/u);
  assert.match(collector, /pseudonymizeCollectorEvent/u);
  assert.match(collector, /FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET/u);
  assert.match(collector, /FUSIONDIGITAL_ANALYTICS_REPORT_SECRET/u);
  assert.match(collector, /verifyReportRequest/u);
  assert.match(collector, /consumeNonce/u);
  assert.match(worker, /FUSIONDIGITAL_ANALYTICS_REPORT_SECRET\?: string/u);
  assert.match(worker, /globalThis\.__FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__ = env\.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET/u);
  assert.doesNotMatch(worker, /FUSIONDIGITAL_ANALYTICS_INGEST_SECRET/u);
  assert.match(cloudflareEnv, /FUSIONDIGITAL_ANALYTICS_REPORT_SECRET\?: string/u);
  assert.doesNotMatch(cloudflareEnv, /FUSIONDIGITAL_ANALYTICS_INGEST_SECRET/u);
  assert.match(collector, /constants\.O_NOFOLLOW/u);
  assert.match(collector, /console\.error\("FusionDigital analytics collector failed without persisting request data\."\)/u);
  assert.doesNotMatch(collector, /console\.(?:log|error)\(`|console\.(?:log|error)\([^\n]*\$\{/u);
  assert.match(collectorService, /User=fusionanalytics/u);
  assert.match(collectorService, /IPAddressAllow=localhost/u);
  assert.match(collectorService, /ReadWritePaths=\/var\/log\/fusiondigital \/var\/lib\/fusiondigital-analytics/u);
  assert.match(collectorService, /StateDirectory=fusiondigital-analytics/u);
  assert.doesNotMatch(collectorService, /AF_INET6|analytics-forwarder/u);
  assert.match(store, /PRAGMA secure_delete = ON/u);
  assert.match(store, /analytics database capacity contract is unavailable/u);
  assert.match(store, /analytics_report_nonces/u);
  assert.match(installer, /for attempt in \{1\.\.120\}/u);
  assert.match(installer, /--probe >\/dev\/null 2>&1/u);
  assert.match(installer, /systemctl is-active --quiet fusiondigital-analytics-collector\.service \|\| break/u);
  assert.match(installer, /sleep 1/u);
  assert.match(installer, /--report-probe/u);
  assert.match(installer, /--report-tls-probe/u);
  assert.match(installer, /orphan analytics database sidecar/u);
  assert.match(installer, /rm -f -- "\$FORWARDER_SERVICE_FILE" "\$TIMER_FILE"/u);
  assert.doesNotMatch(installer, /systemctl enable --now fusiondigital-analytics-forwarder/u);
  assert.equal(existsSync(new URL("../deploy/aliyun-hk/analytics-forwarder.mjs", import.meta.url)), false);
  assert.match(logrotate, /create 0640 fusionanalytics fusionanalytics/u);
  assert.match(logrotate, /nocompress/u);
  assert.match(migration, /CREATE TABLE `analytics_events`/u);
  assert.match(migration, /`referrer_source` text/u);
  assert.match(migration, /PRAGMA optimize/u);
});

function opaqueForwarded(seed: string): string {
  return seed.padEnd(43, "x");
}

class NodeD1Statement {
  #statement: StatementSync;
  #values: SQLInputValue[] = [];
  constructor(statement: StatementSync) { this.#statement = statement; }
  bind(...values: unknown[]) { this.#values = values as SQLInputValue[]; return this; }
  async run() {
    const result = this.#statement.run(...this.#values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
  async all<T>() { return { success: true, results: this.#statement.all(...this.#values) as T[], meta: {} }; }
  async first<T>(column?: string) {
    const row = this.#statement.get(...this.#values) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
}

class NodeD1 {
  constructor(private database: DatabaseSync) {}
  prepare(query: string) { return new NodeD1Statement(this.database.prepare(query)); }
  async batch(statements: NodeD1Statement[]) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function analyticsDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  const migration = readFileSync(new URL("../drizzle/0002_unique_morbius.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    database.exec(statement);
  }
  return database;
}
