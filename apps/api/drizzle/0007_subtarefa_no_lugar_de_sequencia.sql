ALTER TABLE "task_task_relation" DROP CONSTRAINT "task_task_relation_valid";--> statement-breakpoint
-- Uma tarefa tem no maximo uma principal: das tarefas de que ela se seguia, fica a ligacao mais antiga.
DELETE FROM "task_task_relation" AS "r"
USING (
  SELECT "from_task_id", "to_task_id",
    row_number() OVER (PARTITION BY "to_task_id" ORDER BY "created_at", "from_task_id") AS "rank"
  FROM "task_task_relation"
  WHERE "relation" = 'precedes'
) AS "ranked"
WHERE "r"."relation" = 'precedes'
  AND "r"."from_task_id" = "ranked"."from_task_id"
  AND "r"."to_task_id" = "ranked"."to_task_id"
  AND "ranked"."rank" > 1;--> statement-breakpoint
-- O antecessor vira a tarefa principal; o sucessor, a subtarefa.
UPDATE "task_task_relation" SET "relation" = 'subtask' WHERE "relation" = 'precedes';--> statement-breakpoint
-- O template da serie troca a lista de antecessores pela principal: a primeira da lista.
UPDATE "recurrences" SET "template" = ("template" - 'previousTaskIds') || CASE
  WHEN jsonb_typeof("template"->'previousTaskIds') = 'array' AND jsonb_array_length("template"->'previousTaskIds') > 0
    THEN jsonb_build_object('parentTaskId', "template"->'previousTaskIds'->0)
  ELSE '{}'::jsonb
END
WHERE "template" ? 'previousTaskIds';--> statement-breakpoint
CREATE UNIQUE INDEX "task_task_subtask_unique" ON "task_task_relation" USING btree ("to_task_id") WHERE "task_task_relation"."relation" = 'subtask';--> statement-breakpoint
ALTER TABLE "task_task_relation" ADD CONSTRAINT "task_task_relation_valid" CHECK ("task_task_relation"."relation" IN ('generates', 'updates', 'deletes', 'step', 'subtask', 'follow_up'));
