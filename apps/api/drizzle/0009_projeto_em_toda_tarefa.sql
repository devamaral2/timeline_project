CREATE TABLE "projects" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_shape" CHECK ("projects"."name" = btrim("projects"."name") AND char_length("projects"."name") BETWEEN 1 AND 60),
	CONSTRAINT "projects_personal_name" CHECK (NOT "projects"."personal" OR "projects"."name" = 'personal')
);--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_name_unique" ON "projects" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_personal_unique" ON "projects" USING btree ("user_id") WHERE "projects"."personal";--> statement-breakpoint
-- O `personal` de cada usuario que ja tem tarefa ou serie. Os demais ganham o seu na primeira necessidade.
-- O id tem 26 caracteres hexadecimais maiusculos, que o alfabeto do ULID aceita.
INSERT INTO "projects" ("id", "user_id", "name", "personal")
SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 26)), owners."user_id", 'personal', true
FROM (SELECT "user_id" FROM "tasks" UNION SELECT "user_id" FROM "recurrences") AS owners;--> statement-breakpoint
-- Primeiro a coluna aberta, depois o preenchimento, e so entao a obrigatoriedade e a chave.
ALTER TABLE "tasks" ADD COLUMN "project_id" char(26);--> statement-breakpoint
ALTER TABLE "recurrences" ADD COLUMN "project_id" char(26);--> statement-breakpoint
UPDATE "tasks" SET "project_id" = "projects"."id" FROM "projects"
WHERE "projects"."user_id" = "tasks"."user_id" AND "projects"."personal";--> statement-breakpoint
UPDATE "recurrences" SET "project_id" = "projects"."id" FROM "projects"
WHERE "projects"."user_id" = "recurrences"."user_id" AND "projects"."personal";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrences" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
