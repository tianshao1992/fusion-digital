export const ANALYTICS_TIME_ZONE = "Asia/Shanghai" as const;

export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "content_view",
  "engagement",
] as const;

export const ANALYTICS_DEVICE_CLASSES = [
  "desktop",
  "tablet",
  "mobile",
  "other",
] as const;

export const ANALYTICS_SOURCES = ["club"] as const;

export const ANALYTICS_REFERRER_SOURCES = [
  "search:google",
  "search:bing",
  "search:baidu",
  "search:other",
  "ai:chatgpt",
  "code:github",
  "social:wechat",
  "social:zhihu",
  "social:other",
  "other",
] as const;

export const ANALYTICS_REPORT_DAYS = [7, 30, 90] as const;

export const PUBLIC_ANALYTICS_PATHS = new Set([
  "/",
  "/ai",
  "/control",
  "/data-foundation",
  "/diagnostics",
  "/digital-prototype",
  "/engineering",
  "/facilities",
  "/fusion-data",
  "/knowledge-graph",
  "/physics",
  "/platform",
  "/roadmap",
  "/search",
]);

export const HOME_ANALYTICS_SECTIONS = new Set([
  "community",
  "domains",
  "prototype-workspace",
  "resources",
]);

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];
export type AnalyticsDeviceClass = (typeof ANALYTICS_DEVICE_CLASSES)[number];
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];
export type AnalyticsReferrerSource = (typeof ANALYTICS_REFERRER_SOURCES)[number];
export type AnalyticsReportDays = (typeof ANALYTICS_REPORT_DAYS)[number];

export type AnalyticsEventInput = {
  eventId: string;
  eventType: AnalyticsEventType;
  visitorId: string;
  sessionId: string;
  path: string;
  contentKey?: string | null;
  referrerSource?: AnalyticsReferrerSource | null;
  deviceClass: AnalyticsDeviceClass;
  durationMs?: number | null;
};

export type StoredAnalyticsEvent = AnalyticsEventInput & {
  source: AnalyticsSource;
  occurredAt: string;
  occurredDate: string;
};

export type AnalyticsSummary = {
  dau: number;
  wau: number;
  mau: number;
  visitors: number;
  pageViews: number;
  sessions: number;
  bounceRate: number;
  averageEngagedSeconds: number;
};

export type AnalyticsDailyPoint = {
  date: string;
  pageViews: number;
  visitors: number;
  sessions: number;
};

export type AnalyticsContentRow = {
  path: string;
  contentKey: string | null;
  displayLabel: string | null;
  views: number;
  visitors: number;
  averageEngagedSeconds: number;
};

export type AnalyticsHeatmapPoint = {
  weekday: number;
  hour: number;
  pageViews: number;
};

export type AnalyticsBreakdownRow = {
  key: string;
  pageViews: number;
  visitors: number;
};

export type AnalyticsRecentSession = {
  sessionLabel: string;
  visitorLabel: string;
  startedAt: string;
  endedAt: string;
  pageViews: number;
  engagedSeconds: number;
  entryPath: string;
  exitPath: string;
  journey: string[];
  referrerSource: AnalyticsReferrerSource | null;
  deviceClass: AnalyticsDeviceClass;
  source: AnalyticsSource;
};

export type AnalyticsReport = {
  days: AnalyticsReportDays;
  startDate: string;
  endDate: string;
  timeZone: typeof ANALYTICS_TIME_ZONE;
  updatedAt: string | null;
  summary: AnalyticsSummary;
  daily: AnalyticsDailyPoint[];
  topContent: AnalyticsContentRow[];
  hourlyHeatmap: AnalyticsHeatmapPoint[];
  sourceBreakdown: AnalyticsBreakdownRow[];
  deviceBreakdown: AnalyticsBreakdownRow[];
  recentSessions: AnalyticsRecentSession[];
};

const ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/u;
const CONTENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/=|+-]{0,159}$/u;
const EVENT_INPUT_FIELDS = new Set([
  "eventId", "eventType", "visitorId", "sessionId", "path", "contentKey",
  "referrerSource", "deviceClass", "durationMs",
]);
const PROTOTYPE_DEVICES = new Set([
  "paramak-full-device",
  "exl-50u-2026-upgrade",
  "exl50u-general-assembly-20260630",
  "ehl-2-preliminary",
  "iter-educational-model",
]);
const EFIT_SHOTS = new Set([
  "18301", "18303", "18304", "18308", "20213", "20289", "20666", "20669", "20707", "20708",
]);
const SEARCH_CONTENT_PATTERN = /^search:domain=(?:all|physics|engineering|control|diagnostics|energy|auxiliary|data|hmi|integration|ai-native|facilities)\|type=(?:all|work|paper|code|tool|device|framework)\|cited=(?:yes|no)\|results=(?:0|1-4|5-14|15\+)$/u;
const KNOWLEDGE_CONTENT_PATTERN = /^knowledge-node:[a-f0-9]{16}$/u;

export function parseAnalyticsEventInput(value: unknown): AnalyticsEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Analytics event must be an object");
  }
  const input = value as Record<string, unknown>;
  const unknownField = Object.keys(input).find((field) => !EVENT_INPUT_FIELDS.has(field));
  if (unknownField) throw new TypeError(`Analytics event contains an unsupported field: ${unknownField}`);
  const eventId = boundedId(input.eventId, "eventId");
  const visitorId = boundedId(input.visitorId, "visitorId");
  const sessionId = boundedId(input.sessionId, "sessionId");
  const eventType = enumValue(input.eventType, ANALYTICS_EVENT_TYPES, "eventType");
  const deviceClass = enumValue(input.deviceClass, ANALYTICS_DEVICE_CLASSES, "deviceClass");
  const path = normalizeAnalyticsPath(input.path);
  const contentKey = normalizeAnalyticsContentKey(input.contentKey);
  const referrerSource = normalizeAnalyticsReferrerSource(input.referrerSource);
  const durationMs = optionalDuration(input.durationMs);

  if (eventType === "engagement" && durationMs === null) {
    throw new TypeError("engagement events require durationMs");
  }
  if (eventType !== "engagement" && durationMs !== null) {
    throw new TypeError("durationMs is only accepted for engagement events");
  }
  if (eventType === "content_view" && !contentKey) {
    throw new TypeError("content_view events require contentKey");
  }
  if (eventType !== "page_view" && referrerSource !== null) {
    throw new TypeError("referrerSource is only accepted for page_view events");
  }
  assertApprovedAnalyticsContent(eventType, path, contentKey);

  return {
    eventId,
    eventType,
    visitorId,
    sessionId,
    path,
    contentKey,
    referrerSource,
    deviceClass,
    durationMs,
  };
}

export function normalizeAnalyticsPath(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("path must be a string");
  const path = value.trim();
  if (!PUBLIC_ANALYTICS_PATHS.has(path)) {
    throw new TypeError("path is not an approved public analytics route");
  }
  return path;
}

export function normalizeAnalyticsContentKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError("contentKey must be a string");
  const key = value.normalize("NFKC").trim();
  if (!CONTENT_KEY_PATTERN.test(key)) throw new TypeError("contentKey is invalid");
  return key;
}

export function normalizeAnalyticsReferrerSource(value: unknown): AnalyticsReferrerSource | null {
  if (value === undefined || value === null || value === "") return null;
  return enumValue(value, ANALYTICS_REFERRER_SOURCES, "referrerSource");
}

