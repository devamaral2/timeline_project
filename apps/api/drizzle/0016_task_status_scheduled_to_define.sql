ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
-- Em andamento saiu do produto: o que estava assim volta para A fazer.
UPDATE "tasks" SET "status" = 'todo' WHERE "status" = 'inProgress';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'todo'::text;--> statement-breakpoint
DROP TYPE "public"."work_item_status";--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('todo', 'scheduled', 'toDefine', 'inHold', 'done', 'cancel');--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'todo'::"public"."work_item_status";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE "public"."work_item_status" USING "status"::"public"."work_item_status";