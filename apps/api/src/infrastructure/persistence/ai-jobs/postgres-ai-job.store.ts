import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { PostgresDatabase } from "../database/postgres-database";
import { enqueueAiJobInTransaction, type EnqueueAiJobInput } from "../../ai-jobs/ai-job-context";

export interface AiJob {
  id: string;
  kind: EnqueueAiJobInput["kind"];
  userId: string;
  actorId: string;
  payload: unknown;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  leaseToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}
const projection = `id,kind,user_id AS "userId",actor_id AS "actorId",payload,status,
 progress,result,error,attempts,lease_token AS "leaseToken",created_at AS "createdAt",updated_at AS "updatedAt"`;

export class PostgresAiJobStore {
  constructor(readonly database: PostgresDatabase, readonly leaseMs: number, readonly maxAttempts: number) {}
  enqueue(input: EnqueueAiJobInput): Promise<string> {
    return this.database.db.transaction((tx) => enqueueAiJobInTransaction(tx, input));
  }
  async get(id: string, userId: string): Promise<AiJob | undefined> {
    return (await this.database.pool.query<AiJob>(`SELECT ${projection} FROM ai_jobs WHERE id=$1 AND user_id=$2`, [id, userId])).rows[0];
  }
  async list(userId: string): Promise<AiJob[]> {
    return (await this.database.pool.query<AiJob>(`SELECT ${projection} FROM ai_jobs
      WHERE user_id=$1 AND (status IN ('queued','running') OR id IN (
        SELECT id FROM ai_jobs WHERE user_id=$1 AND status NOT IN ('queued','running')
        ORDER BY created_at DESC, id DESC LIMIT 100
      )) ORDER BY (status IN ('queued','running')) DESC, created_at DESC, id DESC`, [userId])).rows;
  }
  async cancel(id: string, userId: string): Promise<void> {
    await this.database.pool.query(`UPDATE ai_jobs SET status='cancelled',lease_until=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('queued','running')`, [id, userId]);
  }
  async claim(id: string): Promise<AiJob | undefined> {
    return this.database.db.transaction(async (tx) => {
      // Serializes concurrent claim decisions for this user's agent turns.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(user_id))
        FROM ai_jobs WHERE id=${id} AND kind='agent-turn'`);
      const result = await tx.execute(sql`UPDATE ai_jobs j SET status='running',
        attempts=attempts+1,lease_token=${randomUUID()},
        lease_until=clock_timestamp()+${this.leaseMs}*interval '1 millisecond',updated_at=now()
        WHERE id=${id} AND status='queued' AND available_at<=now()
        AND (kind<>'agent-turn' OR NOT EXISTS (SELECT 1 FROM ai_jobs other
          WHERE other.user_id=j.user_id AND other.kind='agent-turn'
          AND (other.status='running' OR (other.status='queued'
            AND (other.created_at,other.id)<(j.created_at,j.id)))))
        RETURNING id`);
      if (!result.rows.length) return undefined;
      const row = await tx.execute(sql`SELECT id,kind,user_id AS "userId",actor_id AS "actorId",
        payload,status,progress,result,error,attempts,lease_token AS "leaseToken",
        created_at AS "createdAt",updated_at AS "updatedAt" FROM ai_jobs WHERE id=${id}`);
      return row.rows[0] as unknown as AiJob;
    });
  }
  async heartbeat(id: string, token: string): Promise<boolean> {
    return (await this.database.pool.query(`UPDATE ai_jobs SET lease_until=clock_timestamp()+$3*interval '1 millisecond'
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp() RETURNING id`, [id, token, this.leaseMs])).rowCount === 1;
  }
  async progress(id: string, token: string, value: unknown): Promise<void> {
    const result = await this.database.pool.query(`UPDATE ai_jobs SET progress=$3::jsonb,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp() RETURNING id`, [id, token, JSON.stringify(value)]);
    if (!result.rowCount) throw new Error("AI job lease lost or cancelled");
  }
  async fail(job: AiJob, error: string, retryable: boolean): Promise<void> {
    const retry = retryable && job.attempts < this.maxAttempts;
    await this.database.pool.query(`WITH requeued AS (UPDATE ai_jobs SET status=$3,error=$4,lease_until=NULL,
      available_at=now()+$5*interval '1 millisecond',updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp()
      RETURNING id,status,available_at)
      INSERT INTO ai_job_outbox (job_id,available_at)
      SELECT id,available_at FROM requeued WHERE status='queued'
      ON CONFLICT (job_id) DO UPDATE SET available_at=excluded.available_at`,
      [job.id, job.leaseToken, retry ? "queued" : "failed", error, retryDelay(job.attempts)]);
  }
  async recover(): Promise<void> {
    await this.database.pool.query(`WITH expired AS (UPDATE ai_jobs SET status='queued',
      error='Worker lease expired',lease_until=NULL,available_at=now()+interval '2 seconds',updated_at=now()
      WHERE status='running' AND lease_until<=clock_timestamp() RETURNING id,available_at)
      INSERT INTO ai_job_outbox (job_id,available_at)
      SELECT id,available_at FROM expired
      ON CONFLICT (job_id) DO UPDATE SET available_at=excluded.available_at`);
    await this.database.pool.query(`DELETE FROM ai_job_outbox o USING ai_jobs j WHERE o.job_id=j.id AND j.status NOT IN ('queued','running')`);
    await this.database.pool.query(`INSERT INTO ai_job_outbox (job_id,available_at)
      SELECT id,available_at FROM ai_jobs WHERE status='queued' ON CONFLICT DO NOTHING`);
  }
  async publications(): Promise<{ id: string; kind: string }[]> {
    return (await this.database.pool.query<{ id: string; kind: string }>(`SELECT j.id,j.kind FROM ai_job_outbox o JOIN ai_jobs j ON j.id=o.job_id
      WHERE j.status='queued' AND j.available_at<=now() AND o.available_at<=now() ORDER BY o.available_at LIMIT 50`)).rows;
  }
  async published(id: string): Promise<void> {
    // Re-publication repairs an ack lost before claiming, unavailable handlers and
    // busy per-user serialization. Duplicate deliveries are fenced at claim.
    await this.database.pool.query(`UPDATE ai_job_outbox SET available_at=now()+interval '30 seconds'
      WHERE job_id=$1 AND available_at<=now()`, [id]);
  }
  /** A busy consumer acknowledges delivery, then schedules a short, durable retry. */
  async defer(id: string): Promise<void> {
    await this.database.pool.query(`INSERT INTO ai_job_outbox (job_id,available_at)
      SELECT id,GREATEST(available_at,now()+interval '1 second') FROM ai_jobs WHERE id=$1 AND status='queued'
      ON CONFLICT (job_id) DO UPDATE SET available_at=excluded.available_at`, [id]);
  }
}

export function retryDelay(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
}
