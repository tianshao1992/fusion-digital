import { and, desc, eq, inArray } from "drizzle-orm";
import { getD1, getDb } from "./index";
import { newId } from "./ids";
import { stringifyJson, type JsonValue } from "./json";
import { VersionConflictError } from "./knowledge";
import { candidateChanges, candidateReviews, researchRuns } from "./schema";

export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_review",
  "completed",
  "failed",
  "cancelled",
] as const;
export const CANDIDATE_STATUSES = [
  "candidate",
  "needs_review",
  "accepted",
  "rejected",
  "published",
  "failed",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

type MutationContext = {
  actorUserId: string;
  requestId: string;
};

const ACTIVE_REVIEW_RUN_STATUSES = ["queued", "running", "waiting_review"] as const;

export class SelfReviewError extends Error {
  constructor() {
    super("A proposer cannot review their own candidate change");
    this.name = "SelfReviewError";
  }
}

export class ResearchStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchStateError";
  }
}

export async function createResearchRun(input: {
  idempotencyKey: string;
  triggerType: "manual" | "schedule" | "webhook" | "backfill";
  scope: string;
  requestedByUserId?: string | null;
  mutation: MutationContext;
}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey", 200);
  const scope = required(input.scope, "scope", 500);
  const requestedByUserId = input.requestedByUserId ?? null;
  const mutation = validatedMutation(input.mutation);
  const id = newId("run");
  const results = await getD1().batch([
    getD1()
      .prepare(
        `INSERT INTO research_runs
          (id, idempotency_key, trigger_type, scope, requested_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .bind(id, idempotencyKey, input.triggerType, scope, requestedByUserId),
    getD1()
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
         SELECT ?, ?, ?, 'research.run.create', 'research_run', id, 'success', ?
         FROM research_runs WHERE id = ?`,
      )
      .bind(
        newId("aud"),
        mutation.actorUserId,
        mutation.requestId,
        stringifyJson({ triggerType: input.triggerType, candidateOnly: true }),
        id,
      ),
  ]);
  if (exactChanges(results, [1, 1])) {
    const row = await getResearchRun(id);
    if (!row) throw new ResearchStateError("Created research run could not be read");
    return row;
  }
  const existing = await getDb().query.researchRuns.findFirst({
    where: eq(researchRuns.idempotencyKey, idempotencyKey),
  });
  if (
    !existing ||
    existing.triggerType !== input.triggerType ||
    existing.scope !== scope ||
    existing.requestedByUserId !== requestedByUserId
  ) {
    throw new ResearchStateError("Idempotency key was already used for a different run request");
  }
  return existing;
}

export async function getResearchRun(id: string) {
  return getDb().query.researchRuns.findFirst({ where: eq(researchRuns.id, id) });
}

export async function listResearchRuns(input: {
  statuses?: RunStatus[];
  limit?: number;
} = {}) {
  const limit = bounded(input.limit ?? 30, 1, 100);
  const statuses = input.statuses?.filter((value, index, all) => all.indexOf(value) === index);
  const query = getDb().select().from(researchRuns);
  return (statuses?.length ? query.where(inArray(researchRuns.status, statuses)) : query)
    .orderBy(desc(researchRuns.createdAt), desc(researchRuns.id))
    .limit(limit);
}

