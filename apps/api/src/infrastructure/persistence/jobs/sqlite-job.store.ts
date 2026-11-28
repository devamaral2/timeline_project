import { enqueueJobInTransaction, type EnqueueJobInput } from "../../jobs/job-context";
import { jobs } from "../database/tables";
import { rowDecoder } from "../sqlite/columns";
import type { SqliteDatabase } from "../sqlite/database";
import { NOW, sql } from "../sqlite/sql";

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

/** As colunas de `jobs` na forma de `Job`. */
const JOB_KEYS = [
  "id", "kind", "userId", "actorId", "taskId", "payload", "status", "progress", "error", "attempts", "leaseToken",
  "createdAt", "updatedAt",
] as const;
const projection = jobs.select(undefined, JOB_KEYS);
const decoder = rowDecoder({
  id: jobs.columns.id,
  kind: jobs.columns.kind,
  userId: jobs.columns.userId,
  actorId: jobs.columns.actorId,
  taskId: jobs.columns.taskId,
  payload: jobs.columns.payload,
  status: jobs.columns.status,
  progress: jobs.columns.progress,
  error: jobs.columns.error,
  attempts: jobs.columns.attempts,
  leaseToken: jobs.columns.leaseToken,
  createdAt: jobs.columns.createdAt,
  updatedAt: jobs.columns.updatedAt,
});

const DAY_MS = 24 * 60 * 60 * 1000;
/** Jobs terminados ficam este tempo para conferencia e depois saem. */
const FINISHED_RETENTION_MS = 7 * DAY_MS;

/**
 * A fila unica, no SQLite. O worker consulta a tabela e pega os jobs numa escrita so: o escritor unico com
 * `BEGIN IMMEDIATE` serializa dois `claim`, entao dois workers nunca pegam o mesmo. O job e descartavel; a fonte de
 * verdade e a tarefa.
 */
export class SqliteJobStore {
  constructor(readonly database: SqliteDatabase, readonly leaseMs: number, readonly maxAttempts: number) {}

  enqueue(input: EnqueueJobInput): Promise<string> {
    return this.database.transaction((tx) => enqueueJobInTransaction(tx, input));
  }

  async get(id: string): Promise<Job | undefined> {
    return this.database.get(sql`SELECT ${projection} FROM jobs WHERE id = ${id}`, decoder);
  }

  /** O job vivo de uma tarefa, se houver: e dele que sai o progresso passageiro. */
  async activeOfTask(taskId: string): Promise<Job | undefined> {
    return this.database.get(
      sql`SELECT ${projection} FROM jobs WHERE task_id = ${taskId} AND status IN ('queued', 'running')
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      decoder,
    );
  }

  /** Cancela os jobs vivos das tarefas; devolve os ids, para o worker abortar os que estao rodando. */
  async cancelOfTasks(taskIds: readonly string[], userId: string): Promise<string[]> {
    if (taskIds.length === 0) return [];
    const result = await this.database.execute<{ id: string }>(sql`
      UPDATE jobs SET status = 'cancelled', lease_until = NULL, progress = NULL, updated_at = ${NOW}
      WHERE task_id IN ${sql.in(taskIds)} AND user_id = ${userId} AND status IN ('queued', 'running') RETURNING id`);
    return result.rows.map((row) => row.id);
  }

  /**
   * Pega ate `limit` jobs prontos dos tipos que este worker sabe executar. Um
   * job com `concurrency_key` so sai quando nenhum outro da mesma chave esta
   * rodando ou esperando ha mais tempo. Escolha e marca do lease sao uma escrita so; o token e sorteado por linha
   * no proprio SQL (um parametro valeria para todos os jobs pegos de uma vez).
   */
  async claim(kinds: readonly string[], limit: number): Promise<Job[]> {
    if (kinds.length === 0 || limit <= 0) return [];
    const result = await this.database.execute(
      sql`
      UPDATE jobs SET status = 'running', attempts = attempts + 1, lease_token = lower(hex(randomblob(16))),
        lease_until = ${new Date(Date.now() + this.leaseMs)}, updated_at = ${NOW}
      WHERE id IN (
        SELECT j.id FROM jobs j
        WHERE j.status = 'queued' AND j.available_at <= ${new Date()} AND j.kind IN ${sql.in(kinds)}
          AND (j.concurrency_key IS NULL OR NOT EXISTS (
            SELECT 1 FROM jobs other
            WHERE other.concurrency_key = j.concurrency_key AND other.id <> j.id
              AND (other.status = 'running'
                OR (other.status = 'queued' AND (other.created_at, other.id) < (j.created_at, j.id)))))
        ORDER BY j.available_at, j.id
        LIMIT ${limit}
      )
      RETURNING ${projection}`,
      decoder,
    );
    return result.rows;
  }

  async heartbeat(id: string, token: string): Promise<boolean> {
    const now = new Date();
    return (await this.database.execute(sql`
      UPDATE jobs SET lease_until = ${new Date(now.getTime() + this.leaseMs)}
      WHERE id = ${id} AND lease_token = ${token} AND status = 'running' AND lease_until > ${now} RETURNING id`))
      .rowCount === 1;
  }

  async progress(id: string, token: string, value: unknown): Promise<void> {
    const result = await this.database.execute(sql`
      UPDATE jobs SET progress = ${sql.json(value)}, updated_at = ${NOW}
      WHERE id = ${id} AND lease_token = ${token} AND status = 'running' AND lease_until > ${new Date()} RETURNING id`);
    if (!result.rowCount) throw new Error("Job lease lost or cancelled");
  }

  /** Encerra com sucesso um job cujo handler nao fechou dentro de uma transacao de dominio. */
  async succeed(id: string, token: string): Promise<boolean> {
    return (await this.database.execute(sql`
      UPDATE jobs SET status = 'succeeded', error = NULL, progress = NULL, lease_until = NULL, updated_at = ${NOW}
      WHERE id = ${id} AND lease_token = ${token} AND status = 'running' AND lease_until > ${new Date()} RETURNING id`))
      .rowCount === 1;
  }

  /** Falha: volta para a fila, com espera crescente, enquanto houver tentativa; senao, termina como falha. */
  async fail(job: Job, error: string, retryable: boolean): Promise<void> {
    const retry = retryable && job.attempts < this.maxAttempts;
    await this.database.execute(sql`
      UPDATE jobs SET status = ${retry ? "queued" : "failed"}, error = ${error}, lease_until = NULL, progress = NULL,
        available_at = ${new Date(Date.now() + retryDelay(job.attempts))}, updated_at = ${NOW}
      WHERE id = ${job.id} AND lease_token = ${job.leaseToken} AND status = 'running' AND lease_until > ${new Date()}`);
  }

  /** Devolve a fila os jobs cujo worker sumiu e tira os terminados que ja passaram do prazo. */
  async recover(): Promise<void> {
    const now = Date.now();
    await this.database.execute(sql`
      UPDATE jobs SET status = 'queued', error = 'Worker lease expired', lease_until = NULL,
        available_at = ${new Date(now + 2000)}, updated_at = ${NOW}
      WHERE status = 'running' AND lease_until <= ${new Date(now)}`);
    await this.database.execute(sql`
      DELETE FROM jobs WHERE status IN ('succeeded', 'failed', 'cancelled')
        AND updated_at < ${new Date(now - FINISHED_RETENTION_MS)}`);
  }
}

export function retryDelay(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
}
