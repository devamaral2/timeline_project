import type { TranscriptionFailureCode, TranscriptionResult, TranscriptionStage } from "@repo/contracts";
import { sql } from "drizzle-orm";
import {
  placeData,
  type AbandonedTranscription,
  TRANSCRIPTION_FORMAT_JOB,
  TRANSCRIPTION_JOB,
  TRANSCRIPTION_LEASE_MS,
  TRANSCRIPTION_MAX_ATTEMPTS,
  TranscriptionLeaseLostError,
  TranscriptionNotRunningError,
  type FormattingInput,
  type OpenTranscriptionRequest,
  type ReservedTranscription,
  type TranscriptionPlace,
  type TranscriptionRequestData,
  type TranscriptionRequests,
} from "../../../api-core/transcription/transcription-requests";
import type { AgentTaskStatus } from "../../../domain";
import { enqueueJobInTransaction, type JobTransaction } from "../../jobs/job-context";
import { IN_PROGRESS, ON_CLOSE_SITUATION, STOPPED_STATUS } from "../requests/agent-status-sql";
import { appendEntry } from "../requests/request-rows";
import type { Db, Tx } from "../shared/tx";

/**
 * O que o lote de entidades nao grava do pedido de transcricao: o job do servico
 * local (ADR 0013) e o que ele guarda. O pedido, o documento e a relacao com a
 * Leitura diaria (`TaskRelations`) sao gravados na mesma transacao do escritor em lote.
 */
export class PostgresTranscriptionRequests implements TranscriptionRequests {
  constructor(private readonly db: Db) {}

  async findOpen(userId: string, url: string, day: string): Promise<OpenTranscriptionRequest | undefined> {
    const result = await this.db.execute<{ id: string; data: Partial<TranscriptionRequestData> }>(sql`
      SELECT id, data FROM tasks
      WHERE user_id = ${userId} AND kind = 'save_content_with_transcription'
        AND status IN ${IN_PROGRESS} AND deleted_at IS NULL
        AND data->>'url' = ${url} AND data->>'day' = ${day}
      ORDER BY id DESC LIMIT 1`);
    const row = result.rows[0];
    if (!row?.data.readingTaskId || !row.data.artifactId) return undefined;
    return { requestId: row.id, readingTaskId: row.data.readingTaskId, artifactId: row.data.artifactId };
  }

  async enqueue(tx: unknown, input: { requestId: string; userId: string }): Promise<void> {
    await enqueueJobInTransaction(tx as unknown as JobTransaction, {
      kind: TRANSCRIPTION_JOB,
      userId: input.userId,
      actorId: input.userId,
      taskId: input.requestId,
      payload: { requestId: input.requestId },
      dedupeKey: input.requestId,
    });
  }

  async reserve(userId: string): Promise<ReservedTranscription | undefined> {
    // O job cujo servico sumiu volta para a fila (so os desta fila; o resto e do worker interno).
    await this.db.execute(sql`
      UPDATE jobs SET status = 'queued', error = 'Worker lease expired', lease_until = NULL, available_at = now(),
        updated_at = now()
      WHERE kind = ${TRANSCRIPTION_JOB} AND user_id = ${userId} AND status = 'running'
        AND lease_until <= clock_timestamp() AND attempts < ${TRANSCRIPTION_MAX_ATTEMPTS}`);
    const result = await this.db.execute<{ requestId: string; url: string; leaseToken: string; leaseUntil: Date | string }>(sql`
      WITH picked AS (
        SELECT j.id FROM jobs j
        JOIN tasks t ON t.id = j.task_id
        WHERE j.kind = ${TRANSCRIPTION_JOB} AND j.user_id = ${userId} AND j.status = 'queued'
          AND j.available_at <= now() AND t.status = 'awaiting_transcription' AND t.deleted_at IS NULL
        ORDER BY j.available_at, j.id
        LIMIT 1
        FOR UPDATE OF j SKIP LOCKED
      )
      UPDATE jobs SET status = 'running', attempts = attempts + 1, lease_token = gen_random_uuid()::text,
        lease_until = clock_timestamp() + ${TRANSCRIPTION_LEASE_MS} * interval '1 millisecond', updated_at = now()
      FROM picked WHERE jobs.id = picked.id
      RETURNING jobs.task_id AS "requestId", jobs.lease_token AS "leaseToken", jobs.lease_until AS "leaseUntil",
        (SELECT data->>'url' FROM tasks WHERE id = jobs.task_id) AS url`);
    const row = result.rows[0];
    if (!row) return undefined;
    return { requestId: row.requestId, url: row.url, leaseToken: row.leaseToken, leaseExpiresAt: new Date(row.leaseUntil) };
  }