export async function transitionResearchRun(input: {
  id: string;
  expectedVersion: number;
  fromStatus: RunStatus;
  toStatus: RunStatus;
  cursor?: string | null;
  statistics?: Record<string, JsonValue>;
  errorCode?: string | null;
  errorMessage?: string | null;
  mutation: MutationContext;
}) {
  if (!isAllowedRunTransition(input.fromStatus, input.toStatus)) {
    throw new ResearchStateError(
      `Invalid research run transition: ${input.fromStatus} -> ${input.toStatus}`,
    );
  }
  const mutation = validatedMutation(input.mutation);
  const terminal = ["completed", "failed", "cancelled"].includes(input.toStatus);
  bounded(input.expectedVersion, 1, 2_147_483_647);
  const cursor = input.cursor === undefined ? null : input.cursor?.slice(0, 4_000) ?? null;
  const statisticsJson = input.statistics ? stringifyJson(input.statistics) : null;
  const errorCode = input.errorCode === undefined ? null : input.errorCode?.slice(0, 100) ?? null;
  const errorMessage = input.errorMessage === undefined ? null : input.errorMessage?.slice(0, 8_000) ?? null;
  const startedAt = input.toStatus === "running" ? new Date().toISOString() : null;
  const completedAt = terminal ? new Date().toISOString() : null;
  const updatedAt = new Date().toISOString();
  const predicate = "id = ? AND version = ? AND status = ?";
  const results = await getD1().batch([
    getD1().prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
       SELECT ?, ?, ?, 'research.run.transition', 'research_run', id, 'success', ?
       FROM research_runs WHERE ${predicate}`,
    ).bind(
      newId("aud"), mutation.actorUserId, mutation.requestId,
      stringifyJson({ fromStatus: input.fromStatus, toStatus: input.toStatus }),
      input.id, input.expectedVersion, input.fromStatus,
    ),
    getD1().prepare(
      `UPDATE research_runs SET
         status = ?, version = version + 1,
         cursor = CASE WHEN ? = 1 THEN ? ELSE cursor END,
         statistics_json = coalesce(?, statistics_json),
         error_code = CASE WHEN ? = 1 THEN ? ELSE error_code END,
         error_message = CASE WHEN ? = 1 THEN ? ELSE error_message END,
         started_at = coalesce(?, started_at), completed_at = coalesce(?, completed_at),
         updated_at = ?
       WHERE ${predicate}`,
    ).bind(
      input.toStatus,
      input.cursor === undefined ? 0 : 1, cursor,
      statisticsJson,
      input.errorCode === undefined ? 0 : 1, errorCode,
      input.errorMessage === undefined ? 0 : 1, errorMessage,
      startedAt, completedAt, updatedAt,
      input.id, input.expectedVersion, input.fromStatus,
    ),
  ]);
  if (!exactChanges(results, [1, 1])) throw new VersionConflictError("Research run");
  const row = await getResearchRun(input.id);
  if (!row) throw new VersionConflictError("Research run");
  return row;
}

export async function proposeCandidateChange(input: {
  researchRunId: string;
  idempotencyKey: string;
  action: "add" | "update" | "retire" | "link" | "unlink";
  targetType: string;
  targetId?: string | null;
  proposed: JsonValue;
  diff?: JsonValue;
  rationale: string;
  confidenceBps?: number;
  proposedByUserId?: string | null;
  mutation: MutationContext;
}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey", 200);
  const targetType = required(input.targetType, "targetType", 100);
  const targetId = optional(input.targetId, 300);
  const proposedJson = stringifyJson(input.proposed);
  const diffJson = stringifyJson(input.diff ?? {});
  const rationale = required(input.rationale, "rationale", 20_000);
  const confidenceBps = bounded(input.confidenceBps ?? 0, 0, 10_000);
  const proposedByUserId = input.proposedByUserId ?? null;
  const mutation = validatedMutation(input.mutation);
  const id = newId("chg");
  const results = await getD1().batch([
    getD1()
      .prepare(
        `INSERT INTO candidate_changes
          (id, research_run_id, idempotency_key, action, target_type, target_id,
           proposed_json, diff_json, rationale, proposed_by_user_id, confidence_bps)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM research_runs
         WHERE id = ? AND status IN ('queued', 'running')
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        id,
        idempotencyKey,
        input.action,
        targetType,
        targetId,
        proposedJson,
        diffJson,
        rationale,
        proposedByUserId,
        confidenceBps,
        input.researchRunId,
      ),
    getD1()
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
         SELECT ?, ?, ?, 'research.candidate.create', 'candidate_change', id, 'success', ?
         FROM candidate_changes WHERE id = ?`,
      )
      .bind(
        newId("aud"),
        mutation.actorUserId,
        mutation.requestId,
        stringifyJson({ candidateOnly: true }),
        id,
      ),
  ]);
  if (exactChanges(results, [1, 1])) {
    const row = await getCandidateChange(id);
    if (!row) throw new ResearchStateError("Created candidate change could not be read");
    return row;
  }
  const existing = await getDb().query.candidateChanges.findFirst({
    where: eq(candidateChanges.idempotencyKey, idempotencyKey),
  });
  if (existing &&
    (
    existing.researchRunId !== input.researchRunId ||
    existing.action !== input.action ||
    existing.targetType !== targetType ||
    existing.targetId !== targetId ||
    existing.proposedJson !== proposedJson ||
    existing.diffJson !== diffJson ||
    existing.rationale !== rationale ||
    existing.confidenceBps !== confidenceBps ||
    existing.proposedByUserId !== proposedByUserId)
  ) {
    throw new ResearchStateError("Idempotency key was already used for a different candidate request");
  }
  if (existing) return existing;
  const run = await getResearchRun(input.researchRunId);
  if (!run) throw new ResearchStateError("Research run does not exist");
  throw new ResearchStateError("Candidates can only be added to queued or running runs");
}

export async function submitCandidateForReview(input: {
  id: string;
  expectedVersion: number;
  actorUserId: string;
  canSubmitOthers: boolean;
  requestId: string;
}) {
  const mutation = validatedMutation({ actorUserId: input.actorUserId, requestId: input.requestId });
  bounded(input.expectedVersion, 1, 2_147_483_647);
  const canSubmitOthers = input.canSubmitOthers ? 1 : 0;
  const precondition = `id = ? AND version = ? AND status = 'candidate'
    AND (proposed_by_user_id = ? OR ? = 1)
    AND EXISTS (
      SELECT 1 FROM research_runs
      WHERE research_runs.id = candidate_changes.research_run_id
        AND research_runs.status IN ('queued', 'running', 'waiting_review')
    )`;
  // Audit is inserted first under exactly the same predicate as the update.
  // D1 executes a batch transactionally, so any SQL failure rolls both back;
  // transaction isolation keeps the predicate stable until the update.
  const results = await getD1().batch([
    getD1()
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
         SELECT ?, ?, ?, 'research.candidate.submit', 'candidate_change', id, 'success', ?
         FROM candidate_changes WHERE ${precondition}`,
      )
      .bind(
        newId("aud"),
        mutation.actorUserId,
        mutation.requestId,
        stringifyJson({ expectedVersion: input.expectedVersion, candidateOnly: true }),
        input.id,
        input.expectedVersion,
        mutation.actorUserId,
        canSubmitOthers,
      ),
    getD1()
      .prepare(
        `UPDATE candidate_changes
         SET status = 'needs_review', version = version + 1, updated_at = ?
         WHERE ${precondition}`,
      )
      .bind(
        new Date().toISOString(),
        input.id,
        input.expectedVersion,
        mutation.actorUserId,
        canSubmitOthers,
      ),
  ]);
  if (!exactChanges(results, [1, 1])) {
    const existing = await getCandidateChange(input.id);
    if (!existing) throw new ResearchStateError("Candidate change does not exist");
    if (!input.canSubmitOthers && existing.proposedByUserId !== input.actorUserId) {
      throw new ResearchStateError("Only the proposer or a reviewer may submit this candidate");
    }
    const run = await getResearchRun(existing.researchRunId);
    if (!run || !ACTIVE_REVIEW_RUN_STATUSES.includes(run.status as (typeof ACTIVE_REVIEW_RUN_STATUSES)[number])) {
      throw new ResearchStateError("Candidates cannot be submitted after their research run is terminal");
    }
    throw new VersionConflictError("Candidate change");
  }
  const row = await getCandidateChange(input.id);
  if (!row) throw new VersionConflictError("Candidate change");
  return row;
}

