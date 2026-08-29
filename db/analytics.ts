import {
  ANALYTICS_TIME_ZONE,
  analyticsPublicIdDigest,
  type AnalyticsBreakdownRow,
  type AnalyticsContentRow,
  type AnalyticsDailyPoint,
  type AnalyticsDeviceClass,
  type AnalyticsHeatmapPoint,
  type AnalyticsRecentSession,
  type AnalyticsReferrerSource,
  type AnalyticsReport,
  type AnalyticsReportDays,
  type AnalyticsSource,
  type StoredAnalyticsEvent,
  shanghaiDate,
} from "@/app/analytics/contracts";
import { analyticsContentDisplayLabel } from "@/app/analytics/content-labels";
import { getD1 } from "./index";

const RAW_RETENTION_DAYS = 120;
const MAX_RECENT_SESSIONS = 40;
const MAX_JOURNEY_STEPS = 16;

export async function insertAnalyticsEvents(events: readonly StoredAnalyticsEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  if (events.length > 250) throw new TypeError("An analytics batch may contain at most 250 events");

  const d1 = getD1();
  for (let offset = 0; offset < events.length; offset += 50) {
    const statements = events.slice(offset, offset + 50).map((event) => d1.prepare(
      `INSERT OR IGNORE INTO analytics_events
        (id, source, event_type, visitor_id, session_id, path, content_key,
         referrer_source, device_class, duration_ms, occurred_at, occurred_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.eventId,
      event.source,
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
    ));
    await d1.batch(statements);
  }

  await deleteExpiredAnalyticsEvents();
  return events.length;
}

export async function deleteExpiredAnalyticsEvents(): Promise<void> {
  await getD1().prepare(
    "DELETE FROM analytics_events WHERE occurred_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
  ).bind(`-${RAW_RETENTION_DAYS} days`).run();
}

export async function getAnalyticsReport(
  days: AnalyticsReportDays,
  now = new Date(),
): Promise<AnalyticsReport> {
  await deleteExpiredAnalyticsEvents();
  const { startDate, endDate, dates } = analyticsDateWindow(days, now);
  const monthStart = `${endDate.slice(0, 7)}-01`;
  const weekStart = analyticsDateWindow(7, now).startDate;
  const queryStart = startDate < monthStart ? startDate : monthStart;
  const d1 = getD1();

  const summary = await d1.prepare(
    `SELECT
       coalesce(sum(CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN 1 ELSE 0 END), 0) AS page_views,
       count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN visitor_id END) AS visitors,
       count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN session_id END) AS sessions,
       count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date = ? THEN visitor_id END) AS dau,
       count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN visitor_id END) AS wau,
       count(DISTINCT CASE WHEN event_type = 'page_view' AND occurred_date >= ? THEN visitor_id END) AS mau,
       coalesce(avg(CASE WHEN event_type = 'engagement' AND occurred_date >= ? THEN duration_ms END), 0) AS average_duration_ms,
       max(CASE WHEN occurred_date >= ? THEN occurred_at END) AS updated_at
     FROM analytics_events
     WHERE occurred_date BETWEEN ? AND ?`,
  ).bind(startDate, startDate, startDate, endDate, weekStart, monthStart, startDate, startDate, queryStart, endDate)
    .first<SummaryQueryRow>();

  const bounce = await d1.prepare(
    `SELECT count(*) AS session_count,
       coalesce(sum(CASE WHEN page_views = 1 THEN 1 ELSE 0 END), 0) AS bounced_sessions
     FROM (
       SELECT session_id, count(*) AS page_views
       FROM analytics_events
       WHERE event_type = 'page_view' AND occurred_date BETWEEN ? AND ?
       GROUP BY session_id
     )`,
  ).bind(startDate, endDate).first<BounceQueryRow>();

  const dailyRows = await d1.prepare(
    `SELECT occurred_date AS date,
       sum(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
       count(DISTINCT CASE WHEN event_type = 'page_view' THEN visitor_id END) AS visitors,
       count(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END) AS sessions
     FROM analytics_events
     WHERE occurred_date BETWEEN ? AND ?
     GROUP BY occurred_date
     ORDER BY occurred_date`,
  ).bind(startDate, endDate).all<DailyQueryRow>();

  const topRows = await d1.prepare(
    `SELECT path, content_key,
       sum(CASE WHEN event_type IN ('page_view', 'content_view') THEN 1 ELSE 0 END) AS views,
       count(DISTINCT CASE WHEN event_type IN ('page_view', 'content_view') THEN visitor_id END) AS visitors,
       coalesce(avg(CASE WHEN event_type = 'engagement' THEN duration_ms END), 0) AS average_duration_ms
     FROM analytics_events
     WHERE occurred_date BETWEEN ? AND ?
     GROUP BY path, content_key
     HAVING sum(CASE WHEN event_type IN ('page_view', 'content_view') THEN 1 ELSE 0 END) > 0
     ORDER BY views DESC, visitors DESC, path, content_key
     LIMIT 80`,
  ).bind(startDate, endDate).all<ContentQueryRow>();

  const heatmapRows = await d1.prepare(
    `SELECT cast(strftime('%w', occurred_at, '+8 hours') AS integer) AS weekday,
       cast(strftime('%H', occurred_at, '+8 hours') AS integer) AS hour,
       count(*) AS page_views
     FROM analytics_events
     WHERE event_type = 'page_view' AND occurred_date BETWEEN ? AND ?
     GROUP BY weekday, hour
     ORDER BY weekday, hour`,
  ).bind(startDate, endDate).all<HeatmapQueryRow>();

  const sourceRows = await breakdownQuery("source", startDate, endDate);
  const deviceRows = await breakdownQuery("device_class", startDate, endDate);
  const recentSessions = await recentSessionQuery(startDate, endDate);
  const dailyByDate = new Map((dailyRows.results ?? []).map((row) => [row.date, row]));
  const sessionCount = integer(bounce?.session_count);
  const bouncedSessions = integer(bounce?.bounced_sessions);

  return {
    days,
    startDate,
    endDate,
    timeZone: ANALYTICS_TIME_ZONE,
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
    daily: dates.map((date): AnalyticsDailyPoint => {
      const row = dailyByDate.get(date);
      return {
        date,
        pageViews: integer(row?.page_views),
        visitors: integer(row?.visitors),
        sessions: integer(row?.sessions),
      };
    }),
    topContent: (topRows.results ?? []).map((row): AnalyticsContentRow => ({
      path: row.path,
      contentKey: row.content_key,
      displayLabel: analyticsContentDisplayLabel(row.content_key),
      views: integer(row.views),
      visitors: integer(row.visitors),
      averageEngagedSeconds: millisecondsToSeconds(row.average_duration_ms),
    })),
    hourlyHeatmap: (heatmapRows.results ?? []).map((row): AnalyticsHeatmapPoint => ({
      weekday: integer(row.weekday),
      hour: integer(row.hour),
      pageViews: integer(row.page_views),
    })),
    sourceBreakdown: sourceRows,
    deviceBreakdown: deviceRows,
    recentSessions,
  };
}

export function analyticsDateWindow(days: AnalyticsReportDays, now = new Date()) {
  const endDate = shanghaiDate(now);
  const endUtc = new Date(`${endDate}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(new Date(endUtc.getTime() - offset * 86_400_000).toISOString().slice(0, 10));
  }
  return { startDate: dates[0], endDate, dates };
}

