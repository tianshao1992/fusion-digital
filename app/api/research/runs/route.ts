import { createResearchRun, listResearchRuns } from "@/db/research";
import { requireRole } from "@/app/api/_lib/auth";
import { ApiError, apiRequestId, assertSameOrigin, created, ok, readJson } from "@/app/api/_lib/http";
import { researchError } from "../_lib/response";
import {
  RUN_TRIGGERS,
  enumField,
  idempotencyKey,
  objectBody,
  queryLimit,
  runStatuses,
  stringField,
} from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    const principal = await requireRole(["reviewer", "admin"], {
      requestId,
      action: "research.runs.list",
      resourceType: "research_run",
    });
    actorUserId = principal.user.id;
    const url = new URL(request.url);
    const rows = await listResearchRuns({ statuses: runStatuses(url), limit: queryLimit(url, 30) });
    return ok({ runs: rows, requestId });
  } catch (error) {
    return researchError(error, requestId, { actorUserId, action: "research.runs.list", resourceType: "research_run" });
  }
}

export async function POST(request: Request) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requireRole(["contributor", "reviewer", "admin", "agent"], {
      requestId,
      action: "research.run.create",
      resourceType: "research_run",
    });
    actorUserId = principal.user.id;
    const body = objectBody(await readJson(request, 8_192));
    const triggerType = enumField(body, "triggerType", RUN_TRIGGERS);
    if (triggerType !== "manual" && !principal.roles.some((role) => ["admin", "agent"].includes(role))) {
      throw new ApiError(403, "FORBIDDEN", "Only an admin or agent may create automated runs");
    }
    const row = await createResearchRun({
      idempotencyKey: idempotencyKey(request, body),
      triggerType,
      scope: stringField(body, "scope", { min: 2, max: 500 })!,
      requestedByUserId: principal.user.id,
      mutation: { actorUserId: principal.user.id, requestId },
    });
    return created({ run: row, requestId });
  } catch (error) {
    return researchError(error, requestId, { actorUserId, action: "research.run.create", resourceType: "research_run" });
  }
}