/**
 * Review rows are immutable. Accepted candidates remain proposals: there is no
 * publish operation in this module or its API. A later release pipeline must
 * materialize accepted changes under a separate admin-controlled boundary.
 */
export async function reviewCandidate(input: {
  candidateChangeId: string;
  expectedVersion: number;
  reviewerUserId: string;
  decision: "accept" | "reject" | "request_changes";
  comment?: string | null;
  requestId: string;
}) {
  const existing = await getCandidateChange(input.candidateChangeId);
  if (!existing || existing.version !== input.expectedVersion || existing.status !== "needs_review") {
    throw new VersionConflictError("Candidate change");
  }
  // Stricter than the minimum high-risk rule: nobody may approve any proposal
  // they submitted. This prevents both accidental and deliberately mislabeled bypasses.
  if (existing.proposedByUserId && existing.proposedByUserId === input.reviewerUserId) {
    throw new SelfReviewError();
  }
  const run = await getResearchRun(existing.researchRunId);
  if (!run || !ACTIVE_REVIEW_RUN_STATUSES.includes(run.status as (typeof ACTIVE_REVIEW_RUN_STATUSES)[number])) {
    throw new ResearchStateError("Candidates cannot be reviewed after their research run is terminal");
  }
  const mutation = validatedMutation({ actorUserId: input.reviewerUserId, requestId: input.requestId });

  const targetStatus =
    input.decision === "accept"
      ? "accepted"
      : input.decision === "reject"
        ? "rejected"
        : "candidate";
  const reviewId = newId("rev");
  const updatedAt = new Date().toISOString();
  const precondition = `id = ? AND version = ? AND status = 'needs_review'
    AND (proposed_by_user_id IS NULL OR proposed_by_user_id != ?)
    AND EXISTS (
      SELECT 1 FROM research_runs
      WHERE research_runs.id = candidate_changes.research_run_id
        AND research_runs.status IN ('queued', 'running', 'waiting_review')
    )`;
  const results = await getD1().batch([
    getD1()
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
         SELECT ?, ?, ?, 'research.candidate.review', 'candidate_change', id, 'success', ?
         FROM candidate_changes WHERE ${precondition}`,
      )
      .bind(
        newId("aud"),
        mutation.actorUserId,
        mutation.requestId,
        stringifyJson({
          decision: input.decision,
          risk: candidateRisk(existing.action, existing.targetType),
          published: false,
          expectedVersion: input.expectedVersion,
        }),
        input.candidateChangeId,
        input.expectedVersion,
        mutation.actorUserId,
      ),
    getD1()
      .prepare(
        `INSERT INTO candidate_reviews
          (id, candidate_change_id, reviewer_user_id, decision, comment, candidate_version)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM candidate_changes WHERE ${precondition})`,
      )
      .bind(
        reviewId,
        input.candidateChangeId,
        input.reviewerUserId,
        input.decision,
        input.comment?.trim().slice(0, 8_000) || null,
        input.expectedVersion,
        input.candidateChangeId,
        input.expectedVersion,
        input.reviewerUserId,
      ),
    getD1()
      .prepare(
        `UPDATE candidate_changes
         SET status = ?, version = version + 1, updated_at = ?
         WHERE ${precondition}`,
      )
      .bind(
        targetStatus,
        updatedAt,
        input.candidateChangeId,
        input.expectedVersion,
        input.reviewerUserId,
      ),
  ]);
  if (
    !exactChanges(results, [1, 1, 1])
  ) {
    throw new VersionConflictError("Candidate change");
  }
  const updated = await getCandidateChange(input.candidateChangeId);
  if (!updated) throw new VersionConflictError("Candidate change");
  return updated;
}

export async function listCandidateChanges(input: {
  researchRunId?: string;
  statuses?: CandidateStatus[];
  limit?: number;
} = {}) {
  const limit = bounded(input.limit ?? 50, 1, 200);
  const conditions = [];
  if (input.researchRunId) conditions.push(eq(candidateChanges.researchRunId, input.researchRunId));
  if (input.statuses?.length) conditions.push(inArray(candidateChanges.status, input.statuses));
  const query = getDb().select().from(candidateChanges);
  return (conditions.length ? query.where(and(...conditions)) : query)
    .orderBy(desc(candidateChanges.createdAt), desc(candidateChanges.id))
    .limit(limit);
}

export async function listReviewQueue(limit = 50) {
  return listCandidateChanges({ statuses: ["needs_review"], limit });
}

export async function getCandidateChange(id: string) {
  return getDb().query.candidateChanges.findFirst({ where: eq(candidateChanges.id, id) });
}

export async function listCandidateReviews(candidateChangeId: string) {
  return getDb()
    .select()
    .from(candidateReviews)
    .where(eq(candidateReviews.candidateChangeId, candidateChangeId))
    .orderBy(desc(candidateReviews.createdAt));
}

export function candidateRisk(action: string, targetType: string): "high" | "standard" {
  const normalized = targetType.toLocaleLowerCase("en-US");
  return action === "retire" ||
    action === "unlink" ||
    ["safety", "control", "device", "claim", "evidence"].some((term) => normalized.includes(term))
    ? "high"
    : "standard";
}

function isAllowedRunTransition(from: RunStatus, to: RunStatus): boolean {
  const transitions: Record<RunStatus, readonly RunStatus[]> = {
    queued: ["running", "cancelled"],
    running: ["waiting_review", "completed", "failed", "cancelled"],
    waiting_review: ["running", "completed", "failed", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  };
  return transitions[from].includes(to);
}

function required(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} is too long`);
  return normalized;
}

function optional(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error("Value is too long");
  return normalized;
}

function bounded(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Value must be an integer between ${min} and ${max}`);
  }
  return value;
}

function validatedMutation(input: MutationContext): MutationContext {
  return {
    actorUserId: required(input.actorUserId, "actorUserId", 96),
    requestId: required(input.requestId, "requestId", 128),
  };
}

function exactChanges(
  results: Array<{ success: boolean; meta?: { changes?: number } }>,
  expected: number[],
): boolean {
  return results.length === expected.length && results.every(
    (entry, index) => entry.success && entry.meta?.changes === expected[index],
  );
}
