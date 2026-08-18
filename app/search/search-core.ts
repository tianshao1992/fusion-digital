import knowledgeIndex from "../../public/data/fusion-knowledge-index.json" with { type: "json" };

export type KnowledgeSource = {
  label: string;
  labelEn?: string;
  url: string;
  kind: string;
  detail?: string;
  detailEn?: string;
};

export type SearchLocale = "zh-CN" | "en";

export type KnowledgeEntry = {
  id: string;
  entityType: "work" | "paper" | "code" | "tool" | "device" | "framework";
  domains: string[];
  title: string;
  titleEn?: string;
  summary: string;
  summaryEn?: string;
  year: number | null;
  organization: string | null;
  devices: string[];
  tags: string[];
  evidenceLevel: string | null;
  deploymentLevel: string | null;
  route: string;
  sources: KnowledgeSource[];
  searchText: string;
};

export type SearchFilters = {
  domain?: string;
  type?: string;
  device?: string;
  yearFrom?: number;
  yearTo?: number;
  citedOnly?: boolean;
};

export type SearchHit = Omit<KnowledgeEntry, "searchText"> & {
  score: number;
  matchedTerms: string[];
  excerpt: string;
};

export const SEARCH_LIMITS = {
  queryChars: 300,
  maxResults: 50,
  defaultResults: 18,
  askSources: 10,
  // Keep the grounded prompt inside the default 32k per-request quota even
  // for CJK-heavy records, whose token density is much higher than English.
  askContextChars: 8_000,
} as const;

const entries = knowledgeIndex.entries as KnowledgeEntry[];
const statistics = knowledgeIndex.statistics;

export function getIndexMetadata() {
  return {
    schemaVersion: knowledgeIndex.schemaVersion,
    generatedAt: knowledgeIndex.generatedAt,
    statistics,
    domains: Object.keys(statistics.byDomain).sort(),
    types: Object.keys(statistics.byType).sort(),
  };
}

export function normalizeQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SEARCH_LIMITS.queryChars);
}

export function normalizeSearchLocale(value: unknown): SearchLocale {
  return typeof value === "string" && value.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

export function normalizeFilters(value: unknown): SearchFilters {
  if (!value || typeof value !== "object") return {};
  const filters = value as Record<string, unknown>;
  const yearFrom = toYear(filters.yearFrom);
  const yearTo = toYear(filters.yearTo);
  return {
    domain: cleanFacet(filters.domain),
    type: cleanFacet(filters.type),
    device: typeof filters.device === "string" ? filters.device.normalize("NFKC").trim().slice(0, 100) : undefined,
    yearFrom,
    yearTo,
    citedOnly: filters.citedOnly === true || filters.citedOnly === "true",
  };
}

export function searchKnowledge(query: string, rawFilters: SearchFilters = {}, requestedLimit: number = SEARCH_LIMITS.defaultResults, rawLocale: unknown = "zh-CN"): SearchHit[] {
  const normalized = normalizeQuery(query);
  const locale = normalizeSearchLocale(rawLocale);
  const filters = normalizeFilters(rawFilters);
  const limit = Math.max(1, Math.min(SEARCH_LIMITS.maxResults, Number(requestedLimit) || SEARCH_LIMITS.defaultResults));
  const terms = tokenize(normalized);
  const phrase = fold(normalized);
  const entityAnchors = extractEntityAnchors(normalized);

  const candidates = entries.filter((entry) => {
    if (filters.domain && !entry.domains.includes(filters.domain)) return false;
    if (filters.type && entry.entityType !== filters.type) return false;
    if (filters.device && !fold(entry.devices.join(" ")).includes(fold(filters.device))) return false;
    if (filters.yearFrom && (!entry.year || entry.year < filters.yearFrom)) return false;
    if (filters.yearTo && (!entry.year || entry.year > filters.yearTo)) return false;
    if (filters.citedOnly && entry.sources.length === 0) return false;
    return true;
  });

  if (!phrase) {
    return candidates
      .sort((a, b) => (b.year || 0) - (a.year || 0) || b.sources.length - a.sources.length || localizedTitle(a, locale).localeCompare(localizedTitle(b, locale), locale))
      .slice(0, limit)
      .map((entry) => toHit(entry, 0, [], localizedSummary(entry, locale).slice(0, 280), locale));
  }

  const scored = candidates.map((entry) => scoreEntry(entry, phrase, terms, locale, entityAnchors))
    // Source count is a tie-breaker for relevant records, never a way to
    // manufacture relevance. Phrase-only matches remain valid for short
    // scientific terms that the tokenizer intentionally does not split.
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.sources.length - a.sources.length || (b.year || 0) - (a.year || 0));
  const ordered = /\b(?:compare|comparison|versus|vs\.?|between)\b/i.test(normalized)
    ? prioritizeComparedEntities(scored, terms)
    : scored;
  return ordered.slice(0, limit);
}