  async abandoned(userId: string): Promise<AbandonedTranscription[]> {
    const result = await this.db.execute<{ requestId: string; leaseToken: string; data: TranscriptionRequestData }>(sql`
      SELECT j.task_id AS "requestId", j.lease_token AS "leaseToken", t.data
      FROM jobs j JOIN tasks t ON t.id = j.task_id
      WHERE j.kind = ${TRANSCRIPTION_JOB} AND j.user_id = ${userId} AND j.status = 'running'
        AND j.lease_until <= clock_timestamp() AND j.attempts >= ${TRANSCRIPTION_MAX_ATTEMPTS}
        AND t.kind = 'save_content_with_transcription' AND t.status = 'awaiting_transcription' AND t.deleted_at IS NULL
      ORDER BY j.id`);
    return result.rows;
  }

  async renew(
    userId: string,
    input: { requestId: string; leaseToken: string; progress: { stage: TranscriptionStage; percent: number } },
  ): Promise<{ leaseExpiresAt: Date } | undefined> {
    const result = await this.db.execute<{ leaseUntil: Date | string }>(sql`
      UPDATE jobs SET lease_until = clock_timestamp() + ${TRANSCRIPTION_LEASE_MS} * interval '1 millisecond',
        progress = ${JSON.stringify(input.progress)}::jsonb, updated_at = now()
      WHERE kind = ${TRANSCRIPTION_JOB} AND user_id = ${userId} AND task_id = ${input.requestId}
        AND lease_token = ${input.leaseToken} AND status = 'running' AND lease_until > clock_timestamp()
      RETURNING lease_until AS "leaseUntil"`);
    const row = result.rows[0];
    return row ? { leaseExpiresAt: new Date(row.leaseUntil) } : undefined;
  }

  async holding(userId: string, requestId: string, leaseToken: string): Promise<TranscriptionRequestData | undefined> {
    // `queued` com o mesmo token: o lease venceu mas ninguem o pegou; a entrega nao se perde.
    const result = await this.db.execute<{ data: TranscriptionRequestData }>(sql`
      SELECT t.data FROM jobs j JOIN tasks t ON t.id = j.task_id
      WHERE j.kind = ${TRANSCRIPTION_JOB} AND j.user_id = ${userId} AND j.task_id = ${requestId}
        AND j.lease_token = ${leaseToken} AND j.status IN ('running', 'queued')
        AND t.kind = 'save_content_with_transcription' AND t.status = 'awaiting_transcription' AND t.deleted_at IS NULL`);
    return result.rows[0]?.data;
  }

  async accept(
    tx: unknown,
    input: { requestId: string; userId: string; leaseToken: string; result: TranscriptionResult },
  ): Promise<void> {
    const transaction = tx as Tx;
    await this.close(transaction, input);
    await this.setStatus(transaction, input.requestId, "running", {});
    await appendEntry(transaction, {
      taskId: input.requestId,
      userId: input.userId,
      kind: "input",
      data: { type: "transcription", ...input.result },
    });
    await enqueueJobInTransaction(transaction as unknown as JobTransaction, {
      kind: TRANSCRIPTION_FORMAT_JOB,
      userId: input.userId,
      actorId: input.userId,
      taskId: input.requestId,
      payload: { requestId: input.requestId },
      dedupeKey: input.requestId,
    });
  }

  async reject(
    tx: unknown,
    input: { requestId: string; userId: string; leaseToken: string; code: TranscriptionFailureCode; at: Date; where: TranscriptionPlace },
  ): Promise<void> {
    const transaction = tx as Tx;
    await this.close(transaction, input);
    await this.setStatus(transaction, input.requestId, "failed", { failureCode: input.code, ...placeData(input.where) }, input.at);
  }

  async open(userId: string, requestId: string): Promise<TranscriptionRequestData | undefined> {
    const result = await this.db.execute<{ data: TranscriptionRequestData }>(sql`
      SELECT data FROM tasks
      WHERE id = ${requestId} AND user_id = ${userId} AND actor = 'agent' AND kind = 'save_content_with_transcription'
        AND status IN ${IN_PROGRESS} AND deleted_at IS NULL`);
    return result.rows[0]?.data;
  }

