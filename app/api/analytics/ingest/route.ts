import { parseForwardedAnalyticsEvents, pseudonymizeAnalyticsEvents, verifyAnalyticsSignature } from "@/app/analytics/server";
import { analyticsIngestSecret } from "@/app/analytics/secret";
import { isPublicAnonymousMode } from "@/app/deployment-mode";
import {
  ApiError,
  apiRequestId,
  handleApiError,
  ok,
} from "@/app/api/_lib/http";
import { insertAnalyticsEvents } from "@/db/analytics";

export const dynamic = "force-dynamic";
const MAX_BATCH_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (isPublicAnonymousMode()) return new Response(null, { status: 404 });
  const requestId = apiRequestId(request);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BATCH_BYTES) {
      throw new ApiError(413, "BAD_REQUEST", "Analytics batch is too large");
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BATCH_BYTES) {
      throw new ApiError(413, "BAD_REQUEST", "Analytics batch is too large");
    }
    const secret = analyticsIngestSecret();
    const verified = await verifyAnalyticsSignature({
      body,
      timestamp: request.headers.get("x-fd-analytics-timestamp"),
      signature: request.headers.get("x-fd-analytics-signature"),
      secret,
    });
    if (!verified) {
      throw new ApiError(403, "FORBIDDEN", "Analytics batch signature is invalid");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      throw new ApiError(400, "BAD_REQUEST", "Analytics batch must be valid JSON");
    }
    if (isAnalyticsProbe(payload)) {
      return ok({ verified: true, requestId }, { status: 202 });
    }
    const events = await pseudonymizeAnalyticsEvents(
      parseForwardedAnalyticsEvents(payload),
      secret as string,
    );
    const accepted = await insertAnalyticsEvents(events);
    return ok({ accepted, requestId }, { status: 202 });
  } catch (error) {
    const mapped = error instanceof TypeError
      ? new ApiError(400, "BAD_REQUEST", error.message)
      : error;
    return handleApiError(mapped, requestId);
  }
}

function isAnalyticsProbe(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return Object.keys(payload).length === 3
    && payload.schemaVersion === 1
    && payload.probe === true
    && Array.isArray(payload.events)
    && payload.events.length === 0;
}