function scoreEntry(entry: KnowledgeEntry, phrase: string, terms: string[], locale: SearchLocale, entityAnchors: string[]): SearchHit {
  const title = fold(`${entry.title} ${entry.titleEn || ""}`);
  const organization = fold(entry.organization || "");
  const devices = fold(entry.devices.join(" "));
  const tags = fold(entry.tags.join(" "));
  const summary = fold(`${entry.summary} ${entry.summaryEn || ""}`);
  const sources = fold(entry.sources.flatMap((source) => [source.label, source.labelEn || ""]).join(" "));
  let score = 0;
  const matchedTerms: string[] = [];

  if (title === phrase) score += 180;
  else if (title.startsWith(phrase)) score += 100;
  else if (title.includes(phrase)) score += 72;
  if (devices.includes(phrase)) score += 55;
  if (tags.includes(phrase)) score += 35;
  if (organization.includes(phrase)) score += 24;
  if (summary.includes(phrase)) score += 20;
  if (sources.includes(phrase)) score += 18;
  for (const anchor of entityAnchors) {
    if (title.includes(anchor)) score += 180;
    else if (devices.includes(anchor) || tags.includes(anchor)) score += 90;
  }

  for (const term of terms) {
    let termScore = 0;
    const forms = wordForms(term);
    if (forms.some((form) => title.includes(form))) termScore += 42;
    if (forms.some((form) => devices.includes(form))) termScore += 24;
    if (forms.some((form) => tags.includes(form))) termScore += 16;
    if (forms.some((form) => organization.includes(form))) termScore += 10;
    if (forms.some((form) => summary.includes(form))) termScore += 6;
    if (forms.some((form) => sources.includes(form))) termScore += 5;
    if (termScore > 0) {
      score += termScore;
      matchedTerms.push(term);
    }
  }
  if (terms.length > 1 && matchedTerms.length === terms.length) score += 25;
  if (score <= 0) {
    return toHit(entry, 0, matchedTerms, excerpt(localizedSummary(entry, locale), phrase, terms), locale);
  }
  score += Math.min(entry.sources.length, 3) * 1.5;
  return toHit(entry, Math.round(score * 10) / 10, matchedTerms, excerpt(localizedSummary(entry, locale), phrase, terms), locale);
}

function toHit(entry: KnowledgeEntry, score: number, matchedTerms: string[], excerptText: string, locale: SearchLocale): SearchHit {
  const { searchText: _searchText, ...publicEntry } = entry;
  void _searchText;
  if (locale === "zh-CN") return { ...publicEntry, score, matchedTerms, excerpt: excerptText };
  return {
    ...publicEntry,
    title: localizedTitle(entry, locale),
    summary: localizedSummary(entry, locale),
    organization: englishDisplay(entry.organization) || null,
    devices: entry.devices.map(englishDisplay).filter(Boolean),
    tags: entry.tags.map(englishDisplay).filter(Boolean),
    evidenceLevel: englishDisplay(entry.evidenceLevel) || null,
    deploymentLevel: englishDisplay(entry.deploymentLevel) || null,
    sources: entry.sources.map((source) => ({
      ...source,
      label: source.labelEn || englishDisplay(source.label) || sourceKindLabel(source.kind),
      detail: source.detailEn || englishDisplay(source.detail) || undefined,
    })),
    score,
    matchedTerms,
    excerpt: excerptText,
  };
}

