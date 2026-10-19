CREATE TABLE "ai_turn_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"attempt" integer,
	"since_submitted_ms" integer,
	"mode" text NOT NULL,
	"route" text NOT NULL,
	"rerouted" boolean DEFAULT false NOT NULL,
	"route_decision" jsonb,
	"model" text,
	"outcome" text NOT NULL,
	"error_code" text,
	"stopped_by_limit" boolean DEFAULT false NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"total_ms" integer NOT NULL,
	"stages" jsonb NOT NULL,
	"tools" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_turn_traces_created_idx" ON "ai_turn_traces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_turn_traces_user_idx" ON "ai_turn_traces" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_turn_traces_job_idx" ON "ai_turn_traces" USING btree ("job_id");