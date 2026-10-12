-- Notes deixam de pertencer a um evento/tarefa e ganham type + data. Ainda nao ha
-- uso real, entao o conteudo antigo (texto em `content`) e descartado: a coluna
-- `type` e NOT NULL e nao ha como inferi-la.
TRUNCATE TABLE "notes" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('routine', 'meal', 'sleep', 'training');--> statement-breakpoint
CREATE TABLE "event_notes" (
	"event_id" char(26) NOT NULL,
	"note_id" char(26) NOT NULL,
	"position" smallint NOT NULL,
	"from_recurrence" boolean DEFAULT false NOT NULL,
	CONSTRAINT "event_notes_event_id_note_id_pk" PRIMARY KEY("event_id","note_id"),
	CONSTRAINT "event_notes_event_position_unique" UNIQUE("event_id","position") DEFERRABLE INITIALLY IMMEDIATE,
	CONSTRAINT "event_notes_position_nonneg" CHECK ("event_notes"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recurrence_notes" (
	"recurrence_id" char(26) NOT NULL,
	"note_id" char(26) NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "recurrence_notes_recurrence_id_note_id_pk" PRIMARY KEY("recurrence_id","note_id"),
	CONSTRAINT "recurrence_notes_recurrence_position_unique" UNIQUE("recurrence_id","position") DEFERRABLE INITIALLY IMMEDIATE,
	CONSTRAINT "recurrence_notes_position_nonneg" CHECK ("recurrence_notes"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "task_notes" (
	"task_id" char(26) NOT NULL,
	"note_id" char(26) NOT NULL,
	"position" smallint NOT NULL,
	"from_recurrence" boolean DEFAULT false NOT NULL,
	CONSTRAINT "task_notes_task_id_note_id_pk" PRIMARY KEY("task_id","note_id"),
	CONSTRAINT "task_notes_task_position_unique" UNIQUE("task_id","position") DEFERRABLE INITIALLY IMMEDIATE,
	CONSTRAINT "task_notes_position_nonneg" CHECK ("task_notes"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "event_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "event_items" CASCADE;--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_content_not_blank";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_task_id_tasks_id_fk";
--> statement-breakpoint
DROP INDEX "notes_user_idx";--> statement-breakpoint
DROP INDEX "notes_event_idx";--> statement-breakpoint
DROP INDEX "notes_task_idx";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "kind" "event_kind" DEFAULT 'routine' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "schema_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_notes" ADD CONSTRAINT "recurrence_notes_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_notes" ADD CONSTRAINT "recurrence_notes_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_notes_note_idx" ON "event_notes" USING btree ("note_id","event_id");--> statement-breakpoint
CREATE INDEX "recurrence_notes_note_idx" ON "recurrence_notes" USING btree ("note_id","recurrence_id");--> statement-breakpoint
CREATE INDEX "task_notes_note_idx" ON "task_notes" USING btree ("note_id","task_id");--> statement-breakpoint
CREATE INDEX "notes_user_type_idx" ON "notes" USING btree ("user_id","type") WHERE "notes"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "task_id";--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_type_not_blank" CHECK (btrim("notes"."type") <> '');--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_schema_version_min" CHECK ("notes"."schema_version" >= 1);--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_data_is_object" CHECK (jsonb_typeof("notes"."data") = 'object');