ALTER TABLE "plan_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_dependencies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "plan_tags" CASCADE;--> statement-breakpoint
DROP TABLE "plans" CASCADE;--> statement-breakpoint
DROP TABLE "plan_dependencies" CASCADE;--> statement-breakpoint
-- IF EXISTS: o DROP TABLE "plans" CASCADE acima ja leva esta FK junto.
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_plan_id_plans_id_fk";
--> statement-breakpoint
DROP INDEX "tasks_plan_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_task_id" char(26);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "plan_id";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_not_self" CHECK ("tasks"."parent_task_id" IS NULL OR "tasks"."parent_task_id" <> "tasks"."id");