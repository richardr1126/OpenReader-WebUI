CREATE TABLE `compute_limit_admissions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`user_id` text NOT NULL,
	`is_anonymous` integer NOT NULL,
	`action` text NOT NULL,
	`state` text NOT NULL,
	`operation_id` text,
	`device_scope_key` text,
	`ip_scope_key` text,
	`policy_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`finished_at` integer,
	`lease_expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "compute_limit_admissions_state_valid" CHECK("compute_limit_admissions"."state" in ('reserved', 'active', 'finished', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compute_limit_admissions_request_unique` ON `compute_limit_admissions` (`user_id`,`action`,`request_key`);--> statement-breakpoint
CREATE INDEX `compute_limit_admissions_user_active` ON `compute_limit_admissions` (`user_id`,`action`,`state`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `compute_limit_admissions_action_active` ON `compute_limit_admissions` (`action`,`state`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `compute_limit_admissions_operation` ON `compute_limit_admissions` (`operation_id`);--> statement-breakpoint
CREATE TABLE `compute_limit_buckets` (
	`scope_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`action` text NOT NULL,
	`metric` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope_type`, `scope_key`, `action`, `metric`, `window_start`),
	CONSTRAINT "compute_limit_buckets_used_nonnegative" CHECK("compute_limit_buckets"."used" >= 0)
);
--> statement-breakpoint
CREATE INDEX `compute_limit_buckets_expiry` ON `compute_limit_buckets` (`window_end`,`metric`);--> statement-breakpoint
CREATE TABLE `compute_limit_events` (
	`event_key` text PRIMARY KEY NOT NULL,
	`admission_id` text,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`metric` text NOT NULL,
	`units` integer NOT NULL,
	`policy_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admission_id`) REFERENCES `compute_limit_admissions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "compute_limit_events_units_positive" CHECK("compute_limit_events"."units" > 0)
);
--> statement-breakpoint
CREATE INDEX `compute_limit_events_user_action_created` ON `compute_limit_events` (`user_id`,`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `compute_limit_events_created` ON `compute_limit_events` (`created_at`);--> statement-breakpoint
DROP TABLE `user_job_events`;--> statement-breakpoint
DROP TABLE `user_tts_chars`;--> statement-breakpoint
WITH `default_policy`(`value_json`) AS (VALUES ('{"schemaVersion":1,"actions":{"pdf_layout":{"mode":"off","admission":{"windows":[{"scope":"user","limit":8,"windowSeconds":60},{"scope":"user","limit":24,"windowSeconds":600}],"active":[{"scope":"user","limit":1,"leaseSeconds":86400},{"scope":"site","limit":8,"leaseSeconds":86400}]},"usage":[],"execution":{"priority":"foreground","maxQueued":50,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"cpu_heavy":1,"model_inference":1}}},"tts_playback":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":12,"windowSeconds":60},{"scope":"user","limit":60,"windowSeconds":3600}],"active":[{"scope":"user","limit":2,"leaseSeconds":1800},{"scope":"site","limit":50,"leaseSeconds":1800}]},"usage":[],"execution":{"priority":"interactive","maxQueued":100,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":60,"resources":{}}},"tts_playback_plan":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":12,"windowSeconds":60},{"scope":"user","limit":60,"windowSeconds":3600}],"active":[{"scope":"user","limit":2,"leaseSeconds":1800},{"scope":"site","limit":20,"leaseSeconds":1800}]},"usage":[],"execution":{"priority":"foreground","maxQueued":100,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"cpu_heavy":1}}},"tts_playback_export":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":2,"windowSeconds":600},{"scope":"user","limit":6,"windowSeconds":86400}],"active":[{"scope":"user","limit":1,"leaseSeconds":7200},{"scope":"site","limit":4,"leaseSeconds":7200}]},"usage":[],"execution":{"priority":"foreground","maxQueued":20,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"ffmpeg":1,"archive_io":1}}},"document_preview":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":30,"windowSeconds":600},{"scope":"user","limit":200,"windowSeconds":86400}],"active":[{"scope":"user","limit":4,"leaseSeconds":1800},{"scope":"site","limit":20,"leaseSeconds":1800}]},"usage":[],"execution":{"priority":"background","maxQueued":200,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":3600,"resources":{"cpu_heavy":1}}},"document_conversion":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":4,"windowSeconds":600},{"scope":"user","limit":20,"windowSeconds":86400}],"active":[{"scope":"user","limit":1,"leaseSeconds":600},{"scope":"site","limit":8,"leaseSeconds":600}]},"usage":[],"execution":{"priority":"foreground","maxQueued":50,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"cpu_heavy":1,"libreoffice":1}}},"account_export":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":2,"windowSeconds":3600},{"scope":"user","limit":4,"windowSeconds":86400}],"active":[{"scope":"user","limit":1,"leaseSeconds":7200},{"scope":"site","limit":4,"leaseSeconds":7200}]},"usage":[],"execution":{"priority":"background","maxQueued":20,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":3600,"resources":{"archive_io":1}}},"tts_synthesis":{"mode":"off","admission":{"windows":[],"active":[]},"usage":[{"scope":"user","audience":"anonymous","metric":"characters","window":"utc_day","limit":50000,"boundary":"soft_unit"},{"scope":"user","audience":"authenticated","metric":"characters","window":"utc_day","limit":500000,"boundary":"soft_unit"},{"scope":"anonymous_device","audience":"anonymous","metric":"characters","window":"utc_day","limit":50000,"boundary":"soft_unit"},{"scope":"ip","audience":"anonymous","metric":"characters","window":"utc_day","limit":100000,"boundary":"soft_unit"},{"scope":"ip","audience":"authenticated","metric":"characters","window":"utc_day","limit":1000000,"boundary":"soft_unit"}]}},"worker":{"maxExecutingPerWorker":3,"resources":{"cpu_heavy":1,"model_inference":1,"whisper_alignment":1,"ffmpeg":1,"libreoffice":1,"archive_io":2},"policyRefreshSeconds":60},"providers":{"defaults":{"mode":"observe","maxConcurrent":1,"requestsPerMinute":60,"charactersPerMinute":100000,"maxWaitSeconds":30},"overrides":{}}}'))
INSERT INTO `admin_settings` (`key`, `value_json`, `source`, `updated_at`)
SELECT 'computeLimitPolicies', json_set(
  `default_policy`.`value_json`,
  '$.actions.tts_playback_plan.execution.resources', json('{}'),
  '$.actions.tts_synthesis.mode', CASE COALESCE((SELECT json_extract(`value_json`, '$') FROM `admin_settings` WHERE `key` = 'disableTtsRateLimit'), 1) WHEN 1 THEN 'off' ELSE 'enforce' END,
  '$.actions.tts_synthesis.usage[0].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'ttsDailyLimitAnonymous'), 50000),
  '$.actions.tts_synthesis.usage[1].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'ttsDailyLimitAuthenticated'), 500000),
  '$.actions.tts_synthesis.usage[2].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'ttsDailyLimitAnonymous'), 50000),
  '$.actions.tts_synthesis.usage[3].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'ttsIpDailyLimitAnonymous'), 100000),
  '$.actions.tts_synthesis.usage[4].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'ttsIpDailyLimitAuthenticated'), 1000000),
  '$.actions.pdf_layout.mode', CASE COALESCE((SELECT json_extract(`value_json`, '$') FROM `admin_settings` WHERE `key` = 'disableComputeRateLimit'), 1) WHEN 1 THEN 'off' ELSE 'enforce' END,
  '$.actions.pdf_layout.admission.windows[0].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'computeParseBurstMax'), 8),
  '$.actions.pdf_layout.admission.windows[0].windowSeconds', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'computeParseBurstWindowSec'), 60),
  '$.actions.pdf_layout.admission.windows[1].limit', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'computeParseSustainedMax'), 24),
  '$.actions.pdf_layout.admission.windows[1].windowSeconds', COALESCE((SELECT CAST(json_extract(`value_json`, '$') AS integer) FROM `admin_settings` WHERE `key` = 'computeParseSustainedWindowSec'), 600)
), 'admin', CAST(unixepoch('subsecond') * 1000 AS integer)
FROM `default_policy`
WHERE EXISTS (SELECT 1 FROM `admin_settings` WHERE `key` IN ('disableTtsRateLimit', 'ttsDailyLimitAnonymous', 'ttsDailyLimitAuthenticated', 'ttsIpDailyLimitAnonymous', 'ttsIpDailyLimitAuthenticated', 'disableComputeRateLimit', 'computeParseBurstMax', 'computeParseBurstWindowSec', 'computeParseSustainedMax', 'computeParseSustainedWindowSec'))
  AND NOT EXISTS (SELECT 1 FROM `admin_settings` WHERE `key` = 'computeLimitPolicies');--> statement-breakpoint
DELETE FROM `admin_settings` WHERE `key` IN ('disableTtsRateLimit', 'ttsDailyLimitAnonymous', 'ttsDailyLimitAuthenticated', 'ttsIpDailyLimitAnonymous', 'ttsIpDailyLimitAuthenticated', 'disableComputeRateLimit', 'computeParseBurstMax', 'computeParseBurstWindowSec', 'computeParseSustainedMax', 'computeParseSustainedWindowSec');--> statement-breakpoint
DELETE FROM `scheduled_tasks` WHERE `key` IN ('prune-job-events', 'prune-tts-usage');
