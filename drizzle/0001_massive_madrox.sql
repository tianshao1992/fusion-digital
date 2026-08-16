CREATE TABLE `user_llm_credentials` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`key_hint` text NOT NULL,
	`model` text,
	`region` text,
	`enabled` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `provider`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_user_llm_credentials_provider" CHECK("user_llm_credentials"."provider" in ('openai', 'anthropic', 'deepseek', 'kimi')),
	CONSTRAINT "ck_user_llm_credentials_ciphertext" CHECK(length("user_llm_credentials"."ciphertext") between 1 and 4096),
	CONSTRAINT "ck_user_llm_credentials_iv" CHECK(length("user_llm_credentials"."iv") between 1 and 128),
	CONSTRAINT "ck_user_llm_credentials_key_version" CHECK("user_llm_credentials"."key_version" >= 1),
	CONSTRAINT "ck_user_llm_credentials_key_hint" CHECK(length("user_llm_credentials"."key_hint") between 1 and 64),
	CONSTRAINT "ck_user_llm_credentials_model" CHECK("user_llm_credentials"."model" is null or length("user_llm_credentials"."model") between 1 and 120),
	CONSTRAINT "ck_user_llm_credentials_region" CHECK("user_llm_credentials"."region" is null or "user_llm_credentials"."region" in ('cn', 'international')),
	CONSTRAINT "ck_user_llm_credentials_enabled" CHECK("user_llm_credentials"."enabled" in (0, 1)),
	CONSTRAINT "ck_user_llm_credentials_version" CHECK("user_llm_credentials"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE `user_llm_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_provider` text DEFAULT 'retrieval' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_user_llm_preferences_default_provider" CHECK("user_llm_preferences"."default_provider" in ('retrieval', 'openai', 'anthropic', 'deepseek', 'kimi')),
	CONSTRAINT "ck_user_llm_preferences_revision" CHECK("user_llm_preferences"."revision" >= 1)
);
