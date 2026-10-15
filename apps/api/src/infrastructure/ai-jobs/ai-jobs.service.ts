import { Logger, type OnModuleInit, type OnApplicationShutdown, NotFoundException, ConflictException } from "@nestjs/common";
import * as amqp from "amqplib";
import { setTimeout as delay } from "node:timers/promises";
import { getAiJobsEnv, type AiJobsEnv } from "../../config/env";
import { PostgresAiJobStore, type AiJob, retryDelay } from "../persistence/ai-jobs/postgres-ai-job.store";
import { aiJobContext, completeCurrentAiJob, setAiJobResult, type AiJobKind, type EnqueueAiJobInput } from "./ai-job-context";

export type { AiJob } from "../persistence/ai-jobs/postgres-ai-job.store";
export class RetryableAiJobError extends Error {}
export class AiJobCancelledError extends Error { readonly code = "cancelled"; }
export class AiJobFailedError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function aiJobErrorCode(error: unknown): string {
  const known = new Set(["conflict", "conversation_gone", "invalid_input", "limit_reached", "unavailable", "forbidden"]);
  const candidate = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (typeof candidate === "string" && known.has(candidate)) return candidate;
  if (error instanceof Error) {
    const names: Record<string, string> = {
      LlmUnavailableError: "unavailable", EntityBatchConflictError: "conflict",
      AgentConversationNotFoundError: "conversation_gone", InvalidInputError: "invalid_input",
      AgentLimitReachedError: "limit_reached", AgentTargetForbiddenError: "forbidden",
    };
    return names[error.constructor.name] ?? "unavailable";
  }
  return "unavailable";
}
export interface AiJobHandlerContext {
  jobId: string;
  userId: string;
  actorId: string;
  signal: AbortSignal;
  progress(value: unknown): Promise<void>;
}
export type AiJobHandler = (payload: unknown, context: AiJobHandlerContext) => Promise<unknown>;
export function isRetryableAiJobError(error: unknown, seen = new Set<unknown>()): boolean {
  if (error instanceof RetryableAiJobError) return true;
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
    isRetryableAiJobError(e.cause, seen);
}
const kinds: AiJobKind[] = ["agent-turn", "transcript-event", "meal-note"];

