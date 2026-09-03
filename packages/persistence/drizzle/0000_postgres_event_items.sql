CREATE TYPE "public"."catalog_scope" AS ENUM('global', 'user');--> statement-breakpoint
CREATE TYPE "public"."event_priority" AS ENUM('urgent', 'normal', 'flexible');--> statement-breakpoint
CREATE TABLE "event_interruptions" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"event_id" char(26) NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	CONSTRAINT "event_interruptions_event_position_unique" UNIQUE("event_id","position"),
	CONSTRAINT "event_interruptions_position_nonneg" CHECK ("event_interruptions"."position" >= 0),
	CONSTRAINT "interruption_finished_after_started" CHECK ("event_interruptions"."finished_at" >= "event_interruptions"."started_at")
);
--> statement-breakpoint
CREATE TABLE "event_items" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"event_id" char(26) NOT NULL,
	"position" smallint NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "event_items_event_position_unique" UNIQUE("event_id","position"),
	CONSTRAINT "event_item_position_nonneg" CHECK ("event_items"."position" >= 0),
	CONSTRAINT "event_item_schema_version_min" CHECK ("event_items"."schema_version" >= 1),
	CONSTRAINT "event_item_data_is_object" CHECK (jsonb_typeof("event_items"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "event_tags" (
	"event_id" char(26) NOT NULL,
	"tag_id" char(26) NOT NULL,
	CONSTRAINT "event_tags_event_id_tag_id_pk" PRIMARY KEY("event_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"missed" boolean DEFAULT false NOT NULL,
	"priority" "event_priority" DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_on" date GENERATED ALWAYS AS (((started_at AT TIME ZONE 'America/Sao_Paulo')::date)) STORED NOT NULL,
	CONSTRAINT "events_revision_min" CHECK ("events"."revision" >= 1),
	CONSTRAINT "events_finished_after_started" CHECK ("events"."finished_at" IS NULL OR "events"."finished_at" >= "events"."started_at")
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
CREATE TABLE "food" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"scope" "catalog_scope" NOT NULL,
	"owner_user_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"reference_portion" text NOT NULL,
	"reference_weight_grams" numeric(10, 2) NOT NULL,
	"calories_kcal" numeric(10, 2) NOT NULL,
	"carbohydrates_grams" numeric(10, 2) NOT NULL,
	"proteins_grams" numeric(10, 2) NOT NULL,
	"total_fat_grams" numeric(10, 2) NOT NULL,
	"fiber_grams" numeric(10, 2) NOT NULL,
	"micronutrients" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_scope_owner" CHECK (("food"."scope" = 'global' AND "food"."owner_user_id" IS NULL) OR ("food"."scope" = 'user' AND "food"."owner_user_id" IS NOT NULL)),
	CONSTRAINT "food_micronutrients_is_object" CHECK (jsonb_typeof("food"."micronutrients") = 'object'),
	CONSTRAINT "food_revision_min" CHECK ("food"."revision" >= 1),
	CONSTRAINT "food_nutrition_nonnegative" CHECK ("food"."reference_weight_grams" >= 0 AND "food"."calories_kcal" >= 0 AND "food"."carbohydrates_grams" >= 0 AND "food"."proteins_grams" >= 0 AND "food"."total_fat_grams" >= 0 AND "food"."fiber_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meal" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"scope" "catalog_scope" NOT NULL,
	"owner_user_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"food_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_calories_kcal" numeric(10, 2) DEFAULT 0 NOT NULL,
	"total_protein_grams" numeric(10, 2) DEFAULT 0 NOT NULL,
	"total_carbohydrate_grams" numeric(10, 2) DEFAULT 0 NOT NULL,
	"total_fat_grams" numeric(10, 2) DEFAULT 0 NOT NULL,
	"total_fiber_grams" numeric(10, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_scope_owner" CHECK (("meal"."scope" = 'global' AND "meal"."owner_user_id" IS NULL) OR ("meal"."scope" = 'user' AND "meal"."owner_user_id" IS NOT NULL)),
	CONSTRAINT "meal_food_items_is_array" CHECK (jsonb_typeof("meal"."food_items") = 'array'),
	CONSTRAINT "meal_revision_min" CHECK ("meal"."revision" >= 1),
	CONSTRAINT "meal_totals_nonnegative" CHECK ("meal"."total_calories_kcal" >= 0 AND "meal"."total_protein_grams" >= 0 AND "meal"."total_carbohydrate_grams" >= 0 AND "meal"."total_fat_grams" >= 0 AND "meal"."total_fiber_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_category_known" CHECK ("workout"."category" IN ('cardio', 'strength', 'free'))
);
--> statement-breakpoint
ALTER TABLE "event_interruptions" ADD CONSTRAINT "event_interruptions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_items" ADD CONSTRAINT "event_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_interruptions_event_idx" ON "event_interruptions" USING btree ("event_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "event_items_one_primary_idx" ON "event_items" USING btree ("event_id") WHERE "event_items"."is_primary";--> statement-breakpoint
CREATE INDEX "event_items_type_event_idx" ON "event_items" USING btree ("type","event_id");--> statement-breakpoint
CREATE INDEX "event_tags_tag_idx" ON "event_tags" USING btree ("tag_id","event_id");--> statement-breakpoint
CREATE INDEX "events_timeline_cursor_idx" ON "events" USING btree ("user_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_user_finished_idx" ON "events" USING btree ("user_id","finished_at") WHERE "events"."finished_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "events_user_day_idx" ON "events" USING btree ("user_id","started_on");--> statement-breakpoint
CREATE INDEX "tags_user_name_prefix_idx" ON "tags" USING btree ("user_id","name" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "food_global_name_idx" ON "food" USING btree ("name") WHERE "food"."scope" = 'global';--> statement-breakpoint
CREATE INDEX "food_owner_name_idx" ON "food" USING btree ("owner_user_id","name") WHERE "food"."scope" = 'user';--> statement-breakpoint
CREATE INDEX "meal_global_name_idx" ON "meal" USING btree ("name") WHERE "meal"."scope" = 'global';--> statement-breakpoint
CREATE INDEX "meal_owner_name_idx" ON "meal" USING btree ("owner_user_id","name") WHERE "meal"."scope" = 'user';--> statement-breakpoint
INSERT INTO "workout" ("code", "name", "category") VALUES
  ('treadmill', 'Esteira', 'cardio'),
  ('running', 'Corrida', 'cardio'),
  ('weightlifting', 'Musculação', 'strength'),
  ('free', 'Livre', 'free')
ON CONFLICT ("code") DO NOTHING;
