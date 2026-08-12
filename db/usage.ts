import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "./index";
import { newId } from "./ids";
import { stringifyJson, type JsonValue } from "./json";
import { usageEvents } from "./schema";

export type EffectiveQuota = {
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  maxTokensPerRequest: number;
};

export const DEFAULT_QUOTA: Readonly<EffectiveQuota> = Object.freeze({
  dailyRequestLimit: 50,
  dailyTokenLimit: 500_000,
  maxTokensPerRequest: 32_000,
});

export type UsageReservation = {
  id: string;
  requestId: string;
  status: "reserved" | "succeeded" | "failed" | "cancelled";
  reservedTokens: number;
  expiresAt: string;
  idempotent: boolean;
};

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  constructor(message = "Daily AI usage quota exceeded") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Reserves quota with one atomic INSERT...SELECT. The event ledger, rather than
 * the daily summary cache, is authoritative under concurrent requests.
 */
export async function reserveUsage(input: {
  userId: string;
  requestId: string;
  capability: string;
  provider: string;
  model?: string | null;
  requestedTokens: number;
  quota?: EffectiveQuota;
  metadata?: Record<string, JsonValue>;
}): Promise<UsageReservation> {
  const quota = input.quota ?? DEFAULT_QUOTA;
  const requestedTokens = toNonNegativeInteger(input.requestedTokens, "requestedTokens");
  if (requestedTokens > quota.maxTokensPerRequest) {
    throw new QuotaExceededError("Requested token budget exceeds the per-request limit");
  }
  if (quota.dailyRequestLimit < 1 || quota.dailyTokenLimit < requestedTokens) {
    throw new QuotaExceededError();
  }

  const usageDate = utcDate();
  const id = newId("use");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();
  const inserted = await getD1()
    .prepare(
      `INSERT INTO usage_events
        (id, user_id, request_id, usage_date, capability, provider, model, status,
         reserved_tokens, input_tokens, output_tokens, metadata_json, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, 0, 0, ?, ?
       WHERE
         (SELECT count(*) FROM usage_events
          WHERE user_id = ? AND usage_date = ?
            AND (status != 'reserved' OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) < ?
         AND
         (SELECT coalesce(sum(
           CASE WHEN status = 'reserved' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN reserved_tokens
                WHEN status IN ('succeeded', 'failed') THEN input_tokens + output_tokens
                ELSE 0 END
         ), 0) FROM usage_events
          WHERE user_id = ? AND usage_date = ?) + ? <= ?
       ON CONFLICT(request_id) DO NOTHING
       RETURNING id, request_id, status, reserved_tokens, expires_at`,
    )
    .bind(
      id,
      input.userId,
      input.requestId,
      usageDate,
      input.capability,
      input.provider,
      input.model ?? null,
      requestedTokens,
      stringifyJson(input.metadata),
      expiresAt,
      input.userId,
      usageDate,
      quota.dailyRequestLimit,
      input.userId,
      usageDate,
      requestedTokens,
      quota.dailyTokenLimit,
    )
    .first<Omit<UsageReservation, "idempotent">>();

  if (inserted) {
    await rebuildDailyUsage(input.userId, usageDate);
    return { ...inserted, idempotent: false };
  }

  const existing = await getDb().query.usageEvents.findFirst({
    where: eq(usageEvents.requestId, input.requestId),
  });
  if (existing) {
    if (existing.userId !== input.userId || existing.capability !== input.capability) {
      throw new Error("Idempotency key is already associated with another operation");
    }
    return {
      id: existing.id,
      requestId: existing.requestId,
      status: existing.status,
      reservedTokens: existing.reservedTokens,
      expiresAt: existing.expiresAt,
      idempotent: true,
    };
  }

  throw new QuotaExceededError();
}

export async function settleUsage(input: {
  userId: string;
  requestId: string;
  status: "succeeded" | "failed" | "cancelled";
  inputTokens?: number;
  outputTokens?: number;
}): Promise<boolean> {
  const inputTokens = toNonNegativeInteger(input.inputTokens ?? 0, "inputTokens");
  const outputTokens = toNonNegativeInteger(input.outputTokens ?? 0, "outputTokens");
  const existing = await getDb().query.usageEvents.findFirst({
    where: and(
      eq(usageEvents.userId, input.userId),
      eq(usageEvents.requestId, input.requestId),
    ),
  });
  if (!existing) return false;
  const actualTokens = inputTokens + outputTokens;

  if (existing.status !== "reserved") {
    return (
      existing.status === input.status &&
      existing.inputTokens === inputTokens &&
      existing.outputTokens === outputTokens
    );
  }

  const expired = Date.parse(existing.expiresAt) <= Date.now();
  const overage = actualTokens > existing.reservedTokens;
  const settledStatus = expired ? "cancelled" : overage ? "failed" : input.status;

  const updated = await getDb()
    .update(usageEvents)
    .set({ status: settledStatus, inputTokens, outputTokens })
    .where(
      and(
        eq(usageEvents.userId, input.userId),
        eq(usageEvents.requestId, input.requestId),
        eq(usageEvents.status, "reserved"),
      ),
    )
    .returning({ usageDate: usageEvents.usageDate });

  if (updated[0]) await rebuildDailyUsage(input.userId, updated[0].usageDate);
  return updated.length === 1 && !expired && !overage;
}

export async function getUsageForDate(userId: string, usageDate = utcDate()) {
  return getDb().query.usageDaily.findFirst({
    where: (table, { and: all, eq: equals }) =>
      all(equals(table.userId, userId), equals(table.usageDate, usageDate)),
  });
}

async function rebuildDailyUsage(userId: string, usageDate: string): Promise<void> {
  await getD1()
    .prepare(
      `INSERT INTO usage_daily
         (user_id, usage_date, request_count, reserved_tokens, input_tokens, output_tokens, updated_at)
       SELECT ?, ?, coalesce(sum(CASE
           WHEN status != 'reserved' OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1
           ELSE 0 END), 0),
         coalesce(sum(CASE
           WHEN status = 'reserved' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN reserved_tokens
           ELSE 0 END), 0),
         coalesce(sum(input_tokens), 0), coalesce(sum(output_tokens), 0),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       FROM usage_events WHERE user_id = ? AND usage_date = ?
       ON CONFLICT(user_id, usage_date) DO UPDATE SET
         request_count = excluded.request_count,
         reserved_tokens = excluded.reserved_tokens,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, usageDate, userId, usageDate)
    .run();
}

function toNonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`);
  return value;
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
