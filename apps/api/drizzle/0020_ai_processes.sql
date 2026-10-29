CREATE TABLE "ai_process_entities" (
	"process_id" text NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"step_id" text NOT NULL,
	"operation" text NOT NULL,
	"summary" jsonb NOT NULL,
	"finalized_at" timestamp with time zone,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_process_entities_process_id_entity_kind_entity_id_pk" PRIMARY KEY("process_id","entity_kind","entity_id")
);
--> statement-breakpoint
CREATE TABLE "ai_process_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"process_id" text NOT NULL,
	"agent" text NOT NULL,
	"expected" text DEFAULT 'one' NOT NULL,
	"payload" jsonb,
	"job_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"result" jsonb,
	"timings" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_process_steps_status_check" CHECK ("ai_process_steps"."status" in ('pending','running','succeeded','failed'))
);
--> statement-breakpoint
CREATE TABLE "ai_processes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"prompt" text NOT NULL,
	"context" jsonb,
	"status" text DEFAULT 'dispatching' NOT NULL,
	"dispatch" jsonb,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_processes_status_check" CHECK ("ai_processes"."status" in ('dispatching','running','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "ai_process_entities" ADD CONSTRAINT "ai_process_entities_process_id_ai_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."ai_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_process_entities" ADD CONSTRAINT "ai_process_entities_step_id_ai_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."ai_process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_process_steps" ADD CONSTRAINT "ai_process_steps_process_id_ai_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."ai_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_process_entities_step_idx" ON "ai_process_entities" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "ai_process_steps_process_idx" ON "ai_process_steps" USING btree ("process_id");--> statement-breakpoint
CREATE INDEX "ai_processes_user_idx" ON "ai_processes" USING btree ("user_id","created_at");