  async cancel(tx: unknown, input: { requestId: string; userId: string; at: Date; where: TranscriptionPlace }): Promise<void> {
    const transaction = tx as Tx;
    const updated = await transaction.execute(sql`
      UPDATE tasks SET status = ${STOPPED_STATUS}, situation = ${ON_CLOSE_SITUATION}, finished_at = ${input.at.toISOString()},
        updated_at = now(), data = data || ${JSON.stringify({ errorCode: "cancelled", ...placeData(input.where) })}::jsonb
      WHERE id = ${input.requestId} AND user_id = ${input.userId} AND actor = 'agent'
        AND kind = 'save_content_with_transcription' AND status IN ${IN_PROGRESS}
      RETURNING id`);
    if (updated.rows.length !== 1) throw new TranscriptionNotRunningError();
    await transaction.execute(sql`
      UPDATE jobs SET status = 'cancelled', lease_until = NULL, progress = NULL, updated_at = now()
      WHERE task_id = ${input.requestId} AND user_id = ${input.userId} AND status IN ('queued', 'running')`);
  }

  async awaitingFormat(userId: string, requestId: string): Promise<FormattingInput | undefined> {
    const result = await this.db.execute<{ data: TranscriptionRequestData; entry: { type?: string } & TranscriptionResult }>(sql`
      SELECT t.data, e.data AS entry FROM tasks t
      JOIN task_entries e ON e.task_id = t.id AND e.kind = 'input' AND e.data->>'type' = 'transcription'
      WHERE t.id = ${requestId} AND t.user_id = ${userId} AND t.actor = 'agent'
        AND t.kind = 'save_content_with_transcription' AND t.status = 'running' AND t.deleted_at IS NULL
      ORDER BY e.id DESC LIMIT 1`);
    const row = result.rows[0];
    if (!row) return undefined;
    const { type: _type, ...entry } = row.entry;
    return { data: row.data, result: entry };
  }

  async finish(
    tx: unknown,
    input: {
      requestId: string;
      userId: string;
      status: Extract<AgentTaskStatus, "completed" | "failed">;
      at: Date;
      failureCode?: TranscriptionFailureCode;
      commentsSummaryFailed?: boolean;
      where: TranscriptionPlace;
    },
  ): Promise<void> {
    const transaction = tx as Tx;
    const data = { ...(input.failureCode ? { failureCode: input.failureCode } : {}), ...placeData(input.where) };
    const updated = await transaction.execute(sql`
      UPDATE tasks SET status = ${input.status}, finished_at = ${input.at.toISOString()}, updated_at = now(),
        data = data || ${JSON.stringify(data)}::jsonb
      WHERE id = ${input.requestId} AND user_id = ${input.userId} AND actor = 'agent'
        AND kind = 'save_content_with_transcription' AND status = 'running'
      RETURNING id`);
    if (updated.rows.length !== 1) throw new TranscriptionNotRunningError();
    if (input.commentsSummaryFailed) {
      await appendEntry(transaction, {
        taskId: input.requestId,
        userId: input.userId,
        kind: "trace",
        data: { stage: "comments_summary", status: "failed" },
      });
    }
  }

  /** Fecha o job do servico local, e so se o lease ainda e de quem entrega: sem isso, a transacao inteira se desfaz. */
  private async close(tx: Tx, input: { requestId: string; userId: string; leaseToken: string }): Promise<void> {
    const closed = await tx.execute(sql`
      UPDATE jobs SET status = 'succeeded', error = NULL, progress = NULL, lease_until = NULL, updated_at = now()
      WHERE kind = ${TRANSCRIPTION_JOB} AND user_id = ${input.userId} AND task_id = ${input.requestId}
        AND lease_token = ${input.leaseToken} AND status IN ('running', 'queued')
      RETURNING id`);
    if (closed.rows.length !== 1) throw new TranscriptionLeaseLostError();
  }

  private async setStatus(
    tx: Tx,
    requestId: string,
    status: "running" | "failed",
    data: Record<string, unknown>,
    finishedAt?: Date,
  ): Promise<void> {
    const updated = await tx.execute(sql`
      UPDATE tasks SET status = ${status}, finished_at = ${finishedAt ? finishedAt.toISOString() : sql`finished_at`},
        updated_at = now(), data = data || ${JSON.stringify(data)}::jsonb
      WHERE id = ${requestId} AND actor = 'agent' AND kind = 'save_content_with_transcription'
        AND status = 'awaiting_transcription'
      RETURNING id`);
    if (updated.rows.length !== 1) throw new TranscriptionLeaseLostError();
  }
}
