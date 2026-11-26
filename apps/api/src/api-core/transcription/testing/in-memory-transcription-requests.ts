import type { InMemoryTaskDatabase } from "../../tasks/testing/in-memory-task-database";
import type { OpenTranscriptionRequest, TranscriptionRequestData, TranscriptionRequests } from "../transcription-requests";
import { TRANSCRIPTION_JOB } from "../transcription-requests";

/** O equivalente em memoria do que o Postgres grava na transacao do lote: as relacoes entre tarefas e os jobs. */
export class InMemoryTranscriptionRequests implements TranscriptionRequests {
  readonly relations: { fromTaskId: string; toTaskId: string; relation: string }[] = [];
  readonly jobs: { kind: string; userId: string; taskId: string }[] = [];

  constructor(private readonly database: InMemoryTaskDatabase) {}

  async findOpen(userId: string, url: string, day: string): Promise<OpenTranscriptionRequest | undefined> {
    for (const task of this.database.tasks) {
      const data = task.data as Partial<TranscriptionRequestData>;
      if (
        task.userId === userId &&
        task.kind === "save_content_with_transcription" &&
        (task.status === "awaiting_transcription" || task.status === "running") &&
        data.url === url &&
        data.day === day
      ) {
        return { requestId: task.id, readingTaskId: data.readingTaskId as string, artifactId: data.artifactId as string };
      }
    }
    return undefined;
  }

  async record(
    _tx: unknown,
    input: { requestId: string; userId: string; readingTaskId: string; relation: "generates" | "updates" },
  ): Promise<void> {
    this.relations.push({ fromTaskId: input.requestId, toTaskId: input.readingTaskId, relation: input.relation });
    this.jobs.push({ kind: TRANSCRIPTION_JOB, userId: input.userId, taskId: input.requestId });
  }
}
