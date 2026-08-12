import { and, desc, eq, or } from "drizzle-orm";
import { getD1, getDb } from "./index";
import { newId } from "./ids";
import { stringifyJson, type JsonValue } from "./json";
import {
  claimEvidence,
  claims,
  claimStatusEvents,
  entities,
  entityAliases,
  evidence,
  relations,
} from "./schema";

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(resource = "Resource") {
    super(`${resource} changed since it was read`);
    this.name = "VersionConflictError";
  }
}

export async function createEntity(input: {
  entityType: string;
  canonicalKey: string;
  title: string;
  summary?: string | null;
  visibility?: "public" | "members" | "private";
  metadata?: Record<string, JsonValue>;
  actorUserId?: string | null;
}) {
  const [row] = await getDb()
    .insert(entities)
    .values({
      id: newId("ent"),
      entityType: required(input.entityType, "entityType", 80),
      canonicalKey: required(input.canonicalKey, "canonicalKey", 500),
      title: required(input.title, "title", 500),
      summary: optional(input.summary, 20_000),
      visibility: input.visibility ?? "public",
      metadataJson: stringifyJson(input.metadata),
      createdByUserId: input.actorUserId ?? null,
      updatedByUserId: input.actorUserId ?? null,
    })
    .returning();
  return row;
}

export async function updateEntity(input: {
  id: string;
  expectedVersion: number;
  title?: string;
  summary?: string | null;
  visibility?: "public" | "members" | "private";
  status?: "active" | "superseded" | "retracted" | "archived";
  metadata?: Record<string, JsonValue>;
  actorUserId?: string | null;
}) {
  const updates: Partial<typeof entities.$inferInsert> = {
    version: input.expectedVersion + 1,
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.actorUserId ?? null,
  };
  if (input.title !== undefined) updates.title = required(input.title, "title", 500);
  if (input.summary !== undefined) updates.summary = optional(input.summary, 20_000);
  if (input.visibility !== undefined) updates.visibility = input.visibility;
  if (input.status !== undefined) updates.status = input.status;
  if (input.metadata !== undefined) updates.metadataJson = stringifyJson(input.metadata);

  const [row] = await getDb()
    .update(entities)
    .set(updates)
    .where(and(eq(entities.id, input.id), eq(entities.version, input.expectedVersion)))
    .returning();
  if (!row) throw new VersionConflictError("Entity");
  return row;
}

export async function addEntityAlias(input: {
  entityId: string;
  alias: string;
  language?: string;
}) {
  const alias = required(input.alias, "alias", 500);
  await getDb()
    .insert(entityAliases)
    .values({
      entityId: input.entityId,
      alias,
      aliasNormalized: alias.normalize("NFKC").toLocaleLowerCase("en-US"),
      language: input.language?.trim().slice(0, 16) || "und",
    })
    .onConflictDoNothing();
}

export async function getEntity(id: string) {
  return getDb().query.entities.findFirst({ where: eq(entities.id, id) });
}

export async function listEntities(input: {
  entityType?: string;
  visibility?: "public" | "members" | "private";
  limit?: number;
  offset?: number;
} = {}) {
  const limit = bounded(input.limit ?? 50, 1, 200);
  const offset = bounded(input.offset ?? 0, 0, 100_000);
  return getDb()
    .select()
    .from(entities)
    .where(
      and(
        input.entityType ? eq(entities.entityType, input.entityType) : undefined,
        input.visibility ? eq(entities.visibility, input.visibility) : undefined,
      ),
    )
    .orderBy(desc(entities.updatedAt), desc(entities.id))
    .limit(limit)
    .offset(offset);
}

