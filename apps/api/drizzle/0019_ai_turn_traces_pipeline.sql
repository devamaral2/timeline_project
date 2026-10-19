ALTER TABLE "ai_turn_traces" ADD COLUMN "pipeline" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_turn_traces" ADD COLUMN "fast_fallback" text;