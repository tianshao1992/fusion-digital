CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`outcome` text DEFAULT 'success' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_audit_events_outcome" CHECK("audit_events"."outcome" in ('success', 'denied', 'failure')),
	CONSTRAINT "ck_audit_events_metadata_json" CHECK(json_valid("audit_events"."metadata_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_resource_time` ON `audit_events` (`resource_type`,`resource_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_actor_time` ON `audit_events` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_request_id` ON `audit_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `candidate_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`research_run_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`proposed_json` text NOT NULL,
	`diff_json` text DEFAULT '{}' NOT NULL,
	`rationale` text NOT NULL,
	`proposed_by_user_id` text,
	`confidence_bps` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`research_run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_candidate_changes_action" CHECK("candidate_changes"."action" in ('add', 'update', 'retire', 'link', 'unlink')),
	CONSTRAINT "ck_candidate_changes_status" CHECK("candidate_changes"."status" in ('candidate', 'needs_review', 'accepted', 'rejected', 'published', 'failed')),
	CONSTRAINT "ck_candidate_changes_confidence" CHECK("candidate_changes"."confidence_bps" between 0 and 10000),
	CONSTRAINT "ck_candidate_changes_version" CHECK("candidate_changes"."version" >= 1),
	CONSTRAINT "ck_candidate_changes_proposed_json" CHECK(json_valid("candidate_changes"."proposed_json")),
	CONSTRAINT "ck_candidate_changes_diff_json" CHECK(json_valid("candidate_changes"."diff_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_candidate_changes_idempotency_key` ON `candidate_changes` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_candidate_changes_run_status` ON `candidate_changes` (`research_run_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_candidate_changes_review_queue` ON `candidate_changes` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `candidate_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_change_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`comment` text,
	`candidate_version` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`candidate_change_id`) REFERENCES `candidate_changes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_candidate_reviews_decision" CHECK("candidate_reviews"."decision" in ('accept', 'reject', 'request_changes')),
	CONSTRAINT "ck_candidate_reviews_version" CHECK("candidate_reviews"."candidate_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_candidate_reviews_candidate_version` ON `candidate_reviews` (`candidate_change_id`,`candidate_version`);--> statement-breakpoint
CREATE INDEX `idx_candidate_reviews_candidate_time` ON `candidate_reviews` (`candidate_change_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `claim_evidence` (
	`claim_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`stance` text DEFAULT 'supports' NOT NULL,
	`strength_bps` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`claim_id`, `evidence_id`, `stance`),
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_claim_evidence_stance" CHECK("claim_evidence"."stance" in ('supports', 'contradicts', 'context')),
	CONSTRAINT "ck_claim_evidence_strength" CHECK("claim_evidence"."strength_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE INDEX `idx_claim_evidence_evidence` ON `claim_evidence` (`evidence_id`);--> statement-breakpoint
CREATE TABLE `claim_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`actor_user_id` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_claim_status_events_status" CHECK("claim_status_events"."status" in ('draft', 'accepted', 'rejected', 'superseded', 'retracted')),
	CONSTRAINT "ck_claim_status_events_revision" CHECK("claim_status_events"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_claim_status_events_revision` ON `claim_status_events` (`claim_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_claim_status_events_claim_time` ON `claim_status_events` (`claim_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_entity_id` text NOT NULL,
	`predicate` text NOT NULL,
	`object_entity_id` text,
	`object_value` text,
	`object_value_type` text,
	`statement` text NOT NULL,
	`confidence_bps` integer DEFAULT 0 NOT NULL,
	`supersedes_claim_id` text,
	`valid_from` text,
	`valid_until` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`subject_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`object_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_claims_object" CHECK(("claims"."object_entity_id" is not null and "claims"."object_value" is null) or ("claims"."object_entity_id" is null and "claims"."object_value" is not null)),
	CONSTRAINT "ck_claims_object_value_type" CHECK("claims"."object_entity_id" is not null or "claims"."object_value_type" is not null),
	CONSTRAINT "ck_claims_confidence" CHECK("claims"."confidence_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE INDEX `idx_claims_subject_predicate` ON `claims` (`subject_entity_id`,`predicate`);--> statement-breakpoint
CREATE INDEX `idx_claims_object_predicate` ON `claims` (`object_entity_id`,`predicate`);--> statement-breakpoint
CREATE INDEX `idx_claims_supersedes` ON `claims` (`supersedes_claim_id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`canonical_key` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_by_user_id` text,
	`updated_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_entities_visibility" CHECK("entities"."visibility" in ('public', 'members', 'private')),
	CONSTRAINT "ck_entities_status" CHECK("entities"."status" in ('active', 'superseded', 'retracted', 'archived')),
	CONSTRAINT "ck_entities_version" CHECK("entities"."version" >= 1),
	CONSTRAINT "ck_entities_metadata_json" CHECK(json_valid("entities"."metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_entities_canonical_key` ON `entities` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `idx_entities_type_status` ON `entities` (`entity_type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_entities_visibility_status` ON `entities` (`visibility`,`status`);--> statement-breakpoint
CREATE TABLE `entity_aliases` (
	`entity_id` text NOT NULL,
	`alias` text NOT NULL,
	`alias_normalized` text NOT NULL,
	`language` text DEFAULT 'und' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`entity_id`, `alias_normalized`, `language`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_entity_aliases_lookup` ON `entity_aliases` (`alias_normalized`,`language`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_type` text NOT NULL,
	`source_uri` text NOT NULL,
	`source_title` text NOT NULL,
	`locator` text DEFAULT '' NOT NULL,
	`excerpt` text,
	`content_hash` text NOT NULL,
	`evidence_level` text DEFAULT 'unrated' NOT NULL,
	`published_at` text,
	`retrieved_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_evidence_metadata_json" CHECK(json_valid("evidence"."metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_evidence_source_locator_hash` ON `evidence` (`source_uri`,`locator`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_evidence_source_uri` ON `evidence` (`source_uri`);--> statement-breakpoint
CREATE INDEX `idx_evidence_type_level` ON `evidence` (`evidence_type`,`evidence_level`);--> statement-breakpoint
CREATE TABLE `quota_overrides` (
	`user_id` text PRIMARY KEY NOT NULL,
	`daily_request_limit` integer,
	`daily_token_limit` integer,
	`max_tokens_per_request` integer,
	`valid_until` text,
	`reason` text,
	`updated_by_user_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_quota_overrides_requests" CHECK("quota_overrides"."daily_request_limit" is null or "quota_overrides"."daily_request_limit" >= 0),
	CONSTRAINT "ck_quota_overrides_tokens" CHECK("quota_overrides"."daily_token_limit" is null or "quota_overrides"."daily_token_limit" >= 0),
	CONSTRAINT "ck_quota_overrides_max_tokens" CHECK("quota_overrides"."max_tokens_per_request" is null or "quota_overrides"."max_tokens_per_request" >= 0)
);
--> statement-breakpoint
CREATE TABLE `relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_entity_id` text NOT NULL,
	`predicate` text NOT NULL,
	`target_entity_id` text NOT NULL,
	`asserted_by_claim_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`source_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asserted_by_claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_relations_status" CHECK("relations"."status" in ('active', 'superseded', 'retracted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_relations_claim_edge` ON `relations` (`source_entity_id`,`predicate`,`target_entity_id`,`asserted_by_claim_id`);--> statement-breakpoint
CREATE INDEX `idx_relations_source_predicate` ON `relations` (`source_entity_id`,`predicate`);--> statement-breakpoint
CREATE INDEX `idx_relations_target_predicate` ON `relations` (`target_entity_id`,`predicate`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`trigger_type` text NOT NULL,
	`scope` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`requested_by_user_id` text,
	`cursor` text,
	`statistics_json` text DEFAULT '{}' NOT NULL,
	`error_code` text,
	`error_message` text,
	`version` integer DEFAULT 1 NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_research_runs_trigger" CHECK("research_runs"."trigger_type" in ('manual', 'schedule', 'webhook', 'backfill')),
	CONSTRAINT "ck_research_runs_status" CHECK("research_runs"."status" in ('queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "ck_research_runs_stats_json" CHECK(json_valid("research_runs"."statistics_json")),
	CONSTRAINT "ck_research_runs_version" CHECK("research_runs"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_runs_idempotency_key` ON `research_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_research_runs_status_created` ON `research_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`reserved_tokens` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `usage_date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_usage_daily_requests" CHECK("usage_daily"."request_count" >= 0),
	CONSTRAINT "ck_usage_daily_reserved" CHECK("usage_daily"."reserved_tokens" >= 0),
	CONSTRAINT "ck_usage_daily_input" CHECK("usage_daily"."input_tokens" >= 0),
	CONSTRAINT "ck_usage_daily_output" CHECK("usage_daily"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`capability` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`status` text NOT NULL,
	`reserved_tokens` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`expires_at` text NOT NULL,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_usage_events_status" CHECK("usage_events"."status" in ('reserved', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "ck_usage_events_reserved" CHECK("usage_events"."reserved_tokens" >= 0),
	CONSTRAINT "ck_usage_events_input" CHECK("usage_events"."input_tokens" >= 0),
	CONSTRAINT "ck_usage_events_output" CHECK("usage_events"."output_tokens" >= 0),
	CONSTRAINT "ck_usage_events_metadata_json" CHECK(json_valid("usage_events"."metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_usage_events_request_id` ON `usage_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_user_time` ON `usage_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_user_date` ON `usage_events` (`user_id`,`usage_date`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`granted_by_user_id` text,
	`granted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`user_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_user_roles_role" CHECK("user_roles"."role" in ('member', 'contributor', 'reviewer', 'admin', 'agent'))
);
--> statement-breakpoint
CREATE INDEX `idx_user_roles_active` ON `user_roles` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`siwc_subject` text NOT NULL,
	`email` text NOT NULL,
	`email_normalized` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "ck_users_status" CHECK("users"."status" in ('active', 'suspended', 'deleted')),
	CONSTRAINT "ck_users_version" CHECK("users"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_siwc_subject` ON `users` (`siwc_subject`);--> statement-breakpoint
CREATE INDEX `idx_users_email_normalized` ON `users` (`email_normalized`);