export class AiJobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiJobsService.name);
  private readonly handlers = new Map<AiJobKind, AiJobHandler>();
  private readonly failureHandlers = new Map<AiJobKind, (payload: unknown, context: AiJobHandlerContext, error: unknown) => Promise<unknown>>();
  private readonly stop = new AbortController();
  private readonly active = new Map<string, AbortController>();
  private slots = 0;
  private loop?: Promise<void>;
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  constructor(readonly store: PostgresAiJobStore, readonly env: AiJobsEnv = getAiJobsEnv()) {}
  register(kind: AiJobKind, handler: AiJobHandler, options?: { onFailure?: (payload: unknown, context: AiJobHandlerContext, error: unknown) => Promise<unknown> }): void {
    if (this.handlers.has(kind)) throw new Error(`AI handler already registered: ${kind}`);
    this.handlers.set(kind, handler);
    if (options?.onFailure) this.failureHandlers.set(kind, options.onFailure);
  }
  enqueue(input: EnqueueAiJobInput): Promise<string> { return this.store.enqueue(input); }
  async get(id: string, userId: string): Promise<AiJob> {
    const job = await this.store.get(id, userId);
    if (!job) throw new NotFoundException("AI job not found");
    return job;
  }
  list(userId: string): Promise<AiJob[]> { return this.store.list(userId); }
  async cancel(id: string, userId: string): Promise<void> {
    const job = await this.get(id, userId);
    // A meal's derived note must not be stranded in "pending" by cancelling its
    // internal job. Deleting the note makes enrichment skip its guarded update.
    if (job.kind === "meal-note") throw new ConflictException("Exclua a nota para interromper seu enriquecimento");
    await this.store.cancel(id, userId);
    this.active.get(id)?.abort();
  }
  /** Abort only detaches this watcher. It never changes the persisted job. */
  async wait(id: string, userId: string, onProgress?: (value: unknown) => void, signal?: AbortSignal): Promise<unknown> {
    let last: string | undefined;
    for (;;) {
      signal?.throwIfAborted();
      const job = await this.get(id, userId);
      const progress = JSON.stringify(job.progress);
      if (progress !== last && job.progress !== null) {
        // Observer delivery is not execution: a dead transport must not fail the wait.
        try { onProgress?.(job.progress); } catch { /* observer unavailable */ }
        last = progress;
      }
      if (job.status === "succeeded") return job.result;
      if (job.status === "failed") throw new AiJobFailedError(job.error ?? "AI job failed");
      if (job.status === "cancelled") throw new AiJobCancelledError("AI job cancelled");
      await delay(250, undefined, { signal });
    }
  }
  onModuleInit(): void { this.loop = this.run(); }
  private queue(kind: string): string { return `${this.env.AI_JOBS_QUEUE_PREFIX}.${kind}`; }
  private async run(): Promise<void> {
    let failures = 0;
    while (!this.stop.signal.aborted) {
      try {
        // Recovery runs even with the broker offline. Enqueue never needs AMQP.
        await this.store.recover();
        const channel = this.channel ?? await this.connect();
        for (const job of await this.store.publications()) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("AMQP confirm timed out")), 10_000);
            channel.sendToQueue(this.queue(job.kind), Buffer.from(job.id), { persistent: true, contentType: "text/plain" },
              (error) => { clearTimeout(timeout); error ? reject(error) : resolve(); });
          });
          await this.store.published(job.id);
        }
        failures = 0;
        await delay(1000, undefined, { signal: this.stop.signal });
      } catch {
        if (this.stop.signal.aborted) break;
        this.logger.warn("AI queue unavailable; durable jobs remain in PostgreSQL");
        await this.disconnect();
        await delay(retryDelay(++failures), undefined, { signal: this.stop.signal }).catch(() => {});
      }
    }
  }
  private async connect(): Promise<amqp.ConfirmChannel> {
    await this.disconnect();
    const url = new URL(this.env.RABBITMQ_URL);
    if (!url.searchParams.has("heartbeat")) url.searchParams.set("heartbeat", "15");
    const connection = await amqp.connect(url.toString(), { timeout: 10_000 });
    if (this.stop.signal.aborted) {
      await connection.close().catch(() => {});
      this.stop.signal.throwIfAborted();
    }
    this.connection = connection;
    connection.on("error", () => {});
    connection.on("close", () => { if (this.connection === connection) this.channel = undefined; });
    const channel = await connection.createConfirmChannel();
    channel.on("error", () => {});
    channel.on("close", () => { if (this.channel === channel) this.channel = undefined; });
    // Per-consumer prefetch works with RabbitMQ 4; local slots bound all queues.
    await channel.prefetch(this.env.AI_JOBS_CONCURRENCY);
    for (const kind of kinds) {
      await channel.assertQueue(this.queue(kind), { durable: true });
      await channel.consume(this.queue(kind), (message) => {
        if (!message) { void channel.close().catch(() => {}); return; }
        void this.consume(message.content.toString(), kind).then(() => {
          try { channel.ack(message); } catch { /* connection loss: redelivery */ }
        }, () => {
          // No immediate nack/requeue loop: the durable outbox repairs delivery.
          try { channel.ack(message); } catch { /* connection loss */ }
        });
      });
    }
    this.channel = channel;
    return channel;
  }
  async consume(id: string, kind: AiJobKind): Promise<void> {
    if (this.slots >= this.env.AI_JOBS_CONCURRENCY) {
      await this.store.defer(id);
      return;
    }
    this.slots++;
    try { await this.execute(id, kind); } finally { this.slots--; }
  }
  private async execute(id: string, kind: AiJobKind): Promise<void> {
    const handler = this.handlers.get(kind);
    if (this.stop.signal.aborted) return;
    if (!handler) {
      await this.store.defer(id);
      return;
    }
    const job = await this.store.claim(id);
    if (!job) {
      await this.store.defer(id);
      return;
    }
    if (job.kind !== kind) {
      await this.store.fail(job, "invalid_input", false);
      return;
    }
    const token = job.leaseToken;
    if (!token) {
      await this.store.defer(id);
      return;
    }
    const abort = new AbortController();
    this.active.set(id, abort);
    let heartbeatRunning = false;
    const timer = setInterval(() => {
      if (heartbeatRunning || abort.signal.aborted || this.stop.signal.aborted) return;
      heartbeatRunning = true;
      void this.store.heartbeat(id, token).then((live) => { if (!live) abort.abort(); },
        () => abort.abort()).finally(() => { heartbeatRunning = false; });
    }, Math.floor(this.env.AI_JOBS_LEASE_MS / 3));
    try {
      await aiJobContext.run({ id, token, createdAt: job.createdAt }, async () => {
        if (job.attempts > this.env.AI_JOBS_MAX_ATTEMPTS) throw new Error("Worker attempts exhausted");
        const result = await handler(job.payload, { jobId: id, userId: job.userId, actorId: job.actorId,
          signal: abort.signal, progress: (value) => this.store.progress(id, token, value) });
        abort.signal.throwIfAborted();
        const current = await this.store.get(id, job.userId);
        if (current?.status === "succeeded" || current?.status === "failed") return; // domain transaction already completed
        if (!aiJobContext.getStore()?.prepared) setAiJobResult(result);
        await this.store.database.db.transaction((tx) => completeCurrentAiJob(tx));
      });
    } catch (error) {
      if (abort.signal.aborted || this.stop.signal.aborted) return;
      const retryable = isRetryableAiJobError(error);
      const failureHandler = this.failureHandlers.get(kind);
      if ((!retryable || job.attempts >= this.env.AI_JOBS_MAX_ATTEMPTS) && failureHandler && !abort.signal.aborted) {
        try {
          await aiJobContext.run({ id, token, createdAt: job.createdAt }, async () => {
            const result = await failureHandler(job.payload, { jobId: id, userId: job.userId, actorId: job.actorId,
              signal: abort.signal, progress: (value) => this.store.progress(id, token, value) }, error);
            const current = await this.store.get(id, job.userId);
            if (current?.status === "running") {
              if (!aiJobContext.getStore()?.prepared) setAiJobResult(result);
              await this.store.database.db.transaction((tx) => completeCurrentAiJob(tx));
            }
          });
        } catch {
          // Failure projection is domain state too. Never mark the job terminal
          // while its note is still pending. Lease recovery retries the guarded
          // failure hook without calling the provider after attempt exhaustion.
          this.logger.warn("AI failure projection deferred until lease recovery");
          return;
        }
      }
      // Do not store provider messages: these can include credentials or user data.
      await this.store.fail(job, aiJobErrorCode(error),
        retryable);
    } finally {
      clearInterval(timer);
      if (this.active.get(id) === abort) this.active.delete(id);
    }
  }
  private async disconnect(): Promise<void> {
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    await connection?.close().catch(() => {});
  }
  async onApplicationShutdown(): Promise<void> {
    this.stop.abort();
    for (const abort of this.active.values()) abort.abort();
    await this.disconnect();
    await this.loop;
    await this.disconnect(); // Covers a connect/channel creation that was in flight.
    // Unfinished handlers are fenced by expiring leases, never marked successful.
  }
}
