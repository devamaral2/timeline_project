ALTER TABLE "notes" ADD COLUMN "name" text DEFAULT 'Nota' NOT NULL;--> statement-breakpoint
UPDATE "notes" n SET "name" = COALESCE((
  SELECT LEFT(BTRIM(line), 100)
  FROM regexp_split_to_table(n."content", E'\n') AS line
  WHERE BTRIM(line) <> ''
  LIMIT 1
), 'Nota');--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_name_not_blank" CHECK (btrim("notes"."name") <> '');
