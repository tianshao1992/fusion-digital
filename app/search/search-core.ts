import knowledgeIndex from "../../public/data/fusion-knowledge-index.json" with { type: "json" };

export type KnowledgeSource = {
  label: string;
  url: string;
  kind: string;
  detail?: string;
};

export type KnowledgeEntry = {
  id: string;
  entityType: "work" | "paper" | "code" | "tool" | "device" | "framework";
  domains: string[];
  title: string;
  summary: string;
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

export function searchKnowledge(query: string, rawFilters: SearchFilters = {}, requestedLimit: number = SEARCH_LIMITS.defaultResults): SearchHit[] {
  const normalized = normalizeQuery(query);
  const filters = normalizeFilters(rawFilters);
  const limit = Math.max(1, Math.min(SEARCH_LIMITS.maxResults, Number(requestedLimit) || SEARCH_LIMITS.defaultResults));
  const terms = tokenize(normalized);
  const phrase = fold(normalized);

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
      .sort((a, b) => (b.year || 0) - (a.year || 0) || b.sources.length - a.sources.length || a.title.localeCompare(b.title, "zh-CN"))
      .slice(0, limit)
      .map((entry) => toHit(entry, 0, [], entry.summary.slice(0, 280)));
  }

  return candidates.map((entry) => scoreEntry(entry, phrase, terms))
    // Source count is a tie-breaker for relevant records, never a way to
    // manufacture relevance. Phrase-only matches remain valid for short
    // scientific terms that the tokenizer intentionally does not split.
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.sources.length - a.sources.length || (b.year || 0) - (a.year || 0))
    .slice(0, limit);
}

function scoreEntry(entry: KnowledgeEntry, phrase: string, terms: string[]): SearchHit {
  const title = fold(entry.title);
  const organization = fold(entry.organization || "");
  const devices = fold(entry.devices.join(" "));
  const tags = fold(entry.tags.join(" "));
  const summary = fold(entry.summary);
  const sources = fold(entry.sources.map((source) => source.label).join(" "));
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

  for (const term of terms) {
    let termScore = 0;
    if (title.includes(term)) termScore += 24;
    if (devices.includes(term)) termScore += 18;
    if (tags.includes(term)) termScore += 12;
    if (organization.includes(term)) termScore += 8;
    if (summary.includes(term)) termScore += 5;
    if (sources.includes(term)) termScore += 4;
    if (termScore > 0) {
      score += termScore;
      matchedTerms.push(term);
    }
  }
  if (terms.length > 1 && matchedTerms.length === terms.length) score += 25;
  if (score <= 0) {
    return toHit(entry, 0, matchedTerms, excerpt(entry.summary, phrase, terms));
  }
  score += Math.min(entry.sources.length, 3) * 1.5;
  return toHit(entry, Math.round(score * 10) / 10, matchedTerms, excerpt(entry.summary, phrase, terms));
}

function toHit(entry: KnowledgeEntry, score: number, matchedTerms: string[], excerptText: string): SearchHit {
  const { searchText: _searchText, ...publicEntry } = entry;
  void _searchText;
  return { ...publicEntry, score, matchedTerms, excerpt: excerptText };
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
    terms.add(token);
    if (/^[\u3400-\u9fff]{4,}$/.test(token)) {
      for (let index = 0; index <= token.length - 2; index += 1) terms.add(token.slice(index, index + 2));
    }
  }
  return [...terms].slice(0, 30);
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
