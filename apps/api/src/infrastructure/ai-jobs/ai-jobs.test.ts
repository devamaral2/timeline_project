import { expect, test, vi } from "vitest";
import { aiJobContext, completeCurrentAiJob, getCurrentAiJob, setAiJobResult, setAiJobFailure, enqueueAiJobInTransaction } from "./ai-job-context";
import { AiJobsService, RetryableAiJobError, isRetryableAiJobError, AiJobCancelledError, aiJobErrorCode } from "./ai-jobs.service";
import { LlmUnavailableError, LlmHttpError, AgentLimitReachedError, InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { EntityBatchConflictError, AgentConversationNotFoundError } from "../../domain";
import { retryDelay, type AiJob, type PostgresAiJobStore } from "../persistence/ai-jobs/postgres-ai-job.store";
import { getAiJobsEnv } from "../../config/env";

const env = getAiJobsEnv({ RABBITMQ_URL: "amqp://localhost", AI_JOBS_QUEUE_PREFIX: "test", AI_JOBS_CONCURRENCY: "1" });
const brokerConnect = vi.hoisted(() => vi.fn());
vi.mock("amqplib", () => ({ connect: brokerConnect }));
const job = { id: "job", kind: "agent-turn", userId: "user", actorId: "actor", payload: {}, status: "running", leaseToken: "token", attempts: 1 } as AiJob;
function fixture() {
  const tx = { execute: vi.fn().mockResolvedValue({ rows: [{ id: "job" }] }) };
  const store = {
    claim: vi.fn().mockResolvedValue(job),
    get: vi.fn().mockResolvedValue(job),
    fail: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(true),
    defer: vi.fn().mockResolvedValue(undefined),
    progress: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue("job"),
    cancel: vi.fn().mockResolvedValue(undefined),
    database: { db: { transaction: vi.fn((fn) => fn(tx)) } },
  };
  return { store, tx, service: new AiJobsService(store as unknown as PostgresAiJobStore, env) };
}
test("completion requires prepared result and rejects stale/cancelled fences", async () => {
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  await aiJobContext.run({ id: "j", token: "t" }, async () => {
    await expect(completeCurrentAiJob({ execute })).rejects.toThrow("prepared");
    setAiJobResult({ ok: true });
    expect(getCurrentAiJob()?.result).toEqual({ ok: true });
    await expect(completeCurrentAiJob({ execute })).rejects.toThrow("lease lost");
  });
  await completeCurrentAiJob({ execute });
  expect(execute).toHaveBeenCalledTimes(1);
});
test("enqueue writes job and outbox through supplied transaction and dedupe receipt", async () => {
  const execute = vi.fn().mockResolvedValue({ rows: [{ id: "existing", status: "queued" }] });
  expect(await enqueueAiJobInTransaction({ execute }, { kind: "meal-note", userId: "u", actorId: "a", payload: { noteId: "n" }, dedupeKey: "n" })).toBe("existing");
  expect(execute).toHaveBeenCalledTimes(2);
});
test("handler runs with authenticated context and persistent progress", async () => {
  const { service, store, tx } = fixture();
  service.register("agent-turn", async (_, context) => {
    expect(context.userId).toBe("user");
    expect(context.actorId).toBe("actor");
    expect(getCurrentAiJob()?.token).toBe("token");
    await context.progress({ step: "thinking" });
    return { answer: "ok" };
  });
  await service.consume("job", "agent-turn");
  expect(store.progress).toHaveBeenCalledWith("job", "token", { step: "thinking" });
  expect(tx.execute).toHaveBeenCalledOnce();
});
test("completed redelivery does not execute handler", async () => {
  const { service, store } = fixture();
  store.claim.mockResolvedValue(undefined);
  const handler = vi.fn();
  service.register("agent-turn", handler);
  await service.consume("job", "agent-turn");
  expect(handler).not.toHaveBeenCalled();
});
test("bounded slots survive reconnect-style concurrent delivery", async () => {
  const { service, store } = fixture();
  let release!: () => void;
  service.register("agent-turn", async () => new Promise<void>((resolve) => { release = resolve; }));
  const first = service.consume("job", "agent-turn");
  await Promise.resolve();
  await service.consume("other", "agent-turn");
  expect(store.claim).toHaveBeenCalledTimes(1);
  expect(store.defer).toHaveBeenCalledWith("other");
  release();
  await first;
});
test("retries are explicitly classified, bounded and terminal hook waits for exhaustion", async () => {
  const { service, store } = fixture();
  const onFailure = vi.fn().mockResolvedValue({ status: "failed" });
  service.register("agent-turn", async () => { throw new RetryableAiJobError("private"); }, { onFailure });
  await service.consume("job", "agent-turn");
  expect(store.fail).toHaveBeenCalledWith(job, "unavailable", true);
  expect(onFailure).not.toHaveBeenCalled();
  expect(isRetryableAiJobError({ status: 429 })).toBe(true);
  expect(isRetryableAiJobError(new Error("invalid schema"))).toBe(false);
  expect(retryDelay(100)).toBe(60000);
});

test("real gateway HTTP errors and wrapped SDK causes preserve retry classification", () => {
  for (const status of [429, 500, 503]) {
    expect(isRetryableAiJobError(new LlmHttpError(status))).toBe(true);
    expect(isRetryableAiJobError(new LlmUnavailableError("provider failed", { status }))).toBe(true);
  }
  expect(isRetryableAiJobError(new LlmHttpError(401))).toBe(false);
  expect(isRetryableAiJobError(new LlmUnavailableError("Missing API key"))).toBe(false);
  expect(isRetryableAiJobError(new LlmUnavailableError("invalid result", new Error("invalid schema")))).toBe(false);
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  expect(isRetryableAiJobError(cyclic)).toBe(false);
});

test("actual domain exception classes survive persisted safe failure codes", () => {
  expect(aiJobErrorCode(new EntityBatchConflictError("private"))).toBe("conflict");
  expect(aiJobErrorCode(new AgentConversationNotFoundError("private"))).toBe("conversation_gone");
  expect(aiJobErrorCode(new AgentLimitReachedError())).toBe("limit_reached");
  expect(aiJobErrorCode(new InvalidInputError("private"))).toBe("invalid_input");
});
test("watcher abort detaches without cancelling persisted work; explicit cancellation is terminal", async () => {
  const { service, store } = fixture();
  const abort = new AbortController();
  abort.abort();
  await expect(service.wait("job", "user", undefined, abort.signal)).rejects.toThrow();
  expect(store.cancel).not.toHaveBeenCalled();
  store.get.mockResolvedValue({ ...job, status: "cancelled" });
  await expect(service.wait("job", "user")).rejects.toBeInstanceOf(AiJobCancelledError);
});

test("derived meal jobs cannot be cancelled into a permanently pending note", async () => {
  const { service, store } = fixture();
  store.get.mockResolvedValue({ ...job, kind: "meal-note" });
  await expect(service.cancel("job", "user")).rejects.toThrow("Exclua a nota");
  expect(store.cancel).not.toHaveBeenCalled();
});

test("worker death exhaustion runs fenced terminal failure hook, not provider again", async () => {
  const { service, store, tx } = fixture();
  store.claim.mockResolvedValue({ ...job, attempts: env.AI_JOBS_MAX_ATTEMPTS + 1 });
  const handler = vi.fn();
  service.register("agent-turn", handler, { onFailure: async () => {
    setAiJobFailure("unavailable");
    expect(getCurrentAiJob()?.failureCode).toBe("unavailable");
    await completeCurrentAiJob(tx);
    store.get.mockResolvedValue({ ...job, status: "failed" });
    return { status: "failed" };
  } });
  await service.consume("job", "agent-turn");
  expect(handler).not.toHaveBeenCalled();
  expect(tx.execute).toHaveBeenCalledTimes(1);
});

test("a failed terminal projection stays recoverable instead of stranding a pending note", async () => {
  const { service, store } = fixture();
  store.claim.mockResolvedValue({ ...job, attempts: env.AI_JOBS_MAX_ATTEMPTS + 1 });
  const handler = vi.fn();
  const onFailure = vi.fn().mockRejectedValue(new Error("database temporarily unavailable"));
  service.register("agent-turn", handler, { onFailure });
  await service.consume("job", "agent-turn");
  expect(handler).not.toHaveBeenCalled();
  expect(onFailure).toHaveBeenCalledOnce();
  expect(store.fail).not.toHaveBeenCalled();
  expect(store.cancel).not.toHaveBeenCalled();
});

test("owner scoping and terminal result are enforced by persistent reads", async () => {
  const { service, store } = fixture();
  store.get.mockResolvedValue(undefined);
  await expect(service.get("job", "other")).rejects.toThrow("not found");
  expect(store.get).toHaveBeenCalledWith("job", "other");
  store.get.mockResolvedValue({ ...job, status: "succeeded", result: { ok: true } });
  expect(await service.wait("job", "user")).toEqual({ ok: true });
});

test("outbox is marked published only after broker confirmation and messages contain only IDs", async () => {
  let confirm!: (error?: Error | null) => void;
  const channel = {
    on: vi.fn(), prefetch: vi.fn(), assertQueue: vi.fn(), consume: vi.fn(),
    sendToQueue: vi.fn((_: string, __: Buffer, ___: unknown, callback: typeof confirm) => { confirm = callback; }),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  brokerConnect.mockResolvedValue({ on: vi.fn(), close, createConfirmChannel: vi.fn().mockResolvedValue(channel) });
  const store = {
    recover: vi.fn().mockResolvedValue(undefined),
    publications: vi.fn().mockResolvedValue([{ id: "job-id-only", kind: "meal-note" }]),
    published: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AiJobsService(store as unknown as PostgresAiJobStore, env);
  service.onModuleInit();
  await vi.waitFor(() => expect(channel.sendToQueue).toHaveBeenCalledOnce());
  expect(channel.sendToQueue.mock.calls[0][1].toString()).toBe("job-id-only");
  expect(store.published).not.toHaveBeenCalled();
  confirm(null);
  await vi.waitFor(() => expect(store.published).toHaveBeenCalledWith("job-id-only"));
  await service.onApplicationShutdown();
  expect(close).toHaveBeenCalledOnce();
});

test("broker failure preserves submissions and recovery runs before connection attempt", async () => {
  brokerConnect.mockRejectedValue(new Error("offline"));
  const store = {
    recover: vi.fn().mockResolvedValue(undefined), publications: vi.fn(),
    enqueue: vi.fn().mockResolvedValue("durable-id"),
  };
  const service = new AiJobsService(store as unknown as PostgresAiJobStore, env);
  const handler = vi.fn();
  service.register("meal-note", handler);
  service.onModuleInit();
  expect(await service.enqueue({ kind: "meal-note", userId: "u", actorId: "a", payload: {} })).toBe("durable-id");
  await vi.waitFor(() => expect(store.recover).toHaveBeenCalledOnce());
  expect(handler).not.toHaveBeenCalled();
  expect(store.publications).not.toHaveBeenCalled();
  await service.onApplicationShutdown();
});

test("shutdown closes a connection that resolves after shutdown began", async () => {
  let resolveConnection!: (connection: unknown) => void;
  brokerConnect.mockImplementation(() => new Promise((resolve) => { resolveConnection = resolve; }));
  const store = { recover: vi.fn().mockResolvedValue(undefined), publications: vi.fn() };
  const service = new AiJobsService(store as unknown as PostgresAiJobStore, env);
  service.onModuleInit();
  await vi.waitFor(() => expect(resolveConnection).toBeTypeOf("function"));
  const closing = service.onApplicationShutdown();
  const close = vi.fn().mockResolvedValue(undefined);
  const createConfirmChannel = vi.fn();
  resolveConnection({ close, createConfirmChannel });
  await closing;
  expect(close).toHaveBeenCalledOnce();
  expect(createConfirmChannel).not.toHaveBeenCalled();
});

test("a broken progress observer cannot turn a successful receipt into a transport failure", async () => {
  const { service, store } = fixture();
  store.get.mockResolvedValue({ ...job, status: "succeeded", progress: "Salvando", result: { ok: true } });
  expect(await service.wait("job", "user", () => { throw new Error("socket closed"); })).toEqual({ ok: true });
});

test("a superseded lease attempt cannot remove the live attempt's cancellation controller", async () => {
  const { store } = fixture();
  const service = new AiJobsService(store as unknown as PostgresAiJobStore, { ...env, AI_JOBS_CONCURRENCY: 2 });
  const runs: Array<{ signal: AbortSignal; finish(): void }> = [];
  service.register("agent-turn", async (_, context) => new Promise<void>((resolve) => {
    runs.push({ signal: context.signal, finish: resolve });
  }));
  const oldAttempt = service.consume("job", "agent-turn");
  await vi.waitFor(() => expect(runs).toHaveLength(1));
  const liveAttempt = service.consume("job", "agent-turn");
  await vi.waitFor(() => expect(runs).toHaveLength(2));
  runs[0].finish();
  await oldAttempt;
  await service.cancel("job", "user");
  expect(runs[1].signal.aborted).toBe(true);
  runs[1].finish();
  await liveAttempt;
});
