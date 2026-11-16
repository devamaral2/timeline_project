import type { PostgresDatabase } from "../database/postgres-database";
import { enqueueJobInTransaction, type EnqueueJobInput } from "../../jobs/job-context";

export interface Job {
  id: string;
  kind: string;
  userId: string;
  actorId: string;
  taskId: string | null;
  payload: unknown;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: unknown;
  error: string | null;
  attempts: number;
  leaseToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** As colunas de `jobs` na forma de `Job`; `table` qualifica quando a consulta junta outra relacao. */
function projectionOf(table = "jobs"): string {
  return `${table}.id, ${table}.kind, ${table}.user_id AS "userId", ${table}.actor_id AS "actorId",
    ${table}.task_id AS "taskId", ${table}.payload, ${table}.status, ${table}.progress, ${table}.error,
    ${table}.attempts, ${table}.lease_token AS "leaseToken", ${table}.created_at AS "createdAt",
    ${table}.updated_at AS "updatedAt"`;
}
const projection = projectionOf();

/** Jobs terminados ficam este tempo para conferencia e depois saem. */
const FINISHED_RETENTION = "7 days";

/**
 * A fila unica, no Postgres. O worker consulta a tabela e pega os jobs com
 * `FOR UPDATE SKIP LOCKED`: dois workers nunca pegam o mesmo. O job e
 * descartavel; a fonte de verdade e a tarefa.
 */
export class PostgresJobStore {
  constructor(readonly database: PostgresDatabase, readonly leaseMs: number, readonly maxAttempts: number) {}

  enqueue(input: EnqueueJobInput): Promise<string> {
    return this.database.db.transaction((tx) => enqueueJobInTransaction(tx, input));
  }

  async get(id: string): Promise<Job | undefined> {
    return (await this.database.pool.query<Job>(`SELECT ${projection} FROM jobs WHERE id = $1`, [id])).rows[0];
  }

  /** O job vivo de uma tarefa, se houver: e dele que sai o progresso passageiro. */
  async activeOfTask(taskId: string): Promise<Job | undefined> {
    return (await this.database.pool.query<Job>(
      `SELECT ${projection} FROM jobs WHERE task_id = $1 AND status IN ('queued', 'running')
       ORDER BY created_at DESC, id DESC LIMIT 1`, [taskId])).rows[0];
  }

  /** Cancela os jobs vivos das tarefas; devolve os ids, para o worker abortar os que estao rodando. */
  async cancelOfTasks(taskIds: readonly string[], userId: string): Promise<string[]> {
    if (taskIds.length === 0) return [];
    const result = await this.database.pool.query<{ id: string }>(
      `UPDATE jobs SET status = 'cancelled', lease_until = NULL, progress = NULL, updated_at = now()
       WHERE task_id = ANY($1::char(26)[]) AND user_id = $2 AND status IN ('queued', 'running') RETURNING id`,
      [taskIds, userId]);
    return result.rows.map((row) => row.id);
  }

  /**
   * Pega ate `limit` jobs prontos dos tipos que este worker sabe executar. Um
   * job com `concurrency_key` so sai quando nenhum outro da mesma chave esta
   * rodando ou esperando ha mais tempo.
   */
  async claim(kinds: readonly string[], limit: number): Promise<Job[]> {
    if (kinds.length === 0 || limit <= 0) return [];
    const result = await this.database.pool.query<Job>(
      `WITH picked AS (
         SELECT j.id FROM jobs j
         WHERE j.status = 'queued' AND j.available_at <= now() AND j.kind = ANY($1::text[])
           AND (j.concurrency_key IS NULL OR NOT EXISTS (
             SELECT 1 FROM jobs other
             WHERE other.concurrency_key = j.concurrency_key AND other.id <> j.id
               AND (other.status = 'running'
                 OR (other.status = 'queued' AND (other.created_at, other.id) < (j.created_at, j.id)))))
         ORDER BY j.available_at, j.id
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE jobs SET status = 'running', attempts = attempts + 1, lease_token = gen_random_uuid()::text,
         lease_until = clock_timestamp() + $3 * interval '1 millisecond', updated_at = now()
       FROM picked WHERE jobs.id = picked.id
       RETURNING ${projection}`,
      [kinds, limit, this.leaseMs]);
    return result.rows;
  }

  async heartbeat(id: string, token: string): Promise<boolean> {
    return (await this.database.pool.query(
      `UPDATE jobs SET lease_until = clock_timestamp() + $3 * interval '1 millisecond'
       WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_until > clock_timestamp() RETURNING id`,
      [id, token, this.leaseMs])).rowCount === 1;
  }

  async progress(id: string, token: string, value: unknown): Promise<void> {
    const result = await this.database.pool.query(
      `UPDATE jobs SET progress = $3::jsonb, updated_at = now()
       WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_until > clock_timestamp() RETURNING id`,
      [id, token, JSON.stringify(value)]);
    if (!result.rowCount) throw new Error("Job lease lost or cancelled");
  }

  /** Encerra com sucesso um job cujo handler nao fechou dentro de uma transacao de dominio. */
  async succeed(id: string, token: string): Promise<boolean> {
    return (await this.database.pool.query(
      `UPDATE jobs SET status = 'succeeded', error = NULL, progress = NULL, lease_until = NULL, updated_at = now()
       WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_until > clock_timestamp() RETURNING id`,
      [id, token])).rowCount === 1;
  }

  /** Falha: volta para a fila, com espera crescente, enquanto houver tentativa; senao, termina como falha. */
  async fail(job: Job, error: string, retryable: boolean): Promise<void> {
    const retry = retryable && job.attempts < this.maxAttempts;
    await this.database.pool.query(
      `UPDATE jobs SET status = $3, error = $4, lease_until = NULL, progress = NULL,
         available_at = now() + $5 * interval '1 millisecond', updated_at = now()
       WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_until > clock_timestamp()`,
      [job.id, job.leaseToken, retry ? "queued" : "failed", error, retryDelay(job.attempts)]);
  }

  /** Devolve a fila os jobs cujo worker sumiu e tira os terminados que ja passaram do prazo. */
  async recover(): Promise<void> {
    await this.database.pool.query(
      `UPDATE jobs SET status = 'queued', error = 'Worker lease expired', lease_until = NULL,
         available_at = now() + interval '2 seconds', updated_at = now()
       WHERE status = 'running' AND lease_until <= clock_timestamp()`);
    await this.database.pool.query(
      `DELETE FROM jobs WHERE status IN ('succeeded', 'failed', 'cancelled')
         AND updated_at < now() - $1::interval`, [FINISHED_RETENTION]);
  }
}

export function retryDelay(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
}
