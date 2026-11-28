import { AsyncLocalStorage } from "node:async_hooks";
import { monotonicFactory } from "ulid";
import type { Tx } from "../persistence/sqlite/database";
import { NOW, sql } from "../persistence/sqlite/sql";

/** O que a fila precisa de uma transacao: executar SQL nela. */
export type JobTransaction = Pick<Tx, "execute">;

export interface EnqueueJobInput {
  kind: string;
  userId: string;
  actorId: string;
  /** O pedido ou o passo que o job executa. Todo job de IA tem um. */
  taskId?: string;
  payload: unknown;
  /** Um job por usuario, tipo e chave: enfileirar de novo devolve o que ja existe. */
  dedupeKey?: string;
  /** Jobs com a mesma chave rodam um por vez, em ordem de criacao. */
  concurrencyKey?: string;
}

export interface CurrentJob {
  id: string;
  token: string;
  createdAt?: Date;
  /** Tentativa em curso (1 = primeira). */
  attempts?: number;
  /** O job ja foi encerrado dentro de uma transacao de dominio. */
  completed?: boolean;
}

/** Monotonico: os jobs criados no mesmo milissegundo (o `created_at` tem essa precisao) ordenam por id na ordem de criacao. */
const newJobId = monotonicFactory();

export const jobContext = new AsyncLocalStorage<CurrentJob>();

export function getCurrentJob(): CurrentJob | undefined {
  return jobContext.getStore();
}

/**
 * Encerra o job em curso na transacao que grava o dominio: ou as duas coisas
 * acontecem, ou nenhuma. Tem de ser a ultima operacao da transacao; se o lease
 * foi perdido ou o job foi cancelado, o erro desfaz as escritas. Fora de um job
 * nao faz nada. O job nao guarda resultado: ele mora na tarefa e nas entradas.
 */
export async function completeCurrentJob(tx: JobTransaction): Promise<void> {
  const context = jobContext.getStore();
  if (!context) return;
  const result = await tx.execute(sql`
    UPDATE jobs SET status = 'succeeded', error = NULL, progress = NULL, lease_until = NULL, updated_at = ${NOW}
    WHERE id = ${context.id} AND status = 'running' AND lease_token = ${context.token}
      AND lease_until > ${new Date()}
    RETURNING id`);
  if (result.rows.length !== 1) throw new Error("Job lease lost or cancelled");
  context.completed = true;
}

/** O recibo e o id do job gravado; a deduplicacao vale por usuario e tipo. */
export async function enqueueJobInTransaction(tx: JobTransaction, input: EnqueueJobInput): Promise<string> {
  if (!input.userId || !input.actorId) throw new Error("Jobs require authenticated ownership");
  const result = await tx.execute(sql`
    INSERT INTO jobs (id, kind, user_id, actor_id, task_id, payload, dedupe_key, concurrency_key)
    VALUES (${newJobId()}, ${input.kind}, ${input.userId}, ${input.actorId}, ${input.taskId ?? null},
      ${sql.json(input.payload)}, ${input.dedupeKey ?? null}, ${input.concurrencyKey ?? null})
    ON CONFLICT (user_id, kind, dedupe_key) DO UPDATE SET dedupe_key = excluded.dedupe_key
    RETURNING id`);
  return String(result.rows[0]?.id);
}
