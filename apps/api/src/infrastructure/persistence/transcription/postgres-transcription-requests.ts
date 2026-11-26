import { sql } from "drizzle-orm";
import {
  TRANSCRIPTION_JOB,
  type OpenTranscriptionRequest,
  type TranscriptionRequestData,
  type TranscriptionRequests,
} from "../../../api-core/transcription/transcription-requests";
import { enqueueJobInTransaction, type JobTransaction } from "../../jobs/job-context";
import type { Db, Tx } from "../shared/tx";

/**
 * O que o lote de entidades nao grava do pedido de transcricao: a relacao do
 * pedido com a Leitura diaria e o job do servico local (ADR 0013). O pedido e o
 * documento ja sao gravados pelo escritor em lote; isto roda na transacao dele.
 */
export class PostgresTranscriptionRequests implements TranscriptionRequests {
  constructor(private readonly db: Db) {}

  async findOpen(userId: string, url: string, day: string): Promise<OpenTranscriptionRequest | undefined> {
    const result = await this.db.execute<{ id: string; data: Partial<TranscriptionRequestData> }>(sql`
      SELECT id, data FROM tasks
      WHERE user_id = ${userId} AND kind = 'save_content_with_transcription'
        AND status IN ('awaiting_transcription', 'running') AND deleted_at IS NULL
        AND data->>'url' = ${url} AND data->>'day' = ${day}
      ORDER BY id DESC LIMIT 1`);
    const row = result.rows[0];
    if (!row?.data.readingTaskId || !row.data.artifactId) return undefined;
    return { requestId: row.id, readingTaskId: row.data.readingTaskId, artifactId: row.data.artifactId };
  }

  async record(
    tx: unknown,
    input: { requestId: string; userId: string; readingTaskId: string; relation: "generates" | "updates" },
  ): Promise<void> {
    const transaction = tx as Tx;
    await transaction.execute(sql`
      INSERT INTO task_task_relation (from_task_id, to_task_id, relation)
      VALUES (${input.requestId}, ${input.readingTaskId}, ${input.relation})
      ON CONFLICT DO NOTHING`);
    await enqueueJobInTransaction(transaction as unknown as JobTransaction, {
      kind: TRANSCRIPTION_JOB,
      userId: input.userId,
      actorId: input.userId,
      taskId: input.requestId,
      payload: { requestId: input.requestId },
      dedupeKey: input.requestId,
    });
  }
}
