CREATE TYPE "public"."recurrence_freq" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurrence_target" AS ENUM('event', 'task');--> statement-breakpoint
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
	"target_kind" "recurrence_target" NOT NULL,
	"freq" "recurrence_freq" NOT NULL,
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
ALTER TABLE "events" ADD COLUMN "recurrence_id" char(26);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "occurrence_on" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recurrence_detached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_id" char(26);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "occurrence_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_detached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_exceptions" ADD CONSTRAINT "recurrence_exceptions_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurrences_user_idx" ON "recurrences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurrences_pending_idx" ON "recurrences" USING btree ("user_id","materialized_through");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_recurrence_occurrence_unique" ON "events" USING btree ("recurrence_id","occurrence_on") WHERE "events"."recurrence_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "events_recurrence_idx" ON "events" USING btree ("recurrence_id","started_at") WHERE "events"."recurrence_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_recurrence_occurrence_unique" ON "tasks" USING btree ("recurrence_id","occurrence_on") WHERE "tasks"."recurrence_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_recurrence_idx" ON "tasks" USING btree ("recurrence_id","started_at") WHERE "tasks"."recurrence_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_occurrence_requires_day" CHECK ("events"."recurrence_id" IS NULL OR "events"."occurrence_on" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_occurrence_requires_day" CHECK ("tasks"."recurrence_id" IS NULL OR "tasks"."occurrence_on" IS NOT NULL);