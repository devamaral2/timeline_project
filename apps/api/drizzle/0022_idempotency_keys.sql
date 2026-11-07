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
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");