export function classifyAnalyticsReferrerHost(value: unknown): AnalyticsReferrerSource | null {
  if (typeof value !== "string") return null;
  const host = value.toLocaleLowerCase("en-US").trim().replace(/\.$/u, "");
  if (!host.includes(".") || host.length > 253 || /^\d+(?:\.\d+){3}$/u.test(host) || host.includes(":")) return "other";
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (matches("google.com") || matches("google.com.hk")) return "search:google";
  if (matches("bing.com")) return "search:bing";
  if (matches("baidu.com")) return "search:baidu";
  if (matches("sogou.com") || matches("so.com")) return "search:other";
  if (matches("chatgpt.com") || matches("chatgpt.site") || matches("openai.com")) return "ai:chatgpt";
  if (matches("github.com")) return "code:github";
  if (matches("weixin.qq.com") || matches("mp.weixin.qq.com")) return "social:wechat";
  if (matches("zhihu.com")) return "social:zhihu";
  if (matches("x.com") || matches("twitter.com") || matches("linkedin.com") || matches("weibo.com")) return "social:other";
  return "other";
}

export function resolveAnalyticsDays(value: unknown): AnalyticsReportDays {
  const parsed = Number(value);
  return ANALYTICS_REPORT_DAYS.includes(parsed as AnalyticsReportDays)
    ? parsed as AnalyticsReportDays
    : 30;
}

