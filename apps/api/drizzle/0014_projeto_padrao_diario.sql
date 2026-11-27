-- O projeto padrao passa de `personal` para `diario` (ADR 0022).
ALTER TABLE "projects" DROP CONSTRAINT "projects_personal_name";--> statement-breakpoint
-- O nome e unico por usuario: um `diario` que a pessoa criou da lugar ao padrao e segue com as tarefas dele.
UPDATE "projects" SET "name" = 'diario (antigo)', "updated_at" = now()
WHERE NOT "personal" AND lower("name") = 'diario';--> statement-breakpoint
UPDATE "projects" SET "name" = 'diario', "updated_at" = now() WHERE "personal";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_personal_name" CHECK (NOT "projects"."personal" OR "projects"."name" = 'diario');
