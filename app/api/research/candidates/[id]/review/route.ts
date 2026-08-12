import { candidateRisk, getCandidateChange, reviewCandidate } from "@/db/research";
import { requireRole } from "@/app/api/_lib/auth";
import { ApiError, apiRequestId, assertSameOrigin, ok, readJson } from "@/app/api/_lib/http";
import { researchError } from "@/app/api/research/_lib/response";
import { REVIEW_DECISIONS, enumField, numberField, objectBody, pathId, stringField } from "@/app/api/research/_lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requireRole(["reviewer", "admin"], {
      requestId,
      action: "research.candidate.review",
      resourceType: "candidate_change",
    });
    actorUserId = principal.user.id;
    const id = pathId((await context.params).id);
    const existing = await getCandidateChange(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Candidate change was not found");
    if (existing.proposedByUserId === principal.user.id) {
      const risk = candidateRisk(existing.action, existing.targetType);
      throw new ApiError(403, "FORBIDDEN", `Self-review is not permitted (${risk}-risk candidate)`);
    }
    const body = objectBody(await readJson(request, 12_000));
    const decision = enumField(body, "decision", REVIEW_DECISIONS);
    const comment = stringField(body, "comment", { max: 8_000, optional: true });
    if (decision === "request_changes" && !comment) {
      throw new ApiError(400, "BAD_REQUEST", "comment is required when requesting changes");
    }
    const row = await reviewCandidate({
      candidateChangeId: id,
      expectedVersion: numberField(body, "expectedVersion", { min: 1, max: 2_147_483_647 })!,
      reviewerUserId: principal.user.id,
      decision,
      comment,
      requestId,
    });
    return ok({ candidate: row, requestId, notice: "Accepted candidates are not published automatically." });
  } catch (error) {
    return researchError(error, requestId, { actorUserId, action: "research.candidate.review", resourceType: "candidate_change" });
  }
}
