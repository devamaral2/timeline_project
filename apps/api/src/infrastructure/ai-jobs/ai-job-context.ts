import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";

export type AiJobKind = "agent-turn" | "transcript-event" | "meal-note";
export interface EnqueueAiJobInput {
  kind: AiJobKind;
  userId: string;
  actorId: string;
  payload: unknown;
  dedupeKey?: string;
}
export interface AiJobTransaction {
  execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface CurrentAiJob {
  id: string;
  token: string;
  createdAt?: Date;
  result?: unknown;
  prepared?: boolean;
  failureCode?: string;
}
export const aiJobContext = new AsyncLocalStorage<CurrentAiJob>();

export function getCurrentAiJob(): CurrentAiJob | undefined {
  return aiJobContext.getStore();
}

export function setAiJobFailure(code: string): void {
  const context = aiJobContext.getStore();
  if (!context) throw new Error("No current AI job");
  if (!["conflict", "conversation_gone", "invalid_input", "limit_reached", "unavailable", "forbidden"].includes(code)) {
    throw new Error("Unknown safe AI job failure code");
  }
  context.failureCode = code;
  context.prepared = true;
}

export function setAiJobResult(result: unknown): void {
  const context = aiJobContext.getStore();
  if (!context) throw new Error("No current AI job");
  context.result = result;
  context.prepared = true;
}

/** Must be the final operation inside the transaction containing domain writes.
 * A thrown fencing error rolls back those writes. Outside a job this is a no-op.
 */
export async function completeCurrentAiJob(tx: AiJobTransaction): Promise<void> {
  const context = aiJobContext.getStore();
  if (!context) return;
  if (!context.prepared) throw new Error("AI job result must be prepared before commit");
  const result = await tx.execute(sql`
    UPDATE ai_jobs SET status=${context.failureCode ? "failed" : "succeeded"}, error=${context.failureCode ?? null},
      result=${JSON.stringify(context.result ?? null)}::jsonb,
      lease_until=NULL, updated_at=now()
    WHERE id=${context.id} AND status='running' AND lease_token=${context.token}
      AND lease_until > clock_timestamp() RETURNING id`);
  if (result.rows.length !== 1) throw new Error("AI job lease lost or cancelled");
}

/** Receipt is the persisted job ID; dedupe is scoped to user + kind. */
export async function enqueueAiJobInTransaction(tx: AiJobTransaction, input: EnqueueAiJobInput): Promise<string> {
  if (!input.userId || !input.actorId) throw new Error("AI jobs require authenticated ownership");
  const result = await tx.execute(sql`
    INSERT INTO ai_jobs (id,kind,user_id,actor_id,payload,dedupe_key)
    VALUES (${ulid()},${input.kind},${input.userId},${input.actorId},
      ${JSON.stringify(input.payload)}::jsonb,${input.dedupeKey ?? null})
    ON CONFLICT (user_id,kind,dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key
    RETURNING id,status`);
  const row = result.rows[0];
  const id = String(row.id);
  if (row.status === "queued") await tx.execute(sql`
    INSERT INTO ai_job_outbox (job_id) VALUES (${id}) ON CONFLICT DO NOTHING`);
  return id;
}

export function enqueueMealNote(tx: AiJobTransaction, noteId: string, userId: string, payload: unknown): Promise<string> {
  return enqueueAiJobInTransaction(tx, {
    kind: "meal-note", userId, actorId: userId, payload, dedupeKey: noteId,
  });
}