async function breakdownQuery(
  field: "source" | "device_class",
  startDate: string,
  endDate: string,
): Promise<AnalyticsBreakdownRow[]> {
  const rows = await getD1().prepare(
    `SELECT ${field} AS key, count(*) AS page_views, count(DISTINCT visitor_id) AS visitors
     FROM analytics_events
     WHERE event_type = 'page_view' AND occurred_date BETWEEN ? AND ?
     GROUP BY ${field}
     ORDER BY page_views DESC, key`,
  ).bind(startDate, endDate).all<BreakdownQueryRow>();
  return (rows.results ?? []).map((row) => ({
    key: row.key,
    pageViews: integer(row.page_views),
    visitors: integer(row.visitors),
  }));
}

async function recentSessionQuery(startDate: string, endDate: string): Promise<AnalyticsRecentSession[]> {
  const d1 = getD1();
  const sessionRows = await d1.prepare(
    `SELECT session_id, visitor_id, source, device_class,
       min(occurred_at) AS started_at, max(occurred_at) AS ended_at,
       sum(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
       coalesce(sum(CASE WHEN event_type = 'engagement' THEN duration_ms ELSE 0 END), 0) AS engaged_ms,
       max(referrer_source) AS referrer_source
     FROM analytics_events
     WHERE occurred_date BETWEEN ? AND ?
     GROUP BY session_id, visitor_id, source, device_class
     HAVING sum(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) > 0
     ORDER BY ended_at DESC, session_id
     LIMIT ?`,
  ).bind(startDate, endDate, MAX_RECENT_SESSIONS).all<SessionQueryRow>();
  const sessions = sessionRows.results ?? [];
  if (sessions.length === 0) return [];

  const ids = sessions.map((row) => row.session_id);
  const placeholders = ids.map(() => "?").join(", ");
  const journeyRows = await d1.prepare(
    `SELECT session_id, path, content_key, occurred_at
     FROM analytics_events
     WHERE event_type IN ('page_view', 'content_view') AND session_id IN (${placeholders})
     ORDER BY occurred_at, id`,
  ).bind(...ids).all<JourneyQueryRow>();
  const journeys = new Map<string, string[]>();
  for (const event of journeyRows.results ?? []) {
    const journey = journeys.get(event.session_id) ?? [];
    const label = analyticsContentDisplayLabel(event.content_key);
    const step = label ? `${event.path}#${label}` : event.path;
    if (journey[journey.length - 1] !== step && journey.length < MAX_JOURNEY_STEPS) {
      journey.push(step);
    }
    journeys.set(event.session_id, journey);
  }

  return sessions.map((row): AnalyticsRecentSession => {
    const journey = journeys.get(row.session_id) ?? [];
    return {
      sessionLabel: `S-${analyticsPublicIdDigest(row.session_id).slice(0, 10)}`,
      visitorLabel: `V-${analyticsPublicIdDigest(row.visitor_id).slice(0, 10)}`,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pageViews: integer(row.page_views),
      engagedSeconds: millisecondsToSeconds(row.engaged_ms),
      entryPath: journey[0] ?? "/",
      exitPath: journey[journey.length - 1] ?? journey[0] ?? "/",
      journey,
      referrerSource: row.referrer_source,
      deviceClass: row.device_class,
      source: row.source,
    };
  });
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function millisecondsToSeconds(value: unknown): number {
  const milliseconds = Number(value ?? 0);
  return Number.isFinite(milliseconds) ? Math.max(0, Math.round(milliseconds / 100) / 10) : 0;
}

type SummaryQueryRow = {
  page_views: number;
  visitors: number;
  sessions: number;
  dau: number;
  wau: number;
  mau: number;
  average_duration_ms: number;
  updated_at: string | null;
};
type BounceQueryRow = { session_count: number; bounced_sessions: number };
type DailyQueryRow = { date: string; page_views: number; visitors: number; sessions: number };
type ContentQueryRow = { path: string; content_key: string | null; views: number; visitors: number; average_duration_ms: number };
type HeatmapQueryRow = { weekday: number; hour: number; page_views: number };
type BreakdownQueryRow = { key: string; page_views: number; visitors: number };
type SessionQueryRow = {
  session_id: string;
  visitor_id: string;
  source: AnalyticsSource;
  device_class: AnalyticsDeviceClass;
  started_at: string;
  ended_at: string;
  page_views: number;
  engaged_ms: number;
  referrer_source: AnalyticsReferrerSource | null;
};
type JourneyQueryRow = { session_id: string; path: string; content_key: string | null; occurred_at: string };
