import { ApiError } from "@/app/api/_lib/http";
import {
  CANDIDATE_STATUSES,
  RUN_STATUSES,
  type CandidateStatus,
  type RunStatus,
} from "@/db/research";
import type { JsonValue } from "@/db/json";

export const RUN_TRIGGERS = ["manual", "schedule", "webhook", "backfill"] as const;
export const CANDIDATE_ACTIONS = ["add", "update", "retire", "link", "unlink"] as const;
export const REVIEW_DECISIONS = ["accept", "reject", "request_changes"] as const;

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bad("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function stringField(
  object: Record<string, unknown>,
  key: string,
  options: { min?: number; max: number; optional?: boolean } = { max: 500 },
): string | undefined {
  const value = object[key];
  if ((value === undefined || value === null) && options.optional) return undefined;
  if (typeof value !== "string") throw bad(`${key} must be a string`);
  const normalized = value.trim();
  if (normalized.length < (options.min ?? 1)) throw bad(`${key} is too short`);
  if (normalized.length > options.max) throw bad(`${key} is too long`);
  return normalized;
}

export function numberField(
  object: Record<string, unknown>,
  key: string,
  options: { min: number; max: number; optional?: boolean },
): number | undefined {
  const value = object[key];
  if ((value === undefined || value === null) && options.optional) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < options.min || Number(value) > options.max) {
    throw bad(`${key} must be an integer between ${options.min} and ${options.max}`);
  }
  return Number(value);
}

export function enumField<const Values extends readonly string[]>(
  object: Record<string, unknown>,
  key: string,
  values: Values,
): Values[number] {
  const value = object[key];
  if (typeof value !== "string" || !values.includes(value)) {
    throw bad(`${key} must be one of: ${values.join(", ")}`);
  }
  return value as Values[number];
}

export function jsonField(
  object: Record<string, unknown>,
  key: string,
  options: { optional?: boolean; maxBytes?: number } = {},
): JsonValue | undefined {
  const value = object[key];
  if (value === undefined && options.optional) return undefined;
  if (!isJsonValue(value)) throw bad(`${key} must be JSON-compatible data`);
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > (options.maxBytes ?? 48_000)) throw bad(`${key} is too large`);
  return value;
}

export function idempotencyKey(request: Request, body?: Record<string, unknown>): string {
  const value = request.headers.get("idempotency-key") ?? body?.idempotencyKey;
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{7,199}$/.test(value)) {
    throw bad("A valid Idempotency-Key header is required");
  }
  return value;
}

export function pathId(value: string, label = "id"): string {
  const decoded = decodeURIComponent(value);
  if (!/^[a-z][a-z0-9_]{1,31}_[0-9A-HJKMNP-TV-Z]{26}$/.test(decoded)) {
    throw bad(`${label} is invalid`);
  }
  return decoded;
}

export function queryLimit(url: URL, fallback: number): number {
  const value = url.searchParams.get("limit");
  if (value === null) return fallback;
  if (!/^\d{1,3}$/.test(value)) throw bad("limit must be an integer");
  const parsed = Number(value);
  if (parsed < 1 || parsed > 200) throw bad("limit must be between 1 and 200");
  return parsed;
}

export function runStatuses(url: URL): RunStatus[] | undefined {
  return parseCsvEnum(url.searchParams.get("status"), RUN_STATUSES, "status");
}

export function candidateStatuses(url: URL): CandidateStatus[] | undefined {
  return parseCsvEnum(url.searchParams.get("status"), CANDIDATE_STATUSES, "status");
}

function parseCsvEnum<const Values extends readonly string[]>(
  value: string | null,
  values: Values,
  name: string,
): Values[number][] | undefined {
  if (!value) return undefined;
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (!items.length || items.some((item) => !values.includes(item))) {
    throw bad(`${name} contains an unsupported value`);
  }
  return items as Values[number][];
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 12) return false;
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 500 && value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 500 && entries.every(([key, item]) => key.length <= 200 && isJsonValue(item, depth + 1));
}

function bad(message: string) {
  return new ApiError(400, "BAD_REQUEST", message);
}
