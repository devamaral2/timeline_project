-- Os status de agente deixam de repetir os de pessoa. O check cai, os valores trocam e o check novo volta
-- na mesma transacao: a leitura de uma tarefa valida o status contra o conjunto, e uma linha de agente com
-- `done` deixaria de ser lida.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_status_matches_actor";--> statement-breakpoint
-- Pedidos, passos e as tarefas de conteudo guardado (0009): so as tarefas de agente. As de pessoa ficam como estao.
-- `awaiting_transcription` (0009) entra no conjunto sem mudar de nome.
UPDATE "tasks" SET "status" = 'completed' WHERE "actor" = 'agent' AND "status" = 'done';--> statement-breakpoint
UPDATE "tasks" SET "status" = 'cancelled' WHERE "actor" = 'agent' AND "status" = 'cancel';--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_matches_actor" CHECK (("tasks"."actor" = 'human' AND ("tasks"."status" IS NULL OR "tasks"."status" IN ('todo', 'toDefine', 'doing', 'inHold', 'done', 'cancel', 'missed'))) OR ("tasks"."actor" = 'agent' AND "tasks"."status" IS NOT NULL AND "tasks"."status" IN ('preparing', 'queued', 'starting', 'running', 'waiting', 'awaiting_transcription', 'completed', 'interrupted', 'failed', 'cancelled', 'rolled_back')));
