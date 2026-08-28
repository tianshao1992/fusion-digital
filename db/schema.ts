import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const emptyObject = sql`'{}'`;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    siwcSubject: text("siwc_subject").notNull(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["active", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
    lastSeenAt: text("last_seen_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_users_siwc_subject").on(table.siwcSubject),
    index("idx_users_email_normalized").on(table.emailNormalized),
    check("ck_users_status", sql`${table.status} in ('active', 'suspended', 'deleted')`),
    check("ck_users_version", sql`${table.version} >= 1`),
  ],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["member", "contributor", "reviewer", "admin", "agent"],
    }).notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedAt: text("granted_at").notNull().default(now),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index("idx_user_roles_active").on(table.userId, table.revokedAt),
    check(
      "ck_user_roles_role",
      sql`${table.role} in ('member', 'contributor', 'reviewer', 'admin', 'agent')`,
    ),
  ],
);

export const quotaOverrides = sqliteTable(
  "quota_overrides",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyRequestLimit: integer("daily_request_limit"),
    dailyTokenLimit: integer("daily_token_limit"),
    maxTokensPerRequest: integer("max_tokens_per_request"),
    validUntil: text("valid_until"),
    reason: text("reason"),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    check(
      "ck_quota_overrides_requests",
      sql`${table.dailyRequestLimit} is null or ${table.dailyRequestLimit} >= 0`,
    ),
    check(
      "ck_quota_overrides_tokens",
      sql`${table.dailyTokenLimit} is null or ${table.dailyTokenLimit} >= 0`,
    ),
    check(
      "ck_quota_overrides_max_tokens",
      sql`${table.maxTokensPerRequest} is null or ${table.maxTokensPerRequest} >= 0`,
    ),
  ],
);

export const userLlmCredentials = sqliteTable(
  "user_llm_credentials",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["openai", "anthropic", "deepseek", "kimi"],
    }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    keyHint: text("key_hint").notNull(),
    model: text("model"),
    region: text("region", { enum: ["cn", "international"] }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    check(
      "ck_user_llm_credentials_provider",
      sql`${table.provider} in ('openai', 'anthropic', 'deepseek', 'kimi')`,
    ),
    check(
      "ck_user_llm_credentials_ciphertext",
      sql`length(${table.ciphertext}) between 1 and 4096`,
    ),
    check(
      "ck_user_llm_credentials_iv",
      sql`length(${table.iv}) between 1 and 128`,
    ),
    check(
      "ck_user_llm_credentials_key_version",
      sql`${table.keyVersion} >= 1`,
    ),
    check(
      "ck_user_llm_credentials_key_hint",
      sql`length(${table.keyHint}) between 1 and 64`,
    ),
    check(
      "ck_user_llm_credentials_model",
      sql`${table.model} is null or length(${table.model}) between 1 and 120`,
    ),
    check(
      "ck_user_llm_credentials_region",
      sql`${table.region} is null or ${table.region} in ('cn', 'international')`,
    ),
    check(
      "ck_user_llm_credentials_enabled",
      sql`${table.enabled} in (0, 1)`,
    ),
    check("ck_user_llm_credentials_version", sql`${table.version} >= 1`),
  ],
);

export const userLlmPreferences = sqliteTable(
  "user_llm_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultProvider: text("default_provider", {
      enum: ["retrieval", "openai", "anthropic", "deepseek", "kimi"],
    })
      .notNull()
      .default("retrieval"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    check(
      "ck_user_llm_preferences_default_provider",
      sql`${table.defaultProvider} in ('retrieval', 'openai', 'anthropic', 'deepseek', 'kimi')`,
    ),
    check("ck_user_llm_preferences_revision", sql`${table.revision} >= 1`),
  ],
);

