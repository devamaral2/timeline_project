CREATE TABLE "recurrence_exceptions" (
	"recurrence_id" char(26) NOT NULL,
	"occurrence_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrence_exceptions_recurrence_id_occurrence_on_pk" PRIMARY KEY("recurrence_id","occurrence_on")
);
--> statement-breakpoint
CREATE TABLE "recurrences" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"freq" text NOT NULL,
	"interval_count" smallint DEFAULT 1 NOT NULL,
	"byweekday" smallint,
	"bymonthday" smallint,
	"bymonth" smallint,
	"time_of_day" time NOT NULL,
	"duration_minutes" integer,
	"time_zone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"template" jsonb NOT NULL,
	"materialized_through" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrences_revision_min" CHECK ("recurrences"."revision" >= 1),
	CONSTRAINT "recurrences_freq_valid" CHECK ("recurrences"."freq" IN ('daily', 'weekly', 'monthly', 'yearly')),
	CONSTRAINT "recurrences_interval_min" CHECK ("recurrences"."interval_count" >= 1),
	CONSTRAINT "recurrences_byweekday_shape" CHECK (("recurrences"."freq" = 'weekly') = ("recurrences"."byweekday" IS NOT NULL)),
	CONSTRAINT "recurrences_byweekday_range" CHECK ("recurrences"."byweekday" IS NULL OR "recurrences"."byweekday" BETWEEN 1 AND 127),
	CONSTRAINT "recurrences_bymonthday_shape" CHECK (("recurrences"."freq" IN ('monthly', 'yearly')) = ("recurrences"."bymonthday" IS NOT NULL)),
	CONSTRAINT "recurrences_bymonthday_range" CHECK ("recurrences"."bymonthday" IS NULL OR "recurrences"."bymonthday" BETWEEN 1 AND 31),
	CONSTRAINT "recurrences_bymonth_shape" CHECK (("recurrences"."freq" = 'yearly') = ("recurrences"."bymonth" IS NOT NULL)),
	CONSTRAINT "recurrences_bymonth_range" CHECK ("recurrences"."bymonth" IS NULL OR "recurrences"."bymonth" BETWEEN 1 AND 12),
	CONSTRAINT "recurrences_ends_after_starts" CHECK ("recurrences"."ends_on" IS NULL OR "recurrences"."ends_on" >= "recurrences"."starts_on"),
	CONSTRAINT "recurrences_duration_positive" CHECK ("recurrences"."duration_minutes" IS NULL OR "recurrences"."duration_minutes" > 0),
	CONSTRAINT "recurrences_template_object" CHECK (jsonb_typeof("recurrences"."template") = 'object')
);
--> statement-breakpoint
CREATE TABLE "event_entries" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"event_id" char(26) NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"role" text,
	"content" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_entries_kind_valid" CHECK ("event_entries"."kind" IN ('message', 'thought', 'trace', 'result', 'input')),
	CONSTRAINT "event_entries_role_only_in_message" CHECK (("event_entries"."kind" = 'message') = ("event_entries"."role" IS NOT NULL)),
	CONSTRAINT "event_entries_role_valid" CHECK ("event_entries"."role" IS NULL OR "event_entries"."role" IN ('user', 'agent')),
	CONSTRAINT "event_entries_trace_without_text" CHECK ("event_entries"."kind" <> 'trace' OR "event_entries"."content" IS NULL),
	CONSTRAINT "event_entries_data_object" CHECK (jsonb_typeof("event_entries"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"status" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone,
	"estimated_finish_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"notify_offsets_minutes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"recurrence_id" char(26),
	"occurrence_on" date,
	"recurrence_detached" boolean DEFAULT false NOT NULL,
	"long_running" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "events_revision_min" CHECK ("events"."revision" >= 1),
	CONSTRAINT "events_actor_valid" CHECK ("events"."actor" IN ('human', 'agent')),
	CONSTRAINT "events_priority_valid" CHECK ("events"."priority" IN ('urgent', 'high', 'medium', 'low')),
	CONSTRAINT "events_kind_matches_actor" CHECK (("events"."actor" = 'human' AND "events"."kind" IN ('routine', 'meal', 'sleep', 'training')) OR ("events"."actor" = 'agent' AND "events"."kind" IN ('request', 'search_request', 'build_request', 'inquiry_request', 'review_request', 'cron', 'step'))),
	CONSTRAINT "events_status_matches_actor" CHECK (("events"."actor" = 'human' AND ("events"."status" IS NULL OR "events"."status" IN ('todo', 'toDefine', 'doing', 'inHold', 'done', 'cancel', 'missed'))) OR ("events"."actor" = 'agent' AND "events"."status" IS NOT NULL AND "events"."status" IN ('queued', 'running', 'waiting', 'done', 'failed', 'cancel'))),
	CONSTRAINT "events_long_running_shape" CHECK (NOT "events"."long_running" OR ("events"."actor" = 'human' AND "events"."status" IS NOT NULL AND "events"."status" <> 'missed' AND "events"."recurrence_id" IS NULL)),
	CONSTRAINT "events_long_running_notify" CHECK (NOT "events"."long_running" OR "events"."estimated_finish_at" IS NOT NULL OR cardinality("events"."notify_offsets_minutes") = 0),
	CONSTRAINT "events_block_span" CHECK ("events"."long_running" OR "events"."started_at" IS NULL OR "events"."estimated_finish_at" IS NULL OR ("events"."estimated_finish_at" >= "events"."started_at" AND "events"."estimated_finish_at" - "events"."started_at" <= interval '31 days')),
	CONSTRAINT "events_occurrence_requires_day" CHECK ("events"."recurrence_id" IS NULL OR "events"."occurrence_on" IS NOT NULL),
	CONSTRAINT "events_notify_offsets_valid" CHECK (1 <= ALL("events"."notify_offsets_minutes") AND 43200 >= ALL("events"."notify_offsets_minutes")),
	CONSTRAINT "events_data_object" CHECK (jsonb_typeof("events"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"derived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "artifacts_revision_min" CHECK ("artifacts"."revision" >= 1),
	CONSTRAINT "artifacts_schema_version_min" CHECK ("artifacts"."schema_version" >= 1),
	CONSTRAINT "artifacts_type_valid" CHECK ("artifacts"."type" IN ('text', 'food', 'sleep', 'training', 'workout', 'skill', 'agent', 'router')),
	CONSTRAINT "artifacts_data_object" CHECK (jsonb_typeof("artifacts"."data") = 'object'),
	CONSTRAINT "artifacts_global_only_catalog" CHECK ("artifacts"."user_id" IS NOT NULL OR "artifacts"."type" IN ('food', 'workout'))
);
--> statement-breakpoint
CREATE TABLE "artifact_artifact_relation" (
	"from_artifact_id" char(26) NOT NULL,
	"to_artifact_id" char(26) NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_artifact_relation_from_artifact_id_to_artifact_id_relation_pk" PRIMARY KEY("from_artifact_id","to_artifact_id","relation"),
	CONSTRAINT "artifact_artifact_relation_valid" CHECK ("artifact_artifact_relation"."relation" IN ('derives')),
	CONSTRAINT "artifact_artifact_not_self" CHECK ("artifact_artifact_relation"."from_artifact_id" <> "artifact_artifact_relation"."to_artifact_id")
);
--> statement-breakpoint
CREATE TABLE "event_artifact_relation" (
	"event_id" char(26) NOT NULL,
	"artifact_id" char(26) NOT NULL,
	"relation" text NOT NULL,
	"position" smallint,
	"from_recurrence" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_artifact_relation_event_id_artifact_id_pk" PRIMARY KEY("event_id","artifact_id"),
	CONSTRAINT "event_artifact_event_position_unique" UNIQUE("event_id","position") DEFERRABLE INITIALLY IMMEDIATE,
	CONSTRAINT "event_artifact_relation_valid" CHECK ("event_artifact_relation"."relation" IN ('creates', 'updates', 'uses', 'deletes')),
	CONSTRAINT "event_artifact_position_nonneg" CHECK ("event_artifact_relation"."position" IS NULL OR "event_artifact_relation"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_event_relation" (
	"from_event_id" char(26) NOT NULL,
	"to_event_id" char(26) NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_event_relation_from_event_id_relation_to_event_id_pk" PRIMARY KEY("from_event_id","relation","to_event_id"),
	CONSTRAINT "event_event_relation_valid" CHECK ("event_event_relation"."relation" IN ('generates', 'updates', 'deletes', 'subtask', 'blocks', 'follow_up')),
	CONSTRAINT "event_event_not_self" CHECK ("event_event_relation"."from_event_id" <> "event_event_relation"."to_event_id")
);
--> statement-breakpoint
CREATE TABLE "artifact_tags" (
	"artifact_id" char(26) NOT NULL,
	"tag_id" char(26) NOT NULL,
	CONSTRAINT "artifact_tags_artifact_id_tag_id_pk" PRIMARY KEY("artifact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "event_tags" (
	"event_id" char(26) NOT NULL,
	"tag_id" char(26) NOT NULL,
	CONSTRAINT "event_tags_event_id_tag_id_pk" PRIMARY KEY("event_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_user_name_unique" UNIQUE("user_id","name"),
	CONSTRAINT "tag_name_normalized" CHECK ("tags"."name" = lower(btrim("tags"."name")) AND "tags"."name" <> '')
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"event_id" char(26),
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"concurrency_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_status_valid" CHECK ("jobs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_scope_key_pk" PRIMARY KEY("user_id","scope","key")
);
--> statement-breakpoint
ALTER TABLE "recurrence_exceptions" ADD CONSTRAINT "recurrence_exceptions_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entries" ADD CONSTRAINT "event_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_artifact_relation" ADD CONSTRAINT "artifact_artifact_relation_from_artifact_id_artifacts_id_fk" FOREIGN KEY ("from_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_artifact_relation" ADD CONSTRAINT "artifact_artifact_relation_to_artifact_id_artifacts_id_fk" FOREIGN KEY ("to_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_artifact_relation" ADD CONSTRAINT "event_artifact_relation_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_artifact_relation" ADD CONSTRAINT "event_artifact_relation_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_event_relation" ADD CONSTRAINT "event_event_relation_from_event_id_events_id_fk" FOREIGN KEY ("from_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_event_relation" ADD CONSTRAINT "event_event_relation_to_event_id_events_id_fk" FOREIGN KEY ("to_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_tags" ADD CONSTRAINT "artifact_tags_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_tags" ADD CONSTRAINT "artifact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurrences_user_idx" ON "recurrences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurrences_pending_idx" ON "recurrences" USING btree ("user_id","materialized_through");--> statement-breakpoint
CREATE INDEX "event_entries_event_idx" ON "event_entries" USING btree ("event_id","id");--> statement-breakpoint
CREATE INDEX "events_agenda_idx" ON "events" USING btree ("user_id","started_at","id") WHERE "events"."started_at" IS NOT NULL AND NOT "events"."long_running" AND "events"."kind" <> 'step' AND "events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "events_tracked_idx" ON "events" USING btree ("user_id","status",(coalesce(started_at, estimated_finish_at)),"id") WHERE "events"."status" IS NOT NULL AND "events"."kind" <> 'step' AND "events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "events_requests_idx" ON "events" USING btree ("user_id","id" DESC NULLS LAST) WHERE "events"."actor" = 'agent' AND "events"."kind" <> 'step' AND "events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "events_user_live_idx" ON "events" USING btree ("user_id","id") WHERE "events"."actor" = 'human' AND "events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "events_recurrence_occurrence_unique" ON "events" USING btree ("recurrence_id","occurrence_on") WHERE "events"."recurrence_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "artifacts_user_type_recent_idx" ON "artifacts" USING btree ("user_id","type","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "artifacts"."deleted_at" IS NULL AND NOT "artifacts"."derived";--> statement-breakpoint
CREATE INDEX "artifacts_global_idx" ON "artifacts" USING btree ("type","name") WHERE "artifacts"."user_id" IS NULL AND "artifacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_workout_code_unique" ON "artifacts" USING btree ((data ->> 'code')) WHERE "artifacts"."type" = 'workout' AND "artifacts"."user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_agent_file_unique" ON "artifacts" USING btree ("user_id",(data ->> 'path')) WHERE "artifacts"."type" IN ('skill', 'agent') AND "artifacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_derives_copy_unique" ON "artifact_artifact_relation" USING btree ("to_artifact_id") WHERE "artifact_artifact_relation"."relation" = 'derives';--> statement-breakpoint
CREATE INDEX "event_artifact_reverse_idx" ON "event_artifact_relation" USING btree ("artifact_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_event_reverse_idx" ON "event_event_relation" USING btree ("to_event_id","relation","from_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_event_follow_up_unique" ON "event_event_relation" USING btree ("to_event_id") WHERE "event_event_relation"."relation" = 'follow_up';--> statement-breakpoint
CREATE INDEX "artifact_tags_tag_idx" ON "artifact_tags" USING btree ("tag_id","artifact_id");--> statement-breakpoint
CREATE INDEX "event_tags_tag_idx" ON "event_tags" USING btree ("tag_id","event_id");--> statement-breakpoint
CREATE INDEX "tags_user_name_prefix_idx" ON "tags" USING btree ("user_id","name" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_unique" ON "jobs" USING btree ("user_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_queue_idx" ON "jobs" USING btree ("available_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_lease_idx" ON "jobs" USING btree ("lease_until") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_event_idx" ON "jobs" USING btree ("event_id") WHERE "jobs"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_concurrency_idx" ON "jobs" USING btree ("concurrency_key","created_at","id") WHERE "jobs"."concurrency_key" IS NOT NULL AND "jobs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "jobs_finished_idx" ON "jobs" USING btree ("updated_at") WHERE "jobs"."status" IN ('succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "artifacts" ("id", "user_id", "type", "name", "data") VALUES
  ('01KDVDNA00D5NXMHPDBZATY4WT', NULL, 'workout', 'Esteira', '{"code":"treadmill","category":"cardio","active":true}'),
  ('01KDVDNA0124XD880E1MH1WADH', NULL, 'workout', 'Corrida', '{"code":"running","category":"cardio","active":true}'),
  ('01KDVDNA02J6RBHR6VX58P4NZG', NULL, 'workout', 'Caminhada', '{"code":"walking","category":"cardio","active":true}'),
  ('01KDVDNA0345S64WHDKJ31Q9WJ', NULL, 'workout', 'Musculação', '{"code":"weightlifting","category":"strength","active":true}'),
  ('01KDVDNA042EV5NBHZMEM0PC6X', NULL, 'workout', 'Livre', '{"code":"free","category":"free","active":true}');
