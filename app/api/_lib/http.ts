import { appendAuditEvent } from "@/db/audit";
import { VersionConflictError } from "@/db/knowledge";
import { QuotaExceededError } from "@/db/usage";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiRequestId(request: Request): string {
  const value = request.headers.get("cf-ray");
  return value && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : crypto.randomUUID();
}

export function ok<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json({ data }, { ...init, headers: securityHeaders(init.headers) });
}

export function created<T>(data: T): Response {
  return ok(data, { status: 201 });
}

export async function readJson<T>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "BAD_REQUEST", "Content-Type must be application/json");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ApiError(413, "BAD_REQUEST", "Request body is too large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, "BAD_REQUEST", "Request body is too large");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
  }
}

export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError(403, "FORBIDDEN", "Cross-origin state changes are not allowed");
  }
  const origin = request.headers.get("origin");
  if (!site && !origin) {
    throw new ApiError(403, "FORBIDDEN", "A browser origin signal is required for state changes");
  }
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "FORBIDDEN", "Cross-origin state changes are not allowed");
  }
}

export async function handleApiError(
  error: unknown,
  requestId: string,
  context?: { actorUserId?: string | null; action?: string; resourceType?: string },
): Promise<Response> {
  const mapped = mapError(error);
  if (context?.action && context.resourceType) {
    try {
      await appendAuditEvent({
        actorUserId: context.actorUserId ?? null,
        requestId,
        action: context.action,
        resourceType: context.resourceType,
        outcome: mapped.status === 403 ? "denied" : "failure",
        metadata: { code: mapped.code },
      });
    } catch {
      // Never mask the originating API failure if audit persistence also fails.
    }
  }

  return Response.json(
    { error: { code: mapped.code, message: mapped.message }, requestId },
    { status: mapped.status, headers: securityHeaders() },
  );
}

function mapError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof VersionConflictError) return new ApiError(409, "CONFLICT", error.message);
  if (error instanceof QuotaExceededError) {
    return new ApiError(429, "QUOTA_EXCEEDED", error.message);
  }
  if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
    return new ApiError(409, "CONFLICT", "A conflicting resource already exists");
  }
  return new ApiError(500, "INTERNAL_ERROR", "The request could not be completed");
}

function securityHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}
