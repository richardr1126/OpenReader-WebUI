CREATE TABLE "compute_limit_admissions" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"user_id" text NOT NULL,
	"is_anonymous" boolean NOT NULL,
	"action" text NOT NULL,
	"state" text NOT NULL,
	"operation_id" text,
	"device_scope_key" text,
	"ip_scope_key" text,
	"policy_version" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"activated_at" bigint,
	"finished_at" bigint,
	"lease_expires_at" bigint NOT NULL,
	CONSTRAINT "compute_limit_admissions_state_valid" CHECK ("compute_limit_admissions"."state" in ('reserved', 'active', 'finished', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "compute_limit_buckets" (
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"action" text NOT NULL,
	"metric" text NOT NULL,
	"window_start" bigint NOT NULL,
	"window_end" bigint NOT NULL,
	"used" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "compute_limit_buckets_scope_type_scope_key_action_metric_window_start_pk" PRIMARY KEY("scope_type","scope_key","action","metric","window_start"),
	CONSTRAINT "compute_limit_buckets_used_nonnegative" CHECK ("compute_limit_buckets"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "compute_limit_events" (
	"event_key" text PRIMARY KEY NOT NULL,
	"admission_id" text,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"metric" text NOT NULL,
	"units" bigint NOT NULL,
	"policy_version" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "compute_limit_events_units_positive" CHECK ("compute_limit_events"."units" > 0)
);
--> statement-breakpoint
DROP TABLE "user_job_events" CASCADE;--> statement-breakpoint
DROP TABLE "user_tts_chars" CASCADE;--> statement-breakpoint
ALTER TABLE "compute_limit_admissions" ADD CONSTRAINT "compute_limit_admissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_limit_events" ADD CONSTRAINT "compute_limit_events_admission_id_compute_limit_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."compute_limit_admissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_limit_events" ADD CONSTRAINT "compute_limit_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compute_limit_admissions_request_unique" ON "compute_limit_admissions" USING btree ("user_id","action","request_key");--> statement-breakpoint
CREATE INDEX "compute_limit_admissions_user_active" ON "compute_limit_admissions" USING btree ("user_id","action","state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "compute_limit_admissions_action_active" ON "compute_limit_admissions" USING btree ("action","state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "compute_limit_admissions_operation" ON "compute_limit_admissions" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "compute_limit_buckets_expiry" ON "compute_limit_buckets" USING btree ("window_end","metric");--> statement-breakpoint
CREATE INDEX "compute_limit_events_user_action_created" ON "compute_limit_events" USING btree ("user_id","action","created_at");--> statement-breakpoint
CREATE INDEX "compute_limit_events_created" ON "compute_limit_events" USING btree ("created_at");--> statement-breakpoint
WITH "default_policy"("value_json") AS (VALUES ('{"schemaVersion":1,"actions":{"pdf_layout":{"mode":"off","admission":{"windows":[{"scope":"user","limit":8,"windowSeconds":60},{"scope":"user","limit":24,"windowSeconds":600}],"active":[{"scope":"user","limit":1,"leaseSeconds":86400},{"scope":"site","limit":8,"leaseSeconds":86400}]},"usage":[],"execution":{"priority":"foreground","maxQueued":50,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"cpu_heavy":1,"model_inference":1}}},"tts_playback":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":12,"windowSeconds":60},{"scope":"user","limit":60,"windowSeconds":3600}],"active":[{"scope":"user","limit":2,"leaseSeconds":1800},{"scope":"site","limit":50,"leaseSeconds":1800}]},"usage":[],"execution":{"priority":"interactive","maxQueued":100,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":60,"resources":{}}},"tts_playback_plan":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":12,"windowSeconds":60},{"scope":"user","limit":60,"windowSeconds":3600}],"active":[{"scope":"user","limit":2,"leaseSeconds":1800},{"scope":"site","limit":20,"leaseSeconds":1800}]},"usage":[],"execution":{"priority":"foreground","maxQueued":100,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"cpu_heavy":1}}},"tts_playback_export":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":2,"windowSeconds":600},{"scope":"user","limit":6,"windowSeconds":86400}],"active":[{"scope":"user","limit":1,"leaseSeconds":7200},{"scope":"site","limit":4,"leaseSeconds":7200}]},"usage":[],"execution":{"priority":"foreground","maxQueued":20,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"ffmpeg":1,"archive_io":1}}},"document_preview":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":30,"windowSeconds":600},{"scope":"user","limit":200,"windowSeconds":86400}],"active":[{"scope":"user","limit":4,"leaseSeconds":1800},{"scope":"site","limit":20,"leaseSeconds":1800}]},"usage":[],"execution":{"priority":"background","maxQueued":200,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":3600,"resources":{"cpu_heavy":1}}},"document_conversion":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":4,"windowSeconds":600},{"scope":"user","limit":20,"windowSeconds":86400}],"active":[{"scope":"user","limit":1,"leaseSeconds":600},{"scope":"site","limit":8,"leaseSeconds":600}]},"usage":[],"execution":{"priority":"foreground","maxQueued":50,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":600,"resources":{"cpu_heavy":1,"libreoffice":1}}},"account_export":{"mode":"observe","admission":{"windows":[{"scope":"user","limit":2,"windowSeconds":3600},{"scope":"user","limit":4,"windowSeconds":86400}],"active":[{"scope":"user","limit":1,"leaseSeconds":7200},{"scope":"site","limit":4,"leaseSeconds":7200}]},"usage":[],"execution":{"priority":"background","maxQueued":20,"maxConcurrentPerWorker":1,"maxQueueAgeSeconds":3600,"resources":{"archive_io":1}}},"tts_synthesis":{"mode":"off","admission":{"windows":[],"active":[]},"usage":[{"scope":"user","audience":"anonymous","metric":"characters","window":"utc_day","limit":50000,"boundary":"soft_unit"},{"scope":"user","audience":"authenticated","metric":"characters","window":"utc_day","limit":500000,"boundary":"soft_unit"},{"scope":"anonymous_device","audience":"anonymous","metric":"characters","window":"utc_day","limit":50000,"boundary":"soft_unit"},{"scope":"ip","audience":"anonymous","metric":"characters","window":"utc_day","limit":100000,"boundary":"soft_unit"},{"scope":"ip","audience":"authenticated","metric":"characters","window":"utc_day","limit":1000000,"boundary":"soft_unit"}]}},"worker":{"maxExecutingPerWorker":3,"resources":{"cpu_heavy":1,"model_inference":1,"whisper_alignment":1,"ffmpeg":1,"libreoffice":1,"archive_io":2},"policyRefreshSeconds":60},"providers":{"defaults":{"mode":"observe","maxConcurrent":1,"requestsPerMinute":60,"charactersPerMinute":100000,"maxWaitSeconds":30},"overrides":{}}}'::jsonb))
INSERT INTO "admin_settings" ("key", "value_json", "source", "updated_at")
SELECT 'computeLimitPolicies',
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
    "default_policy"."value_json",
    '{actions,tts_synthesis,mode}', to_jsonb(CASE COALESCE((SELECT ("value_json" #>> '{}')::boolean FROM "admin_settings" WHERE "key" = 'disableTtsRateLimit'), true) WHEN true THEN 'off'::text ELSE 'enforce'::text END)),
    '{actions,tts_synthesis,usage,0,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'ttsDailyLimitAnonymous'), 50000))),
    '{actions,tts_synthesis,usage,1,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'ttsDailyLimitAuthenticated'), 500000))),
    '{actions,tts_synthesis,usage,2,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'ttsDailyLimitAnonymous'), 50000))),
    '{actions,tts_synthesis,usage,3,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'ttsIpDailyLimitAnonymous'), 100000))),
    '{actions,tts_synthesis,usage,4,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'ttsIpDailyLimitAuthenticated'), 1000000))),
    '{actions,pdf_layout,mode}', to_jsonb(CASE COALESCE((SELECT ("value_json" #>> '{}')::boolean FROM "admin_settings" WHERE "key" = 'disableComputeRateLimit'), true) WHEN true THEN 'off'::text ELSE 'enforce'::text END)),
    '{actions,pdf_layout,admission,windows,0,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'computeParseBurstMax'), 8))),
    '{actions,pdf_layout,admission,windows,0,windowSeconds}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'computeParseBurstWindowSec'), 60))),
    '{actions,pdf_layout,admission,windows,1,limit}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'computeParseSustainedMax'), 24))),
    '{actions,pdf_layout,admission,windows,1,windowSeconds}', to_jsonb(COALESCE((SELECT ("value_json" #>> '{}')::integer FROM "admin_settings" WHERE "key" = 'computeParseSustainedWindowSec'), 600))),
    '{actions,tts_playback_plan,execution,resources}', '{}'::jsonb),
  'admin', (extract(epoch from now()) * 1000)::bigint
FROM "default_policy"
WHERE EXISTS (SELECT 1 FROM "admin_settings" WHERE "key" IN ('disableTtsRateLimit', 'ttsDailyLimitAnonymous', 'ttsDailyLimitAuthenticated', 'ttsIpDailyLimitAnonymous', 'ttsIpDailyLimitAuthenticated', 'disableComputeRateLimit', 'computeParseBurstMax', 'computeParseBurstWindowSec', 'computeParseSustainedMax', 'computeParseSustainedWindowSec'))
  AND NOT EXISTS (SELECT 1 FROM "admin_settings" WHERE "key" = 'computeLimitPolicies');--> statement-breakpoint
DELETE FROM "admin_settings" WHERE "key" IN ('disableTtsRateLimit', 'ttsDailyLimitAnonymous', 'ttsDailyLimitAuthenticated', 'ttsIpDailyLimitAnonymous', 'ttsIpDailyLimitAuthenticated', 'disableComputeRateLimit', 'computeParseBurstMax', 'computeParseBurstWindowSec', 'computeParseSustainedMax', 'computeParseSustainedWindowSec');--> statement-breakpoint
DELETE FROM "scheduled_tasks" WHERE "key" IN ('prune-job-events', 'prune-tts-usage');
