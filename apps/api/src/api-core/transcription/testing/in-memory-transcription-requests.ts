import type { TranscriptionFailureCode, TranscriptionResult, TranscriptionStage } from "@repo/contracts";
import { Task } from "../../../domain";
import type { InMemoryTaskDatabase } from "../../tasks/testing/in-memory-task-database";
import type {
  OpenTranscriptionRequest,
  ReservedTranscription,
  TranscriptionRequestData,
  TranscriptionRequests,
} from "../transcription-requests";
import {
  TRANSCRIPTION_FORMAT_JOB,
  TRANSCRIPTION_JOB,
  TRANSCRIPTION_LEASE_MS,
  TranscriptionLeaseLostError,
} from "../transcription-requests";

interface LeasedJob {
  taskId: string;
  userId: string;
  status: "queued" | "running" | "succeeded";
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
    this.queue.push({ taskId: input.requestId, userId: input.userId, status: "queued" });
  }

  async reserve(userId: string): Promise<ReservedTranscription | undefined> {
    const now = this.clock();
    for (const job of this.queue) {
      if (job.status === "running" && job.leaseUntil && job.leaseUntil <= now) job.status = "queued";
    }
    const job = this.queue.find((candidate) => {
      const task = this.database.tasks.find((stored) => stored.id === candidate.taskId);
      return candidate.userId === userId && candidate.status === "queued" && task?.status === "awaiting_transcription";
    });
    if (!job) return undefined;
    job.status = "running";
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
    input: { requestId: string; userId: string; leaseToken: string; code: TranscriptionFailureCode; at: Date },
  ): Promise<void> {
    this.close(input.userId, input.requestId, input.leaseToken);
    this.setStatus(input.requestId, "failed", { failureCode: input.code }, input.at);
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
    return this.queue.filter((job) => job.status !== "succeeded");
  }

  private holder(userId: string, requestId: string, leaseToken: string): LeasedJob | undefined {
    return this.queue.find(
      (job) => job.taskId === requestId && job.userId === userId && job.leaseToken === leaseToken && job.status !== "succeeded",
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