export function shanghaiDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function analyticsPublicIdDigest(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseAnalyticsReport(value: unknown): AnalyticsReport {
  const report = reportRecord(value, "report");
  const summary = reportRecord(report.summary, "report.summary");
  const days = report.days;
  if (!ANALYTICS_REPORT_DAYS.includes(days as AnalyticsReportDays)) throw new TypeError("report.days is invalid");
  for (const field of ["dau", "wau", "mau", "visitors", "pageViews", "sessions", "averageEngagedSeconds"] as const) {
    reportNumber(summary[field], `report.summary.${field}`);
  }
  const bounceRate = reportNumber(summary.bounceRate, "report.summary.bounceRate");
  if (bounceRate > 1) throw new TypeError("report.summary.bounceRate is invalid");
  reportDate(report.startDate, "report.startDate");
  reportDate(report.endDate, "report.endDate");
  if (report.timeZone !== ANALYTICS_TIME_ZONE) throw new TypeError("report.timeZone is invalid");
  if (report.updatedAt !== null) reportDateTime(report.updatedAt, "report.updatedAt");
  for (const [index, value] of reportArray(report.daily, "report.daily", 90).entries()) {
    const row = reportRecord(value, `report.daily[${index}]`);
    reportDate(row.date, `report.daily[${index}].date`);
    for (const field of ["pageViews", "visitors", "sessions"] as const) reportNumber(row[field], `report.daily[${index}].${field}`);
  }
  for (const [index, value] of reportArray(report.topContent, "report.topContent", 80).entries()) {
    const row = reportRecord(value, `report.topContent[${index}]`);
    reportString(row.path, `report.topContent[${index}].path`, 160);
    reportNullableString(row.contentKey, `report.topContent[${index}].contentKey`, 160);
    reportNullableString(row.displayLabel, `report.topContent[${index}].displayLabel`, 200);
    for (const field of ["views", "visitors", "averageEngagedSeconds"] as const) reportNumber(row[field], `report.topContent[${index}].${field}`);
  }
  for (const [index, value] of reportArray(report.hourlyHeatmap, "report.hourlyHeatmap", 168).entries()) {
    const row = reportRecord(value, `report.hourlyHeatmap[${index}]`);
    const weekday = reportNumber(row.weekday, `report.hourlyHeatmap[${index}].weekday`);
    const hour = reportNumber(row.hour, `report.hourlyHeatmap[${index}].hour`);
    reportNumber(row.pageViews, `report.hourlyHeatmap[${index}].pageViews`);
    if (!Number.isInteger(weekday) || weekday > 6 || !Number.isInteger(hour) || hour > 23) throw new TypeError("report.hourlyHeatmap has an invalid coordinate");
  }
  for (const [field, maximum] of [["sourceBreakdown", ANALYTICS_SOURCES.length], ["deviceBreakdown", ANALYTICS_DEVICE_CLASSES.length]] as const) {
    for (const [index, value] of reportArray(report[field], `report.${field}`, maximum).entries()) {
      const row = reportRecord(value, `report.${field}[${index}]`);
      reportString(row.key, `report.${field}[${index}].key`, 32);
      reportNumber(row.pageViews, `report.${field}[${index}].pageViews`);
      reportNumber(row.visitors, `report.${field}[${index}].visitors`);
    }
  }
  for (const [index, value] of reportArray(report.recentSessions, "report.recentSessions", 40).entries()) {
    const row = reportRecord(value, `report.recentSessions[${index}]`);
    reportString(row.sessionLabel, `report.recentSessions[${index}].sessionLabel`, 32);
    reportString(row.visitorLabel, `report.recentSessions[${index}].visitorLabel`, 32);
    reportDateTime(row.startedAt, `report.recentSessions[${index}].startedAt`);
    reportDateTime(row.endedAt, `report.recentSessions[${index}].endedAt`);
    reportNumber(row.pageViews, `report.recentSessions[${index}].pageViews`);
    reportNumber(row.engagedSeconds, `report.recentSessions[${index}].engagedSeconds`);
    reportString(row.entryPath, `report.recentSessions[${index}].entryPath`, 240);
    reportString(row.exitPath, `report.recentSessions[${index}].exitPath`, 240);
    for (const [step, journey] of reportArray(row.journey, `report.recentSessions[${index}].journey`, 16).entries()) {
      reportString(journey, `report.recentSessions[${index}].journey[${step}]`, 240);
    }
    reportNullableString(row.referrerSource, `report.recentSessions[${index}].referrerSource`, 32);
    if (!ANALYTICS_DEVICE_CLASSES.includes(row.deviceClass as AnalyticsDeviceClass)) throw new TypeError("report.recentSessions has an invalid deviceClass");
    if (!ANALYTICS_SOURCES.includes(row.source as AnalyticsSource)) throw new TypeError("report.recentSessions has an invalid source");
  }
  return value as AnalyticsReport;
}

function assertApprovedAnalyticsContent(eventType: AnalyticsEventType, path: string, contentKey: string | null): void {
  if (contentKey === null) return;
  const detailEvent = eventType === "content_view" || eventType === "engagement";
  const approved = (
    (path === "/" && (eventType === "page_view" || eventType === "engagement")
      && contentKey.startsWith("section:") && HOME_ANALYTICS_SECTIONS.has(contentKey.slice("section:".length)))
    || (path === "/" && detailEvent && contentKey.startsWith("prototype-device:")
      && PROTOTYPE_DEVICES.has(contentKey.slice("prototype-device:".length)))
    || (path === "/" && detailEvent && contentKey.startsWith("efit-shot:")
      && EFIT_SHOTS.has(contentKey.slice("efit-shot:".length)))
    || (path === "/knowledge-graph" && detailEvent && KNOWLEDGE_CONTENT_PATTERN.test(contentKey))
    || (path === "/search" && detailEvent && SEARCH_CONTENT_PATTERN.test(contentKey))
  );
  if (!approved) throw new TypeError("contentKey is not approved for this route and event type");
}

function reportRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function reportArray(value: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${field} is invalid`);
  return value;
}

function reportNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError(`${field} is invalid`);
  return value;
}

function reportDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new TypeError(`${field} is invalid`);
  return value;
}

function reportDateTime(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(new Date(value).getTime())) throw new TypeError(`${field} is invalid`);
  return value;
}

function reportString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new TypeError(`${field} is invalid`);
  return value;
}

function reportNullableString(value: unknown, field: string, maximum: number): string | null {
  if (value === null) return null;
  return reportString(value, field, maximum);
}

function boundedId(value: unknown, field: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be an opaque base64url identifier`);
  }
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new TypeError(`${field} is invalid`);
  }
  return value as T[number];
}

function optionalDuration(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1_000 || (value as number) > 30 * 60 * 1_000) {
    throw new TypeError("durationMs must be between 1 second and 30 minutes");
  }
  return value as number;
}
