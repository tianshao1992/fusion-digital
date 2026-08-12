import { listCandidateChanges, proposeCandidateChange } from "@/db/research";
import { requireRole } from "@/app/api/_lib/auth";
import { apiRequestId, assertSameOrigin, created, ok, readJson } from "@/app/api/_lib/http";
import { researchError } from "../_lib/response";
import {
  CANDIDATE_ACTIONS,
  candidateStatuses,
  enumField,
  idempotencyKey,
  jsonField,
  numberField,
  objectBody,
  pathId,
  queryLimit,
  stringField,
} from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    const principal = await requireRole(["reviewer", "admin"], {
      requestId,
      action: "research.candidates.list",
      resourceType: "candidate_change",
    });
    actorUserId = principal.user.id;
    const url = new URL(request.url);
    const run = url.searchParams.get("run");
    const rows = await listCandidateChanges({
      researchRunId: run ? pathId(run, "run") : undefined,
      statuses: candidateStatuses(url),
      limit: queryLimit(url, 50),
    });
    return ok({ candidates: rows, requestId });
  } catch (error) {
    return researchError(error, requestId, { actorUserId, action: "research.candidates.list", resourceType: "candidate_change" });
  }
}

export async function POST(request: Request) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requireRole(["contributor", "reviewer", "admin", "agent"], {
      requestId,
      action: "research.candidate.create",
      resourceType: "candidate_change",
    });
    actorUserId = principal.user.id;
    const body = objectBody(await readJson(request, 64 * 1024));
    const row = await proposeCandidateChange({
      researchRunId: pathId(stringField(body, "researchRunId", { max: 64 })!, "researchRunId"),
      idempotencyKey: idempotencyKey(request, body),
      action: enumField(body, "action", CANDIDATE_ACTIONS),
      targetType: stringField(body, "targetType", { min: 2, max: 100 })!,
      targetId: stringField(body, "targetId", { max: 300, optional: true }) ?? null,
      proposed: jsonField(body, "proposed", { maxBytes: 48_000 })!,
      diff: jsonField(body, "diff", { optional: true, maxBytes: 24_000 }),
      rationale: stringField(body, "rationale", { min: 8, max: 20_000 })!,
      confidenceBps: numberField(body, "confidenceBps", { min: 0, max: 10_000, optional: true }),
      proposedByUserId: principal.user.id,
      mutation: { actorUserId: principal.user.id, requestId },
    });
    return created({ candidate: row, requestId });
  } catch (error) {
    return researchError(error, requestId, { actorUserId, action: "research.candidate.create", resourceType: "candidate_change" });
  }
}
