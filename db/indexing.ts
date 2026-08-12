import { getD1 } from "./index";

/**
 * Optional search projection. Kept outside migrations because some local
 * SQLite builds omit FTS5; deployment bootstrap may enable it after probing.
 */
export async function ensureSearchProjection(): Promise<void> {
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
        document_id UNINDEXED,
        entity_id UNINDEXED,
        title,
        body,
        aliases,
        tokenize = 'unicode61 remove_diacritics 2'
      )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS idx_entities_search_source ON entities(status, visibility, updated_at)",
    ),
  ]);
}
