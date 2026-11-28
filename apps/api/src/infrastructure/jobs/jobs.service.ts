import { Logger, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { setTimeout as delay } from "node:timers/promises";
import { getJobsEnv, type JobsEnv } from "../../config/env";
import { SqliteJobStore, retryDelay, type Job } from "../persistence/jobs/sqlite-job.store";
import { completeCurrentJob, jobContext, type EnqueueJobInput } from "./job-context";

export type { Job } from "../persistence/jobs/sqlite-job.store";

export class RetryableJobError extends Error {}

/** O job foi pego de novo depois de esgotar as tentativas: o worker morreu com ele varias vezes. O trabalho foi abandonado, nao falhou. */
export class WorkerAttemptsExhaustedError extends Error {
  constructor() {
    super("Worker attempts exhausted");
    this.name = "WorkerAttemptsExhaustedError";
  }
}

/** O codigo seguro de por que um job falhou: nunca a mensagem do provedor, que pode trazer credencial ou dado do usuario. */
export function jobErrorCode(error: unknown): string {
  const known = new Set(["conflict", "invalid_input", "limit_reached", "unavailable", "forbidden"]);
  const candidate = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (typeof candidate === "string" && known.has(candidate)) return candidate;
  if (error instanceof Error) {
    const names: Record<string, string> = {
      LlmUnavailableError: "unavailable",
      EntityBatchConflictError: "conflict",
      InvalidInputError: "invalid_input",
      AgentLimitReachedError: "limit_reached",
      AgentTargetForbiddenError: "forbidden",
    };
    return names[error.constructor.name] ?? "unavailable";
  }
  return "unavailable";
}

export interface JobHandlerContext {
  jobId: string;
  userId: string;
  actorId: string;
  /** O pedido ou o passo que o job executa. */
  taskId?: string;
  /** Tentativa em curso (1 = primeira). */
  attempt: number;
  signal: AbortSignal;
  /** Retrato passageiro do que o job esta fazendo; some com ele. */
  progress(value: unknown): Promise<void>;
}

export type JobHandler = (payload: unknown, context: JobHandlerContext) => Promise<void>;
/** Roda quando o job falha de vez: e onde a tarefa do job vira `failed`. */
export type JobFailureHandler = (payload: unknown, context: JobHandlerContext, error: unknown) => Promise<void>;

export function isRetryableJobError(error: unknown, seen = new Set<unknown>()): boolean {
  if (error instanceof RetryableJobError) return true;
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const e = error as {
    status?: number; statusCode?: number; code?: string; name?: string;
    cause?: unknown; response?: { status?: number }; message?: string;
  };
  const status = e.status ?? e.statusCode ?? e.response?.status;
  return status === 429 || (status !== undefined && status >= 500 && status <= 599) ||
    ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(e.code ?? "") ||
    e.name === "TimeoutError" || e.name === "AbortError" ||
    (e.name === "TypeError" && e.message === "fetch failed") ||
    isRetryableJobError(e.cause, seen);
}

/**
 * O worker da fila unica (ADR 0013). Nao ha broker: a cada intervalo ele pega
 * do SQLite os jobs prontos dos tipos que tem handler, ate encher as vagas.
 */
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly failureHandlers = new Map<string, JobFailureHandler>();
  private readonly stop = new AbortController();
  private readonly active = new Map<string, AbortController>();
  private readonly running = new Set<Promise<void>>();
  private loop?: Promise<void>;

  constructor(readonly store: SqliteJobStore, readonly env: JobsEnv = getJobsEnv()) {}

  register(kind: string, handler: JobHandler, options?: { onFailure?: JobFailureHandler }): void {
    if (this.handlers.has(kind)) throw new Error(`Job handler already registered: ${kind}`);
    this.handlers.set(kind, handler);
    if (options?.onFailure) this.failureHandlers.set(kind, options.onFailure);
  }

  enqueue(input: EnqueueJobInput): Promise<string> {
    return this.store.enqueue(input);
  }

  /** Cancela os jobs vivos das tarefas e aborta os que este worker esta rodando. */
  async cancelOfTasks(taskIds: readonly string[], userId: string): Promise<void> {
    for (const id of await this.store.cancelOfTasks(taskIds, userId)) this.active.get(id)?.abort();
  }

  /** O progresso passageiro do job vivo de uma tarefa, se houver. */
  async progressOfTask(taskId: string): Promise<unknown> {
    return (await this.store.activeOfTask(taskId))?.progress ?? undefined;
  }

  onModuleInit(): void {
    this.loop = this.run();
  }

  private async run(): Promise<void> {
    let failures = 0;
    while (!this.stop.signal.aborted) {
      try {
        await this.store.recover();
        await this.tick();
        failures = 0;
        await delay(this.env.AI_JOBS_POLL_MS, undefined, { signal: this.stop.signal });
      } catch {
        if (this.stop.signal.aborted) break;
        this.logger.warn("Job queue unavailable; jobs remain queued in SQLite");
        await delay(retryDelay(++failures), undefined, { signal: this.stop.signal }).catch(() => {});
      }
    }
  }

  /** Uma passada pela fila: pega o que cabe nas vagas livres e dispara, sem esperar terminar. */
  async tick(): Promise<void> {
    const free = this.env.AI_JOBS_CONCURRENCY - this.running.size;
    if (free <= 0 || this.stop.signal.aborted) return;
    for (const job of await this.store.claim([...this.handlers.keys()], free)) {
      const execution = this.execute(job).finally(() => this.running.delete(execution));
      this.running.add(execution);
    }
  }

  /** Espera os jobs em curso neste worker terminarem. Para os testes e para o desligamento. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  private async execute(job: Job): Promise<void> {
    const handler = this.handlers.get(job.kind);
    const token = job.leaseToken;
    if (!handler || !token) return;

    const abort = new AbortController();
    this.active.set(job.id, abort);
    const context: JobHandlerContext = {
      jobId: job.id, userId: job.userId, actorId: job.actorId, taskId: job.taskId ?? undefined,
      attempt: job.attempts, signal: abort.signal,
      progress: (value) => this.store.progress(job.id, token, value),
    };
    let heartbeatRunning = false;
    const timer = setInterval(() => {
      if (heartbeatRunning || abort.signal.aborted || this.stop.signal.aborted) return;
      heartbeatRunning = true;
      void this.store.heartbeat(job.id, token).then((live) => { if (!live) abort.abort(); },
        () => abort.abort()).finally(() => { heartbeatRunning = false; });
    }, Math.floor(this.env.AI_JOBS_LEASE_MS / 3));

    const current = { id: job.id, token, createdAt: job.createdAt, attempts: job.attempts };
    try {
      await jobContext.run(current, async () => {
        if (job.attempts > this.env.AI_JOBS_MAX_ATTEMPTS) throw new WorkerAttemptsExhaustedError();
        await handler(job.payload, context);
        abort.signal.throwIfAborted();
        // O handler que grava dominio ja fechou o job na propria transacao.
        if (!jobContext.getStore()?.completed) await this.store.succeed(job.id, token);
      });
    } catch (error) {
      if (abort.signal.aborted || this.stop.signal.aborted) return;
      const retryable = isRetryableJobError(error);
      const failureHandler = this.failureHandlers.get(job.kind);
      if ((!retryable || job.attempts >= this.env.AI_JOBS_MAX_ATTEMPTS) && failureHandler) {
        try {
          await jobContext.run({ ...current }, () => failureHandler(job.payload, context, error));
        } catch {
          // A tarefa do job ainda nao sabe que falhou: nunca marcar o job como terminal antes disso.
          // O lease vence e a recuperacao tenta a projecao de novo, sem chamar o provedor.
          this.logger.warn("Job failure projection deferred until lease recovery");
          return;
        }
      }
      // Sem efeito se a projecao da falha ja encerrou o job na transacao dela.
      await this.store.fail(job, jobErrorCode(error), retryable);
    } finally {
      clearInterval(timer);
      if (this.active.get(job.id) === abort) this.active.delete(job.id);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stop.abort();
    for (const abort of this.active.values()) abort.abort();
    await this.loop;
    await this.idle();
    // Os handlers que nao terminaram ficam cercados pelo lease que vence, nunca marcados como sucesso.
  }
}

export { completeCurrentJob };
