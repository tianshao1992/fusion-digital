-- One-time, site-owner-approved bootstrap for the existing active account.
-- This intentionally matches the immutable Sites-internal user ID rather than
-- an email address, request header, URL parameter, or first-user heuristic.
INSERT INTO `audit_events` (
	`id`,
	`actor_user_id`,
	`request_id`,
	`action`,
	`resource_type`,
	`resource_id`,
	`outcome`,
	`metadata_json`,
	`occurred_at`
)
SELECT
	'aud_8Y5WJWC7J110X4DWNGGRDSH1HM',
	NULL,
	'c0951415-4ef9-47d0-8a67-cc0f1e633386',
	'account.role.grant',
	'user_role',
	`u`.`id` || ':admin',
	'success',
	'{"method":"sites_d1_migration","reason":"site_owner_approved_initial_admin","role":"admin","migration":"0003_owner_approved_admin_bootstrap"}',
	'2026-08-30T01:34:13.751Z'
FROM `users` AS `u`
WHERE
	`u`.`id` = 'usr_2M07EMVVT966K1Q6JENHVR0Z8G'
	AND `u`.`status` = 'active'
	AND NOT EXISTS (
		SELECT 1
		FROM `user_roles` AS `ur`
		WHERE
			`ur`.`user_id` = `u`.`id`
			AND `ur`.`role` = 'admin'
			AND `ur`.`revoked_at` IS NULL
	)
ON CONFLICT (`id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `user_roles` (
	`user_id`,
	`role`,
	`granted_by_user_id`,
	`granted_at`,
	`revoked_at`
)
SELECT
	`id`,
	'admin',
	NULL,
	'2026-08-30T01:34:13.751Z',
	NULL
FROM `users`
WHERE
	`id` = 'usr_2M07EMVVT966K1Q6JENHVR0Z8G'
	AND `status` = 'active'
	AND EXISTS (
		SELECT 1
		FROM `audit_events` AS `ae`
		WHERE
			`ae`.`id` = 'aud_8Y5WJWC7J110X4DWNGGRDSH1HM'
			AND `ae`.`actor_user_id` IS NULL
			AND `ae`.`request_id` = 'c0951415-4ef9-47d0-8a67-cc0f1e633386'
			AND `ae`.`action` = 'account.role.grant'
			AND `ae`.`resource_type` = 'user_role'
			AND `ae`.`resource_id` = 'usr_2M07EMVVT966K1Q6JENHVR0Z8G:admin'
			AND `ae`.`outcome` = 'success'
			AND `ae`.`metadata_json` = '{"method":"sites_d1_migration","reason":"site_owner_approved_initial_admin","role":"admin","migration":"0003_owner_approved_admin_bootstrap"}'
			AND `ae`.`occurred_at` = '2026-08-30T01:34:13.751Z'
	)
ON CONFLICT (`user_id`, `role`) DO UPDATE SET
	`granted_by_user_id` = NULL,
	`granted_at` = excluded.`granted_at`,
	`revoked_at` = NULL
WHERE `user_roles`.`revoked_at` IS NOT NULL;
