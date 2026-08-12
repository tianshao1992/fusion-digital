import { getCandidateChange, submitCandidateForReview } from "@/db/research";
import { requireRole } from "@/app/api/_lib/auth";
import { ApiError, apiRequestId, assertSameOrigin, ok, readJson } from "@/app/api/_lib/http";
import { researchError } from "@/app/api/research/_lib/response";
import { numberField, objectBody, pathId } from "@/app/api/research/_lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requireRole(["contributor", "reviewer", "admin", "agent"], {
      requestId,
      action: "research.candidate.submit",
      resourceType: "candidate_change",
    });
    actorUserId = principal.user.id;
    const id = pathId((await context.params).id);
    const existing = await getCandidateChange(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Candidate change was not found");
    if (
      existing.proposedByUserId !== principal.user.id &&
      !principal.roles.some((role) => ["admin", "reviewer"].includes(role))
    ) {
      throw new ApiError(403, "FORBIDDEN", "Only the proposer or a reviewer may submit this candidate");
    }
    const body = objectBody(await readJson(request, 4_096));
    const row = await submitCandidateForReview({
      id,
      expectedVersion: numberField(body, "expectedVersion", { min: 1, max: 2_147_483_647 })!,
      actorUserId: principal.user.id,
      canSubmitOthers: principal.roles.some((role) => ["admin", "reviewer"].includes(role)),
      requestId,
    });
    return ok({ candidate: row, requestId });
  } catch (error) {
    return researchError(error, requestId, { actorUserId, action: "research.candidate.submit", resourceType: "candidate_change" });
  }
}
