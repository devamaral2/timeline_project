-- A situacao do pedido de agente que terminou (para revisar, revisada, guardada). O que ja terminou antes desta
-- migration nao esta "para revisar": o usuario nunca viu a pergunta, entao fica revisada. Passos, execucoes
-- agendadas e conteudo guardado (save_content*) nao tem situacao, e os pedidos ainda abertos a ganham quando fecharem.
ALTER TABLE "tasks" ADD COLUMN "situation" text;--> statement-breakpoint
UPDATE "tasks" SET "situation" = 'reviewed'
WHERE "actor" = 'agent' AND "kind" NOT IN ('step', 'cron', 'save_content', 'save_content_with_transcription')
  AND "status" IN ('completed', 'interrupted', 'failed', 'cancelled', 'rolled_back');--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_situation_valid" CHECK ("tasks"."situation" IS NULL OR "tasks"."situation" IN ('to_review', 'reviewed', 'bookmarked'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_situation_shape" CHECK ("tasks"."situation" IS NULL OR ("tasks"."actor" = 'agent' AND "tasks"."kind" NOT IN ('step', 'cron', 'save_content', 'save_content_with_transcription') AND "tasks"."status" IN ('completed', 'interrupted', 'failed', 'cancelled', 'rolled_back')));