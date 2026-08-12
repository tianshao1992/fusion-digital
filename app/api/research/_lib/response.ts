import { ApiError, handleApiError } from "@/app/api/_lib/http";
import { ResearchStateError, SelfReviewError } from "@/db/research";

export async function researchError(
  error: unknown,
  requestId: string,
  context: { actorUserId?: string | null; action: string; resourceType: string },
) {
  if (error instanceof SelfReviewError) {
    error = new ApiError(403, "FORBIDDEN", error.message);
  } else if (error instanceof ResearchStateError) {
    error = new ApiError(409, "CONFLICT", error.message);
  } else if (
    error instanceof Error &&
    (/D1 binding `DB` is unavailable/i.test(error.message) || /no such table/i.test(error.message))
  ) {
    error = new ApiError(
      503,
      "INTERNAL_ERROR",
      "Research persistence is not available in this environment",
    );
  } else if (error instanceof Error && /is required|too long|must be an integer/i.test(error.message)) {
    error = new ApiError(400, "BAD_REQUEST", error.message);
  }
  return handleApiError(error, requestId, context);
}