function excerpt(content: string, phrase: string, terms: string[]): string {
  const folded = fold(content);
  const needles = [phrase, ...terms].filter(Boolean);
  let index = -1;
  for (const needle of needles) {
    const candidate = folded.indexOf(needle);
    if (candidate >= 0 && (index < 0 || candidate < index)) index = candidate;
  }
  const start = Math.max(0, index < 0 ? 0 : index - 80);
  const end = Math.min(content.length, start + 360);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

function tokenize(value: string): string[] {
  const folded = fold(value);
  const raw = folded.match(/[a-z0-9][a-z0-9.+#/_-]{1,}|[\u3400-\u9fff]{2,}/g) || [];
  const terms = new Set<string>();
  for (const token of raw) {
    if (/^[a-z]/.test(token) && ENGLISH_STOPWORDS.has(token)) continue;
    terms.add(token);
    if (/^[\u3400-\u9fff]{4,}$/.test(token)) {
      for (let index = 0; index <= token.length - 2; index += 1) terms.add(token.slice(index, index + 2));
    }
  }
  return [...terms].slice(0, 30);
}

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "between", "by", "can", "compare", "comparison", "do", "does", "for", "from", "how", "in", "into", "is", "it", "its", "of", "on", "or", "please", "that", "the", "their", "them", "these", "this", "to", "used", "uses", "versus", "vs", "what", "when", "where", "which", "who", "why", "with",
]);

function wordForms(term: string): string[] {
  const forms = new Set([term]);
  if (!/^[a-z][a-z0-9-]{3,}$/.test(term)) return [...forms];
  if (term.endsWith("ies") && term.length > 4) forms.add(`${term.slice(0, -3)}y`);
  if (term.endsWith("ing") && term.length > 5) forms.add(term.slice(0, -3));
  if (term.endsWith("ed") && term.length > 4) forms.add(term.slice(0, -2));
  if (term.endsWith("es") && term.length > 4) forms.add(term.slice(0, -2));
  if (term.endsWith("s") && !term.endsWith("ss") && term.length > 3) forms.add(term.slice(0, -1));
  return [...forms];
}

function prioritizeComparedEntities(hits: SearchHit[], terms: string[]): SearchHit[] {
  const entityTerms = terms.filter((term) => /^[a-z0-9][a-z0-9.+#/_-]{2,}$/i.test(term));
  if (entityTerms.length < 2) return hits;
  const selected: SearchHit[] = [];
  const selectedIds = new Set<string>();
  for (const term of entityTerms.slice(0, 6)) {
    const candidate = hits.find((hit) => !selectedIds.has(hit.id) && fold(`${hit.title} ${hit.devices.join(" ")} ${hit.tags.join(" ")}`).includes(term));
    if (candidate) {
      selected.push(candidate);
      selectedIds.add(candidate.id);
    }
  }
  return [...selected, ...hits.filter((hit) => !selectedIds.has(hit.id))];
}

function extractEntityAnchors(value: string) {
  return [...new Set((value.match(/\b[A-Z][A-Z0-9.+#/_-]{2,}\b/g) || []).map((item) => fold(item)))].slice(0, 8);
}

function localizedTitle(entry: KnowledgeEntry, locale: SearchLocale) {
  return locale === "en" ? entry.titleEn || englishDisplay(entry.title) || "FusionDigital knowledge record" : entry.title;
}

function localizedSummary(entry: KnowledgeEntry, locale: SearchLocale) {
  return locale === "en" ? entry.summaryEn || englishDisplay(entry.summary) || `Curated FusionDigital record for ${localizedTitle(entry, locale)}.` : entry.summary;
}

function englishDisplay(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\u3400-\u9fff]+/gu, " ").replace(/[，。；：！？、（）【】《》“”‘’·—–]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function sourceKindLabel(kind: string) {
  return ({ paper: "Research paper", code: "Software repository", tool: "Official tool source", facility: "Facility source" } as Record<string, string>)[kind] || "Evidence source";
}

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[，。；：！？、（）【】《》“”‘’·—–-]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanFacet(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z0-9-]{1,40}$/i.test(value) ? value : undefined;
}

function toYear(value: unknown): number | undefined {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined;
}
