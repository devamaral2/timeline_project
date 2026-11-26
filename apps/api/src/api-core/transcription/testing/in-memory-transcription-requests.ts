import type { TranscriptionFailureCode, TranscriptionResult, TranscriptionStage } from "@repo/contracts";
import { Task } from "../../../domain";
import type { InMemoryTaskDatabase } from "../../tasks/testing/in-memory-task-database";
import type {
  AbandonedTranscription,
  FormattingInput,
  OpenTranscriptionRequest,
  ReservedTranscription,
  TranscriptionPlace,
  TranscriptionRequestData,
  TranscriptionRequests,
} from "../transcription-requests";
import {
  placeData,
  TRANSCRIPTION_FORMAT_JOB,
  TRANSCRIPTION_JOB,
  TRANSCRIPTION_LEASE_MS,
  TRANSCRIPTION_MAX_ATTEMPTS,
  TranscriptionLeaseLostError,
  TranscriptionNotRunningError,
} from "../transcription-requests";

interface LeasedJob {
  taskId: string;
  userId: string;
  status: "queued" | "running" | "succeeded" | "cancelled";
  attempts: number;
  leaseToken?: string;
  leaseUntil?: Date;
  progress?: { stage: TranscriptionStage; percent: number };
}

/** O equivalente em memoria do que o Postgres grava na transacao do lote: as relacoes entre tarefas, os jobs e as entradas. */
export class InMemoryTranscriptionRequests implements TranscriptionRequests {
  readonly relations: { fromTaskId: string; toTaskId: string; relation: string }[] = [];
  /** Os jobs do servico local que ja nasceram, na ordem. */
  readonly jobs: { kind: string; userId: string; taskId: string }[] = [];
  /** Os jobs internos de formatacao enfileirados pela entrega. */
  readonly formatJobs: { kind: string; userId: string; taskId: string }[] = [];
  private readonly queue: LeasedJob[] = [];
  private readonly entries: { taskId: string; kind: string; data: Record<string, unknown> }[] = [];
  private tokens = 0;

  constructor(
    private readonly database: InMemoryTaskDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

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
    this.queue.push({ taskId: input.requestId, userId: input.userId, status: "queued", attempts: 0 });
  }

  async reserve(userId: string): Promise<ReservedTranscription | undefined> {
    const now = this.clock();
    for (const job of this.queue) {
      if (job.status === "running" && job.leaseUntil && job.leaseUntil <= now && job.attempts < TRANSCRIPTION_MAX_ATTEMPTS) {
        job.status = "queued";
      }
    }
    const job = this.queue.find((candidate) => {
      const task = this.database.tasks.find((stored) => stored.id === candidate.taskId);
      return candidate.userId === userId && candidate.status === "queued" && task?.status === "awaiting_transcription";
    });
    if (!job) return undefined;
    job.status = "running";
    job.attempts += 1;
    job.leaseToken = `lease-${++this.tokens}`;
    job.leaseUntil = new Date(now.getTime() + TRANSCRIPTION_LEASE_MS);
    const task = this.database.tasks.find((stored) => stored.id === job.taskId) as Task;
    return {
      requestId: job.taskId,
      url: (task.data as Partial<TranscriptionRequestData>).url as string,
      leaseToken: job.leaseToken,
      leaseExpiresAt: job.leaseUntil,
    };
  }

  async abandoned(userId: string): Promise<AbandonedTranscription[]> {
    const now = this.clock();
    return this.queue.flatMap((job) => {
      const task = this.database.tasks.find((stored) => stored.id === job.taskId);
      if (
        job.userId !== userId || job.status !== "running" || !job.leaseToken || !job.leaseUntil || job.leaseUntil > now ||
        job.attempts < TRANSCRIPTION_MAX_ATTEMPTS || task?.status !== "awaiting_transcription"
      ) return [];
      return [{ requestId: job.taskId, leaseToken: job.leaseToken, data: task.data as unknown as TranscriptionRequestData }];
    });
  }

  async renew(
    userId: string,
    input: { requestId: string; leaseToken: string; progress: { stage: TranscriptionStage; percent: number } },
  ): Promise<{ leaseExpiresAt: Date } | undefined> {
    const now = this.clock();
    const job = this.queue.find(
      (candidate) =>
        candidate.taskId === input.requestId &&
        candidate.userId === userId &&
        candidate.status === "running" &&
        candidate.leaseToken === input.leaseToken &&
        (candidate.leaseUntil as Date) > now,
    );
    if (!job) return undefined;
    job.leaseUntil = new Date(now.getTime() + TRANSCRIPTION_LEASE_MS);
    job.progress = input.progress;
    return { leaseExpiresAt: job.leaseUntil };
  }

  async holding(userId: string, requestId: string, leaseToken: string): Promise<TranscriptionRequestData | undefined> {
    const job = this.holder(userId, requestId, leaseToken);
    const task = this.database.tasks.find((stored) => stored.id === requestId);
    if (!job || task?.kind !== "save_content_with_transcription" || task.status !== "awaiting_transcription") return undefined;
    return task.data as unknown as TranscriptionRequestData;
  }

