CREATE TYPE "public"."agent_chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "agent_chat_messages" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"conversation_id" char(26) NOT NULL,
	"seq" integer NOT NULL,
	"role" "agent_chat_role" NOT NULL,
	"content" text NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_chat_messages_seq_unique" UNIQUE("conversation_id","seq"),
	CONSTRAINT "agent_chat_messages_seq_min" CHECK ("agent_chat_messages"."seq" >= 1),
	CONSTRAINT "agent_chat_messages_content_not_blank" CHECK (btrim("agent_chat_messages"."content") <> ''),
	CONSTRAINT "agent_chat_messages_entities_array" CHECK (jsonb_typeof("agent_chat_messages"."entities") = 'array')
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "agent_conversations_revision_min" CHECK ("agent_conversations"."revision" >= 1),
	CONSTRAINT "agent_conversations_title_not_blank" CHECK ("agent_conversations"."title" IS NULL OR btrim("agent_conversations"."title") <> '')
);
--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_conversations_user_recent_idx" ON "agent_conversations" USING btree ("user_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "agent_conversations"."deleted_at" IS NULL;