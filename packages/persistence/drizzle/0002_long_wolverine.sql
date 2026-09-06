CREATE TYPE "public"."work_item_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('inHold', 'todo', 'inProgress', 'done', 'cancel');--> statement-breakpoint
CREATE TABLE "plan_tags" (
	"plan_id" char(26) NOT NULL,
	"tag_id" char(26) NOT NULL,
	CONSTRAINT "plan_tags_plan_id_tag_id_pk" PRIMARY KEY("plan_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "work_item_status" DEFAULT 'todo' NOT NULL,
	"priority" "work_item_priority" DEFAULT 'medium' NOT NULL,
	"started_at" timestamp with time zone,
	"estimated_finish_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_revision_min" CHECK ("plans"."revision" >= 1),
	CONSTRAINT "plans_finished_after_started" CHECK ("plans"."started_at" IS NULL OR "plans"."finished_at" IS NULL OR "plans"."finished_at" >= "plans"."started_at")
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"task_id" char(26) NOT NULL,
	"tag_id" char(26) NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" char(26),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "work_item_status" DEFAULT 'todo' NOT NULL,
	"priority" "work_item_priority" DEFAULT 'medium' NOT NULL,
	"started_at" timestamp with time zone,
	"estimated_finish_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_revision_min" CHECK ("tasks"."revision" >= 1),
	CONSTRAINT "tasks_finished_after_started" CHECK ("tasks"."started_at" IS NULL OR "tasks"."finished_at" IS NULL OR "tasks"."finished_at" >= "tasks"."started_at")
);
--> statement-breakpoint
CREATE TABLE "event_tasks" (
	"event_id" char(26) NOT NULL,
	"task_id" char(26) NOT NULL,
	CONSTRAINT "event_tasks_event_id_task_id_pk" PRIMARY KEY("event_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "plan_tags" ADD CONSTRAINT "plan_tags_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_tags" ADD CONSTRAINT "plan_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_tags_tag_idx" ON "plan_tags" USING btree ("tag_id","plan_id");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_idx" ON "task_tags" USING btree ("tag_id","task_id");--> statement-breakpoint
CREATE INDEX "tasks_user_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_plan_idx" ON "tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "event_tasks_task_idx" ON "event_tasks" USING btree ("task_id","event_id");