export const usageDaily = sqliteTable(
  "usage_daily",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: text("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    reservedTokens: integer("reserved_tokens").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.usageDate] }),
    check("ck_usage_daily_requests", sql`${table.requestCount} >= 0`),
    check("ck_usage_daily_reserved", sql`${table.reservedTokens} >= 0`),
    check("ck_usage_daily_input", sql`${table.inputTokens} >= 0`),
    check("ck_usage_daily_output", sql`${table.outputTokens} >= 0`),
  ],
);

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    usageDate: text("usage_date").notNull(),
    capability: text("capability").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status", {
      enum: ["reserved", "succeeded", "failed", "cancelled"],
    }).notNull(),
    reservedTokens: integer("reserved_tokens").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    metadataJson: text("metadata_json").notNull().default(emptyObject),
    expiresAt: text("expires_at").notNull(),
    occurredAt: text("occurred_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_usage_events_request_id").on(table.requestId),
    index("idx_usage_events_user_time").on(table.userId, table.occurredAt),
    index("idx_usage_events_user_date").on(table.userId, table.usageDate),
    check(
      "ck_usage_events_status",
      sql`${table.status} in ('reserved', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("ck_usage_events_reserved", sql`${table.reservedTokens} >= 0`),
    check("ck_usage_events_input", sql`${table.inputTokens} >= 0`),
    check("ck_usage_events_output", sql`${table.outputTokens} >= 0`),
    check("ck_usage_events_metadata_json", sql`json_valid(${table.metadataJson})`),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requestId: text("request_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: text("outcome", { enum: ["success", "denied", "failure"] })
      .notNull()
      .default("success"),
    metadataJson: text("metadata_json").notNull().default(emptyObject),
    occurredAt: text("occurred_at").notNull().default(now),
  },
  (table) => [
    index("idx_audit_events_resource_time").on(
      table.resourceType,
      table.resourceId,
      table.occurredAt,
    ),
    index("idx_audit_events_actor_time").on(table.actorUserId, table.occurredAt),
    index("idx_audit_events_request_id").on(table.requestId),
    check(
      "ck_audit_events_outcome",
      sql`${table.outcome} in ('success', 'denied', 'failure')`,
    ),
    check("ck_audit_events_metadata_json", sql`json_valid(${table.metadataJson})`),
  ],
);

export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    visibility: text("visibility", { enum: ["public", "members", "private"] })
      .notNull()
      .default("public"),
    status: text("status", {
      enum: ["active", "superseded", "retracted", "archived"],
    })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    metadataJson: text("metadata_json").notNull().default(emptyObject),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_entities_canonical_key").on(table.canonicalKey),
    index("idx_entities_type_status").on(table.entityType, table.status),
    index("idx_entities_visibility_status").on(table.visibility, table.status),
    check(
      "ck_entities_visibility",
      sql`${table.visibility} in ('public', 'members', 'private')`,
    ),
    check(
      "ck_entities_status",
      sql`${table.status} in ('active', 'superseded', 'retracted', 'archived')`,
    ),
    check("ck_entities_version", sql`${table.version} >= 1`),
    check("ck_entities_metadata_json", sql`json_valid(${table.metadataJson})`),
  ],
);

export const entityAliases = sqliteTable(
  "entity_aliases",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    aliasNormalized: text("alias_normalized").notNull(),
    language: text("language").notNull().default("und"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.aliasNormalized, table.language] }),
    index("idx_entity_aliases_lookup").on(table.aliasNormalized, table.language),
  ],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    evidenceType: text("evidence_type").notNull(),
    sourceUri: text("source_uri").notNull(),
    sourceTitle: text("source_title").notNull(),
    locator: text("locator").notNull().default(""),
    excerpt: text("excerpt"),
    contentHash: text("content_hash").notNull(),
    evidenceLevel: text("evidence_level").notNull().default("unrated"),
    publishedAt: text("published_at"),
    retrievedAt: text("retrieved_at").notNull().default(now),
    metadataJson: text("metadata_json").notNull().default(emptyObject),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_evidence_source_locator_hash").on(
      table.sourceUri,
      table.locator,
      table.contentHash,
    ),
    index("idx_evidence_source_uri").on(table.sourceUri),
    index("idx_evidence_type_level").on(table.evidenceType, table.evidenceLevel),
    check("ck_evidence_metadata_json", sql`json_valid(${table.metadataJson})`),
  ],
);

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    subjectEntityId: text("subject_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    predicate: text("predicate").notNull(),
    objectEntityId: text("object_entity_id").references(() => entities.id, {
      onDelete: "restrict",
    }),
    objectValue: text("object_value"),
    objectValueType: text("object_value_type"),
    statement: text("statement").notNull(),
    confidenceBps: integer("confidence_bps").notNull().default(0),
    supersedesClaimId: text("supersedes_claim_id").references(
      (): AnySQLiteColumn => claims.id,
      { onDelete: "restrict" },
    ),
    validFrom: text("valid_from"),
    validUntil: text("valid_until"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    index("idx_claims_subject_predicate").on(table.subjectEntityId, table.predicate),
    index("idx_claims_object_predicate").on(table.objectEntityId, table.predicate),
    index("idx_claims_supersedes").on(table.supersedesClaimId),
    check(
      "ck_claims_object",
      sql`(${table.objectEntityId} is not null and ${table.objectValue} is null) or (${table.objectEntityId} is null and ${table.objectValue} is not null)`,
    ),
    check(
      "ck_claims_object_value_type",
      sql`${table.objectEntityId} is not null or ${table.objectValueType} is not null`,
    ),
    check(
      "ck_claims_confidence",
      sql`${table.confidenceBps} between 0 and 10000`,
    ),
  ],
);

export const claimStatusEvents = sqliteTable(
  "claim_status_events",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    status: text("status", {
      enum: ["draft", "accepted", "rejected", "superseded", "retracted"],
    }).notNull(),
    reason: text("reason"),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    occurredAt: text("occurred_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_claim_status_events_revision").on(table.claimId, table.revision),
    index("idx_claim_status_events_claim_time").on(table.claimId, table.occurredAt),
    check(
      "ck_claim_status_events_status",
      sql`${table.status} in ('draft', 'accepted', 'rejected', 'superseded', 'retracted')`,
    ),
    check("ck_claim_status_events_revision", sql`${table.revision} >= 1`),
  ],
);

export const claimEvidence = sqliteTable(
  "claim_evidence",
  {
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "restrict" }),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    stance: text("stance", { enum: ["supports", "contradicts", "context"] })
      .notNull()
      .default("supports"),
    strengthBps: integer("strength_bps").notNull().default(0),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.claimId, table.evidenceId, table.stance] }),
    index("idx_claim_evidence_evidence").on(table.evidenceId),
    check(
      "ck_claim_evidence_stance",
      sql`${table.stance} in ('supports', 'contradicts', 'context')`,
    ),
    check(
      "ck_claim_evidence_strength",
      sql`${table.strengthBps} between 0 and 10000`,
    ),
  ],
);

export const relations = sqliteTable(
  "relations",
  {
    id: text("id").primaryKey(),
    sourceEntityId: text("source_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    predicate: text("predicate").notNull(),
    targetEntityId: text("target_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    assertedByClaimId: text("asserted_by_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["active", "superseded", "retracted"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_relations_claim_edge").on(
      table.sourceEntityId,
      table.predicate,
      table.targetEntityId,
      table.assertedByClaimId,
    ),
    index("idx_relations_source_predicate").on(table.sourceEntityId, table.predicate),
    index("idx_relations_target_predicate").on(table.targetEntityId, table.predicate),
    check(
      "ck_relations_status",
      sql`${table.status} in ('active', 'superseded', 'retracted')`,
    ),
  ],
);

export const researchRuns = sqliteTable(
  "research_runs",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    triggerType: text("trigger_type", {
      enum: ["manual", "schedule", "webhook", "backfill"],
    }).notNull(),
    scope: text("scope").notNull(),
    status: text("status", {
      enum: ["queued", "running", "waiting_review", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cursor: text("cursor"),
    statisticsJson: text("statistics_json").notNull().default(emptyObject),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    version: integer("version").notNull().default(1),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_research_runs_idempotency_key").on(table.idempotencyKey),
    index("idx_research_runs_status_created").on(table.status, table.createdAt),
    check(
      "ck_research_runs_trigger",
      sql`${table.triggerType} in ('manual', 'schedule', 'webhook', 'backfill')`,
    ),
    check(
      "ck_research_runs_status",
      sql`${table.status} in ('queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled')`,
    ),
    check("ck_research_runs_stats_json", sql`json_valid(${table.statisticsJson})`),
    check("ck_research_runs_version", sql`${table.version} >= 1`),
  ],
);

export const candidateChanges = sqliteTable(
  "candidate_changes",
  {
    id: text("id").primaryKey(),
    researchRunId: text("research_run_id")
      .notNull()
      .references(() => researchRuns.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    action: text("action", {
      enum: ["add", "update", "retire", "link", "unlink"],
    }).notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    proposedJson: text("proposed_json").notNull(),
    diffJson: text("diff_json").notNull().default(emptyObject),
    rationale: text("rationale").notNull(),
    proposedByUserId: text("proposed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    confidenceBps: integer("confidence_bps").notNull().default(0),
    status: text("status", {
      enum: ["candidate", "needs_review", "accepted", "rejected", "published", "failed"],
    })
      .notNull()
      .default("candidate"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_candidate_changes_idempotency_key").on(table.idempotencyKey),
    index("idx_candidate_changes_run_status").on(table.researchRunId, table.status),
    index("idx_candidate_changes_review_queue").on(table.status, table.createdAt),
    check(
      "ck_candidate_changes_action",
      sql`${table.action} in ('add', 'update', 'retire', 'link', 'unlink')`,
    ),
    check(
      "ck_candidate_changes_status",
      sql`${table.status} in ('candidate', 'needs_review', 'accepted', 'rejected', 'published', 'failed')`,
    ),
    check(
      "ck_candidate_changes_confidence",
      sql`${table.confidenceBps} between 0 and 10000`,
    ),
    check("ck_candidate_changes_version", sql`${table.version} >= 1`),
    check("ck_candidate_changes_proposed_json", sql`json_valid(${table.proposedJson})`),
    check("ck_candidate_changes_diff_json", sql`json_valid(${table.diffJson})`),
  ],
);

export const candidateReviews = sqliteTable(
  "candidate_reviews",
  {
    id: text("id").primaryKey(),
    candidateChangeId: text("candidate_change_id")
      .notNull()
      .references(() => candidateChanges.id, { onDelete: "restrict" }),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: text("decision", { enum: ["accept", "reject", "request_changes"] })
      .notNull(),
    comment: text("comment"),
    candidateVersion: integer("candidate_version").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("uq_candidate_reviews_candidate_version").on(
      table.candidateChangeId,
      table.candidateVersion,
    ),
    index("idx_candidate_reviews_candidate_time").on(
      table.candidateChangeId,
      table.createdAt,
    ),
    check(
      "ck_candidate_reviews_decision",
      sql`${table.decision} in ('accept', 'reject', 'request_changes')`,
    ),
    check("ck_candidate_reviews_version", sql`${table.candidateVersion} >= 1`),
  ],
);

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["club"] }).notNull(),
    eventType: text("event_type", {
      enum: ["page_view", "content_view", "engagement"],
    }).notNull(),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    path: text("path").notNull(),
    contentKey: text("content_key"),
    referrerSource: text("referrer_source", {
      enum: [
        "search:google", "search:bing", "search:baidu", "search:other",
        "ai:chatgpt", "code:github", "social:wechat", "social:zhihu",
        "social:other", "other",
      ],
    }),
    deviceClass: text("device_class", {
      enum: ["desktop", "tablet", "mobile", "other"],
    }).notNull(),
    durationMs: integer("duration_ms"),
    occurredAt: text("occurred_at").notNull(),
    occurredDate: text("occurred_date").notNull(),
    receivedAt: text("received_at").notNull().default(now),
  },
  (table) => [
    index("idx_analytics_events_occurred_at").on(table.occurredAt),
    index("idx_analytics_events_date_source").on(table.occurredDate, table.source),
    index("idx_analytics_events_path_date").on(table.path, table.occurredDate),
    index("idx_analytics_events_visitor_date").on(table.visitorId, table.occurredDate),
    index("idx_analytics_events_session_time").on(table.sessionId, table.occurredAt),
    check("ck_analytics_events_source", sql`${table.source} = 'club'`),
    check(
      "ck_analytics_events_type",
      sql`${table.eventType} in ('page_view', 'content_view', 'engagement')`,
    ),
    check(
      "ck_analytics_events_device_class",
      sql`${table.deviceClass} in ('desktop', 'tablet', 'mobile', 'other')`,
    ),
    check("ck_analytics_events_path", sql`length(${table.path}) between 1 and 160`),
    check(
      "ck_analytics_events_content_key",
      sql`${table.contentKey} is null or length(${table.contentKey}) between 1 and 160`,
    ),
    check(
      "ck_analytics_events_referrer_source",
      sql`${table.referrerSource} is null or ${table.referrerSource} in ('search:google', 'search:bing', 'search:baidu', 'search:other', 'ai:chatgpt', 'code:github', 'social:wechat', 'social:zhihu', 'social:other', 'other')`,
    ),
    check(
      "ck_analytics_events_duration",
      sql`${table.durationMs} is null or ${table.durationMs} between 1000 and 1800000`,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type UserLlmCredentialRow = typeof userLlmCredentials.$inferSelect;
export type UserLlmPreferenceRow = typeof userLlmPreferences.$inferSelect;
export type EntityRow = typeof entities.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type RelationRow = typeof relations.$inferSelect;
export type ResearchRunRow = typeof researchRuns.$inferSelect;
export type CandidateChangeRow = typeof candidateChanges.$inferSelect;
export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
