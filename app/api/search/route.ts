import { NextResponse } from "next/server";
import { getIndexMetadata, normalizeFilters, normalizeQuery, normalizeSearchLocale, searchKnowledge, SEARCH_LIMITS } from "@/app/search/search-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = normalizeSearchLocale(url.searchParams.get("locale") || request.headers.get("accept-language"));
  const query = normalizeQuery(url.searchParams.get("q"));
  const filters = normalizeFilters({
    domain: url.searchParams.get("domain"),
    type: url.searchParams.get("type"),
    device: url.searchParams.get("device"),
    yearFrom: url.searchParams.get("yearFrom"),
    yearTo: url.searchParams.get("yearTo"),
    citedOnly: url.searchParams.get("citedOnly"),
  });
  const limit = Math.min(SEARCH_LIMITS.maxResults, Math.max(1, Number(url.searchParams.get("limit")) || SEARCH_LIMITS.defaultResults));
  const results = searchKnowledge(query, filters, limit, locale);
  return NextResponse.json({ query, locale, filters, count: results.length, results, index: getIndexMetadata() }, { headers: publicHeaders() });
}

export async function POST(request: Request) {
  const headerLocale = normalizeSearchLocale(request.headers.get("x-fusiondigital-locale") || request.headers.get("accept-language"));
  if (!isJson(request)) return jsonError("content_type", headerLocale === "en" ? "Requests must use application/json." : "请求必须使用 application/json。", 415);
  const body = await safeJson(request);
  if (!body) return jsonError("invalid_json", headerLocale === "en" ? "The JSON request body is invalid." : "JSON 请求体无效。", 400);
  const locale = normalizeSearchLocale(body.locale || headerLocale);
  const query = normalizeQuery(body.q ?? body.query);
  const filters = normalizeFilters(body.filters);
  const limit = Math.min(SEARCH_LIMITS.maxResults, Math.max(1, Number(body.limit) || SEARCH_LIMITS.defaultResults));
  const results = searchKnowledge(query, filters, limit, locale);
  return NextResponse.json({ query, locale, filters, count: results.length, results, index: getIndexMetadata() }, { headers: publicHeaders() });
}

function publicHeaders() {
  return { "Cache-Control": "public, max-age=60, s-maxage=600", "X-Content-Type-Options": "nosniff" };
}
function isJson(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") === true;
}
async function safeJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > 12_000) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
