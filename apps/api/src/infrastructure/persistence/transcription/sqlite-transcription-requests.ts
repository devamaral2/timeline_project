import { randomUUID } from "node:crypto";
import type { TranscriptionFailureCode, TranscriptionResult, TranscriptionStage } from "@repo/contracts";
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
import { c, jsonMerge, NOW, rowDecoder, sql } from "@repo/sqlite";
import { IN_PROGRESS, ON_CLOSE_SITUATION, STOPPED_STATUS } from "../requests/agent-status-sql";
import { appendEntry } from "../requests/request-rows";
import type { Db, Tx } from "../shared/tx";

const openRequestRow = rowDecoder({ id: c.text, data: c.json<Partial<TranscriptionRequestData>>() });
const claimedRow = rowDecoder({ requestId: c.text, leaseToken: c.text, leaseUntil: c.timestamp });
const abandonedRow = rowDecoder({ requestId: c.text, leaseToken: c.text, data: c.json<TranscriptionRequestData>() });
const dataRow = rowDecoder({ data: c.json<TranscriptionRequestData>() });
const formatRow = rowDecoder({
  data: c.json<TranscriptionRequestData>(),
  entry: c.json<{ type?: string } & TranscriptionResult>(),
});

/**
 * O que o lote de entidades nao grava do pedido de transcricao: o job do servico
 * local (ADR 0013) e o que ele guarda. O pedido, o documento e a relacao com a
 * Leitura diaria (`TaskRelations`) sao gravados na mesma transacao do escritor em lote.
 */
export class SqliteTranscriptionRequests implements TranscriptionRequests {
  constructor(private readonly db: Db) {}

  async findOpen(userId: string, url: string, day: string): Promise<OpenTranscriptionRequest | undefined> {
    const row = await this.db.get(sql`
      SELECT id, data FROM tasks
      WHERE user_id = ${userId} AND kind = 'save_content_with_transcription'
        AND status IN ${IN_PROGRESS} AND deleted_at IS NULL
        AND data->>'url' = ${url} AND data->>'day' = ${day}
      ORDER BY id DESC LIMIT 1`, openRequestRow);
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
    // Recuperar e pegar numa transacao so: o escritor unico impede dois servicos de pegarem o mesmo job.
    return this.db.transaction(async (tx) => {
      // O job cujo servico sumiu volta para a fila (so os desta fila; o resto e do worker interno).
      await tx.execute(sql`
        UPDATE jobs SET status = 'queued', error = 'Worker lease expired', lease_until = NULL, available_at = ${NOW},
          updated_at = ${NOW}
        WHERE kind = ${TRANSCRIPTION_JOB} AND user_id = ${userId} AND status = 'running'
          AND lease_until <= ${new Date()} AND attempts < ${TRANSCRIPTION_MAX_ATTEMPTS}`);
      const claimed = await tx.get(
        sql`
        UPDATE jobs SET status = 'running', attempts = attempts + 1, lease_token = ${randomUUID()},
          lease_until = ${new Date(Date.now() + TRANSCRIPTION_LEASE_MS)}, updated_at = ${NOW}
        WHERE id IN (
          SELECT j.id FROM jobs j
          JOIN tasks t ON t.id = j.task_id
          WHERE j.kind = ${TRANSCRIPTION_JOB} AND j.user_id = ${userId} AND j.status = 'queued'
            AND j.available_at <= ${new Date()} AND t.status = 'awaiting_transcription' AND t.deleted_at IS NULL
          ORDER BY j.available_at, j.id
          LIMIT 1
        )
        RETURNING task_id AS "requestId", lease_token AS "leaseToken", lease_until AS "leaseUntil"`,
        claimedRow,
      );
      if (!claimed) return undefined;
      const task = await tx.get(sql`SELECT data->>'url' AS url FROM tasks WHERE id = ${claimed.requestId}`);
      return {
        requestId: claimed.requestId,
        url: String(task?.url),
        leaseToken: claimed.leaseToken,
        leaseExpiresAt: claimed.leaseUntil,
      };
    });
  }

  async abandoned(userId: string): Promise<AbandonedTranscription[]> {
    return this.db.all(sql`
      SELECT j.task_id AS "requestId", j.lease_token AS "leaseToken", t.data AS "data"
      FROM jobs j JOIN tasks t ON t.id = j.task_id
      WHERE j.kind = ${TRANSCRIPTION_JOB} AND j.user_id = ${userId} AND j.status = 'running'
        AND j.lease_until <= ${new Date()} AND j.attempts >= ${TRANSCRIPTION_MAX_ATTEMPTS}
        AND t.kind = 'save_content_with_transcription' AND t.status = 'awaiting_transcription' AND t.deleted_at IS NULL
      ORDER BY j.id`, abandonedRow);
  }

