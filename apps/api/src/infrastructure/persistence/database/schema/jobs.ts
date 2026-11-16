import { char, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events } from "./events";
import { JOB_STATUSES, sqlList } from "./sets";

/**
 * A fila unica (ADR 0013). O worker da propria aplicacao busca os jobs na fila
 * com `available_at` vencido, usando `FOR UPDATE SKIP LOCKED`. Repetir e voltar
 * para a fila com `available_at` no futuro; worker morto e lease vencido que
 * volta para a fila. Nao ha tabela de saida nem RabbitMQ.
 *
 * O job e descartavel: a fonte de verdade e o evento. `progress` e um retrato
 * passageiro; o resultado mora no evento e nas entradas dele, por isso nao ha
 * coluna `result`. Todo job de IA aponta para o evento do passo que executa.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: char("id", { length: 26 }).primaryKey(),
    kind: text("kind").notNull(),
    userId: text("user_id").notNull(),
    actorId: text("actor_id").notNull(),
    eventId: char("task_id", { length: 26 }).references(() => events.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key"),
    // Jobs com a mesma chave rodam um por vez, em ordem de criacao.
    concurrencyKey: text("concurrency_key"),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("queued"),
    progress: jsonb("progress"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Nulos nao colidem: job sem `dedupe_key` nunca conflita.
    uniqueIndex("jobs_dedupe_unique").on(table.userId, table.kind, table.dedupeKey),
    // Polling e retry.
    index("jobs_queue_idx")
      .on(table.availableAt)
      .where(sql`${table.status} = 'queued'`),
    // Lease vencido.
    index("jobs_lease_idx")
      .on(table.leaseUntil)
      .where(sql`${table.status} = 'running'`),
    // Cancelar pelo evento.
    index("jobs_task_idx")
      .on(table.eventId)
      .where(sql`${table.eventId} IS NOT NULL`),
    index("jobs_concurrency_idx")
      .on(table.concurrencyKey, table.createdAt, table.id)
      .where(sql`${table.concurrencyKey} IS NOT NULL AND ${table.status} IN ('queued', 'running')`),
    // Limpeza dos terminados.
    index("jobs_finished_idx")
      .on(table.updatedAt)
      .where(sql`${table.status} IN ('succeeded', 'failed', 'cancelled')`),
    check("jobs_status_valid", sql`${table.status} IN (${sqlList(JOB_STATUSES)})`),
  ],
);
