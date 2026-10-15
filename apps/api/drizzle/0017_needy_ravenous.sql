CREATE TABLE "ai_job_outbox" (
	"job_id" text PRIMARY KEY NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_jobs_status_check" CHECK ("ai_jobs"."status" in ('queued','running','succeeded','failed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "ai_job_outbox" ADD CONSTRAINT "ai_job_outbox_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_dedupe_idx" ON "ai_jobs" USING btree ("user_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "ai_jobs_user_idx" ON "ai_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_recovery_idx" ON "ai_jobs" USING btree ("status","lease_until");