/** Claims and evidence are immutable; corrections append status/supersession events. */
export async function createEvidence(input: {
  evidenceType: string;
  sourceUri: string;
  sourceTitle: string;
  locator?: string;
  excerpt?: string | null;
  contentHash: string;
  evidenceLevel?: string;
  publishedAt?: string | null;
  metadata?: Record<string, JsonValue>;
  actorUserId?: string | null;
}) {
  const [row] = await getDb()
    .insert(evidence)
    .values({
      id: newId("evd"),
      evidenceType: required(input.evidenceType, "evidenceType", 80),
      sourceUri: required(input.sourceUri, "sourceUri", 2_000),
      sourceTitle: required(input.sourceTitle, "sourceTitle", 1_000),
      locator: optional(input.locator, 500) ?? "",
      excerpt: optional(input.excerpt, 8_000),
      contentHash: required(input.contentHash, "contentHash", 200),
      evidenceLevel: optional(input.evidenceLevel, 80) ?? "unrated",
      publishedAt: input.publishedAt ?? null,
      metadataJson: stringifyJson(input.metadata),
      createdByUserId: input.actorUserId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  return getDb().query.evidence.findFirst({
    where: and(
      eq(evidence.sourceUri, input.sourceUri.trim()),
      eq(evidence.locator, input.locator?.trim() ?? ""),
      eq(evidence.contentHash, input.contentHash.trim()),
    ),
  });
}

export async function createClaim(input: {
  subjectEntityId: string;
  predicate: string;
  objectEntityId?: string | null;
  objectValue?: string | null;
  objectValueType?: string | null;
  statement: string;
  confidenceBps?: number;
  supersedesClaimId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  actorUserId?: string | null;
}) {
  const hasEntityObject = Boolean(input.objectEntityId);
  const hasLiteralObject = input.objectValue !== undefined && input.objectValue !== null;
  if (hasEntityObject === hasLiteralObject) {
    throw new Error("Exactly one of objectEntityId or objectValue is required");
  }
  if (hasLiteralObject && !input.objectValueType?.trim()) {
    throw new Error("objectValueType is required for literal claims");
  }
  const claimId = newId("clm");
  const statusId = newId("cse");
  const db = getDb();
  const rows = await db.batch([
    db.insert(claims).values({
      id: claimId,
      subjectEntityId: input.subjectEntityId,
      predicate: required(input.predicate, "predicate", 160),
      objectEntityId: input.objectEntityId ?? null,
      objectValue: input.objectValue ?? null,
      objectValueType: input.objectValueType?.trim() || null,
      statement: required(input.statement, "statement", 20_000),
      confidenceBps: bounded(input.confidenceBps ?? 0, 0, 10_000),
      supersedesClaimId: input.supersedesClaimId ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      createdByUserId: input.actorUserId ?? null,
    }),
    db.insert(claimStatusEvents).values({
      id: statusId,
      claimId,
      revision: 1,
      status: "draft",
      actorUserId: input.actorUserId ?? null,
    }),
  ]);
  if (!rows) throw new Error("Unable to create claim");
  return db.query.claims.findFirst({ where: eq(claims.id, claimId) });
}

export async function appendClaimStatus(input: {
  claimId: string;
  status: "draft" | "accepted" | "rejected" | "superseded" | "retracted";
  reason?: string | null;
  actorUserId?: string | null;
}) {
  const current = await getDb().query.claimStatusEvents.findFirst({
    where: eq(claimStatusEvents.claimId, input.claimId),
    orderBy: [desc(claimStatusEvents.revision)],
  });
  if (!current) throw new Error("Claim does not exist");
  if (!isAllowedClaimTransition(current.status, input.status)) {
    throw new Error(`Invalid claim transition: ${current.status} -> ${input.status}`);
  }
  if (input.status === "accepted") {
    const supportingEvidence = await getDb().query.claimEvidence.findFirst({
      where: and(
        eq(claimEvidence.claimId, input.claimId),
        eq(claimEvidence.stance, "supports"),
      ),
    });
    if (!supportingEvidence) {
      throw new Error("A claim requires supporting evidence before it can be accepted");
    }
  }

  const statusId = newId("cse");
  const revision = current.revision + 1;
  const relationStatus = input.status === "retracted" ? "retracted" : "superseded";
  const statements = [
    getD1()
      .prepare(
        `INSERT INTO claim_status_events
          (id, claim_id, revision, status, reason, actor_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        statusId,
        input.claimId,
        revision,
        input.status,
        optional(input.reason, 4_000),
        input.actorUserId ?? null,
      ),
  ];
  if (input.status === "superseded" || input.status === "retracted") {
    statements.push(
      getD1()
        .prepare("UPDATE relations SET status = ? WHERE asserted_by_claim_id = ? AND status = 'active'")
        .bind(relationStatus, input.claimId),
    );
  }
  const result = await getD1().batch(statements);
  if (!result.every((entry) => entry.success)) throw new VersionConflictError("Claim status");
  return getDb().query.claimStatusEvents.findFirst({
    where: eq(claimStatusEvents.id, statusId),
  });
}

export async function linkClaimEvidence(input: {
  claimId: string;
  evidenceId: string;
  stance?: "supports" | "contradicts" | "context";
  strengthBps?: number;
  actorUserId?: string | null;
}) {
  await getDb()
    .insert(claimEvidence)
    .values({
      claimId: input.claimId,
      evidenceId: input.evidenceId,
      stance: input.stance ?? "supports",
      strengthBps: bounded(input.strengthBps ?? 0, 0, 10_000),
      createdByUserId: input.actorUserId ?? null,
    })
    .onConflictDoNothing();
}

export async function materializeRelation(input: {
  claimId: string;
  actorUserId?: string | null;
}) {
  const relationId = newId("rel");
  await getD1()
    .prepare(
      `INSERT INTO relations
        (id, source_entity_id, predicate, target_entity_id, asserted_by_claim_id, status)
       SELECT ?, c.subject_entity_id, c.predicate, c.object_entity_id, c.id, 'active'
       FROM claims c
       JOIN claim_status_events s ON s.claim_id = c.id
       WHERE c.id = ? AND c.object_entity_id IS NOT NULL
         AND s.revision = (SELECT max(revision) FROM claim_status_events WHERE claim_id = c.id)
         AND s.status = 'accepted'
       ON CONFLICT(source_entity_id, predicate, target_entity_id, asserted_by_claim_id)
       DO NOTHING`,
    )
    .bind(relationId, input.claimId)
    .run();

  const row = await getDb().query.relations.findFirst({
    where: eq(relations.assertedByClaimId, input.claimId),
  });
  if (!row) throw new Error("Only an accepted entity-to-entity claim can become a relation");
  return row;
}

export async function listEntityRelations(entityId: string, limit = 100) {
  return getDb()
    .select()
    .from(relations)
    .where(
      and(
        or(eq(relations.sourceEntityId, entityId), eq(relations.targetEntityId, entityId)),
        eq(relations.status, "active"),
      ),
    )
    .limit(bounded(limit, 1, 500));
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
  if (normalized.length > max) throw new Error("Value is too long");
  return normalized || null;
}

function bounded(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Value must be an integer between ${min} and ${max}`);
  }
  return value;
}

function isAllowedClaimTransition(
  from: typeof claimStatusEvents.$inferSelect.status,
  to: typeof claimStatusEvents.$inferSelect.status,
): boolean {
  const transitions: Record<typeof from, readonly (typeof to)[]> = {
    draft: ["accepted", "rejected"],
    accepted: ["superseded", "retracted"],
    rejected: [],
    superseded: [],
    retracted: [],
  };
  return transitions[from].includes(to);
}
