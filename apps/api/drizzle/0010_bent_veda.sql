CREATE TABLE "agent_chat_tickets" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"actor" jsonb NOT NULL,
	"target_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_chat_tickets_expires_idx" ON "agent_chat_tickets" USING btree ("expires_at");