  async accept(
    _tx: unknown,
    input: { requestId: string; userId: string; leaseToken: string; result: TranscriptionResult },
  ): Promise<void> {
    this.close(input.userId, input.requestId, input.leaseToken);
    this.entries.push({ taskId: input.requestId, kind: "input", data: { type: "transcription", ...input.result } });
    this.setStatus(input.requestId, "running");
    this.formatJobs.push({ kind: TRANSCRIPTION_FORMAT_JOB, userId: input.userId, taskId: input.requestId });
  }

  async reject(
    _tx: unknown,
    input: { requestId: string; userId: string; leaseToken: string; code: TranscriptionFailureCode; at: Date; where: TranscriptionPlace },
  ): Promise<void> {
    this.close(input.userId, input.requestId, input.leaseToken);
    this.setStatus(input.requestId, "failed", { failureCode: input.code, ...placeData(input.where) }, input.at);
  }

  async open(userId: string, requestId: string): Promise<TranscriptionRequestData | undefined> {
    const task = this.database.tasks.find((stored) => stored.id === requestId);
    if (task?.userId !== userId || task.kind !== "save_content_with_transcription") return undefined;
    if (task.status !== "awaiting_transcription" && task.status !== "running") return undefined;
    return task.data as unknown as TranscriptionRequestData;
  }

  async cancel(_tx: unknown, input: { requestId: string; userId: string; at: Date; where: TranscriptionPlace }): Promise<void> {
    const task = this.database.tasks.find((stored) => stored.id === input.requestId);
    if (task?.userId !== input.userId || (task.status !== "awaiting_transcription" && task.status !== "running")) {
      throw new TranscriptionNotRunningError();
    }
    this.setStatus(input.requestId, "cancel", { errorCode: "cancelled", ...placeData(input.where) }, input.at);
    for (const job of this.queue) {
      if (job.taskId === input.requestId && (job.status === "queued" || job.status === "running")) job.status = "cancelled";
    }
  }

  async awaitingFormat(userId: string, requestId: string): Promise<FormattingInput | undefined> {
    const task = this.database.tasks.find((stored) => stored.id === requestId);
    if (task?.userId !== userId || task.kind !== "save_content_with_transcription" || task.status !== "running") return undefined;
    const entry = this.entries.filter((stored) => stored.taskId === requestId && stored.data.type === "transcription").at(-1);
    if (!entry) return undefined;
    const { type: _type, ...result } = entry.data;
    return { data: task.data as unknown as TranscriptionRequestData, result: result as unknown as TranscriptionResult };
  }

  async finish(
    _tx: unknown,
    input: {
      requestId: string;
      userId: string;
      status: "done" | "failed";
      at: Date;
      failureCode?: TranscriptionFailureCode;
      commentsSummaryFailed?: boolean;
      where: TranscriptionPlace;
    },
  ): Promise<void> {
    const task = this.database.tasks.find((stored) => stored.id === input.requestId);
    if (task?.userId !== input.userId || task.status !== "running") throw new TranscriptionNotRunningError();
    this.setStatus(input.requestId, input.status, { ...(input.failureCode ? { failureCode: input.failureCode } : {}), ...placeData(input.where) }, input.at);
    if (input.commentsSummaryFailed) {
      this.entries.push({ taskId: input.requestId, kind: "trace", data: { stage: "comments_summary", status: "failed" } });
    }
  }

  /** O progresso passageiro que o serviço local mandou ao renovar. */
  progressOf(requestId: string): { stage: TranscriptionStage; percent: number } | undefined {
    return this.queue.find((job) => job.taskId === requestId)?.progress;
  }

  /** As entradas do pedido, na ordem em que entraram. */
  entriesOf(requestId: string): { kind: string; data: Record<string, unknown> }[] {
    return this.entries.filter((entry) => entry.taskId === requestId).map(({ kind, data }) => ({ kind, data }));
  }

  /** Os jobs do servico local que ainda nao terminaram. */
  openJobs(): LeasedJob[] {
    return this.queue.filter((job) => job.status === "queued" || job.status === "running");
  }

  private holder(userId: string, requestId: string, leaseToken: string): LeasedJob | undefined {
    return this.queue.find(
      (job) => job.taskId === requestId && job.userId === userId && job.leaseToken === leaseToken && (job.status === "queued" || job.status === "running"),
    );
  }

  private close(userId: string, requestId: string, leaseToken: string): void {
    const job = this.holder(userId, requestId, leaseToken);
    if (!job) throw new TranscriptionLeaseLostError();
    job.status = "succeeded";
  }

  private setStatus(requestId: string, status: Task["status"], data: Record<string, unknown> = {}, finishedAt?: Date): void {
    this.database.tasks = this.database.tasks.map((task) =>
      task.id !== requestId
        ? task
        : Task.rehydrate({
            ...task,
            status,
            finishedAt: finishedAt ?? task.finishedAt,
            notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
            tags: [...task.tags],
            data: { ...task.data, ...data },
            artifactLinks: [...task.artifactLinks],
            subtaskIds: [...task.subtaskIds],
          }),
    );
  }
}
