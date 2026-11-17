ALTER TABLE "tasks" DROP CONSTRAINT "tasks_location_human";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "location" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "location" DROP NOT NULL;--> statement-breakpoint
-- Texto vazio era "sem local": agora e nulo, e so o local que alguem informou fica gravado.
UPDATE "tasks" SET "location" = NULL WHERE btrim("location") = '';--> statement-breakpoint
-- O mesmo no template das series: sem local, a chave sai.
UPDATE "recurrences" SET "template" = "template" - 'location'
WHERE "template" ? 'location'
  AND (jsonb_typeof("template"->'location') <> 'string' OR btrim("template"->>'location') = '');--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_location_filled" CHECK ("tasks"."location" IS NULL OR btrim("tasks"."location") <> '');--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_location_human" CHECK ("tasks"."location" IS NULL OR "tasks"."actor" = 'human');
