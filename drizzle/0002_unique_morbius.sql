CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`event_type` text NOT NULL,
	`visitor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`path` text NOT NULL,
	`content_key` text,
	`referrer_source` text,
	`device_class` text NOT NULL,
	`duration_ms` integer,
	`occurred_at` text NOT NULL,
	`occurred_date` text NOT NULL,
	`received_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "ck_analytics_events_source" CHECK("analytics_events"."source" = 'club'),
	CONSTRAINT "ck_analytics_events_type" CHECK("analytics_events"."event_type" in ('page_view', 'content_view', 'engagement')),
	CONSTRAINT "ck_analytics_events_device_class" CHECK("analytics_events"."device_class" in ('desktop', 'tablet', 'mobile', 'other')),
	CONSTRAINT "ck_analytics_events_path" CHECK(length("analytics_events"."path") between 1 and 160),
	CONSTRAINT "ck_analytics_events_content_key" CHECK("analytics_events"."content_key" is null or length("analytics_events"."content_key") between 1 and 160),
	CONSTRAINT "ck_analytics_events_referrer_source" CHECK("analytics_events"."referrer_source" is null or "analytics_events"."referrer_source" in ('search:google', 'search:bing', 'search:baidu', 'search:other', 'ai:chatgpt', 'code:github', 'social:wechat', 'social:zhihu', 'social:other', 'other')),
	CONSTRAINT "ck_analytics_events_duration" CHECK("analytics_events"."duration_ms" is null or "analytics_events"."duration_ms" between 1000 and 1800000)
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_events_occurred_at` ON `analytics_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_date_source` ON `analytics_events` (`occurred_date`,`source`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_path_date` ON `analytics_events` (`path`,`occurred_date`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_visitor_date` ON `analytics_events` (`visitor_id`,`occurred_date`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_session_time` ON `analytics_events` (`session_id`,`occurred_at`);--> statement-breakpoint
PRAGMA optimize;