  async renew(
    userId: string,
    input: { requestId: string; leaseToken: string; progress: { stage: TranscriptionStage; percent: number } },
  ): Promise<{ leaseExpiresAt: Date } | undefined> {
    const now = new Date();
    const result = await this.db.execute(
      sql`
      UPDATE jobs SET lease_until = ${new Date(now.getTime() + TRANSCRIPTION_LEASE_MS)},
        progress = ${sql.json(input.progress)}, updated_at = ${NOW}
      WHERE kind = ${TRANSCRIPTION_JOB} AND user_id = ${userId} AND task_id = ${input.requestId}
        AND lease_token = ${input.leaseToken} AND status = 'running' AND lease_until > ${now}
      RETURNING lease_until AS "leaseUntil"`,
      rowDecoder({ leaseUntil: c.timestamp }),
    );
    const row = result.rows[0];
    return row ? { leaseExpiresAt: row.leaseUntil } : undefined;
  }

  async holding(userId: string, requestId: string, leaseToken: string): Promise<TranscriptionRequestData | undefined> {
    // `queued` com o mesmo token: o lease venceu mas ninguem o pegou; a entrega nao se perde.
    const row = await this.db.get(sql`
      SELECT t.data AS "data" FROM jobs j JOIN tasks t ON t.id = j.task_id
      WHERE j.kind = ${TRANSCRIPTION_JOB} AND j.user_id = ${userId} AND j.task_id = ${requestId}
        AND j.lease_token = ${leaseToken} AND j.status IN ('running', 'queued')
        AND t.kind = 'save_content_with_transcription' AND t.status = 'awaiting_transcription' AND t.deleted_at IS NULL`, dataRow);
    return row?.data;
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
    const row = await this.db.get(sql`
      SELECT data FROM tasks
      WHERE id = ${requestId} AND user_id = ${userId} AND actor = 'agent' AND kind = 'save_content_with_transcription'
        AND status IN ${IN_PROGRESS} AND deleted_at IS NULL`, dataRow);
    return row?.data;
  }

  async cancel(tx: unknown, input: { requestId: string; userId: string; at: Date; where: TranscriptionPlace }): Promise<void> {
    const transaction = tx as Tx;
    const updated = await transaction.execute(sql`
      UPDATE tasks SET status = ${STOPPED_STATUS}, situation = ${ON_CLOSE_SITUATION}, finished_at = ${input.at},
        updated_at = ${NOW}, data = ${jsonMerge(sql.raw("data"), { errorCode: "cancelled", ...placeData(input.where) })}
      WHERE id = ${input.requestId} AND user_id = ${input.userId} AND actor = 'agent'
        AND kind = 'save_content_with_transcription' AND status IN ${IN_PROGRESS}
      RETURNING id`);
    if (updated.rows.length !== 1) throw new TranscriptionNotRunningError();
    await transaction.execute(sql`
      UPDATE jobs SET status = 'cancelled', lease_until = NULL, progress = NULL, updated_at = ${NOW}
      WHERE task_id = ${input.requestId} AND user_id = ${input.userId} AND status IN ('queued', 'running')`);
  }

  async awaitingFormat(userId: string, requestId: string): Promise<FormattingInput | undefined> {
    const row = await this.db.get(sql`
      SELECT t.data AS "data", e.data AS "entry" FROM tasks t
      JOIN task_entries e ON e.task_id = t.id AND e.kind = 'input' AND e.data->>'type' = 'transcription'
      WHERE t.id = ${requestId} AND t.user_id = ${userId} AND t.actor = 'agent'
        AND t.kind = 'save_content_with_transcription' AND t.status = 'running' AND t.deleted_at IS NULL
      ORDER BY e.id DESC LIMIT 1`, formatRow);
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
      UPDATE tasks SET status = ${input.status}, finished_at = ${input.at}, updated_at = ${NOW},
        data = ${jsonMerge(sql.raw("data"), data)}
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
      UPDATE jobs SET status = 'succeeded', error = NULL, progress = NULL, lease_until = NULL, updated_at = ${NOW}
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
      UPDATE tasks SET status = ${status}, finished_at = ${finishedAt ?? sql`finished_at`},
        updated_at = ${NOW}, data = ${jsonMerge(sql.raw("data"), data)}
      WHERE id = ${requestId} AND actor = 'agent' AND kind = 'save_content_with_transcription'
        AND status = 'awaiting_transcription'
      RETURNING id`);
    if (updated.rows.length !== 1) throw new TranscriptionLeaseLostError();
  }
}
