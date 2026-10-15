import { afterAll, beforeAll, expect, test } from "vitest";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import * as amqp from "amqplib";
import { sql } from "drizzle-orm";
import { PostgresDatabase } from "../persistence/database/postgres-database";
import { PostgresAiJobStore } from "../persistence/ai-jobs/postgres-ai-job.store";
import { createPostgresTestContext, type PostgresTestContext } from "../persistence/testing/postgres-test-context";
import { aiJobContext, completeCurrentAiJob, setAiJobResult } from "./ai-job-context";
import { AiJobsService } from "./ai-jobs.service";
import { getAiJobsEnv } from "../../config/env";

let postgres: PostgresTestContext;
let broker: StartedTestContainer;
let service: AiJobsService;
let connection: amqp.ChannelModel;
let store: PostgresAiJobStore;
const prefix = "ai-jobs-integration";
async function claim(id: string) {
  const job = await store.claim(id);
  if (!job?.leaseToken) throw new Error(`AI job ${id} was not claimable`);
  return { ...job, leaseToken: job.leaseToken };
}
beforeAll(async () => {
  postgres = await createPostgresTestContext();
  await postgres.pool.query("CREATE TABLE job_effects (job_id text PRIMARY KEY)");
  broker = await new GenericContainer("rabbitmq:3.13-management-alpine")
    .withEnvironment({ RABBITMQ_DEFAULT_USER: "test", RABBITMQ_DEFAULT_PASS: "test" })
    .withExposedPorts(5672).withWaitStrategy(Wait.forLogMessage("Server startup complete")).start();
  const url = `amqp://test:test@${broker.getHost()}:${broker.getMappedPort(5672)}`;
  const database = new PostgresDatabase(postgres.pool);
  store = new PostgresAiJobStore(database, 3000, 3);
  service = new AiJobsService(store, getAiJobsEnv({
    RABBITMQ_URL: url, AI_JOBS_QUEUE_PREFIX: prefix, AI_JOBS_LEASE_MS: "3000", AI_JOBS_MAX_ATTEMPTS: "3",
  }));
  connection = await amqp.connect(url);
}, 120000);
afterAll(async () => {
  await service?.onApplicationShutdown();
  await connection?.close().catch(() => {});
  await broker?.stop();
  await postgres?.stop();
}, 30000);

test("durable outbox publishes pre-start submissions and completed broker redelivery cannot duplicate domain commit", async () => {
  const id = await service.enqueue({ kind: "meal-note", userId: "u", actorId: "a", payload: { value: 1 }, dedupeKey: "one" });
  expect(await service.enqueue({ kind: "meal-note", userId: "u", actorId: "a", payload: {}, dedupeKey: "one" })).toBe(id);
  expect((await postgres.pool.query("SELECT job_id FROM ai_job_outbox WHERE job_id=$1", [id])).rows).toHaveLength(1);
  let calls = 0;
  service.register("meal-note", async (_, context) => {
    calls++;
    setAiJobResult({ ok: true });
    await store.database.db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO job_effects VALUES (${context.jobId})`);
      await completeCurrentAiJob(tx);
    });
    return { ok: true };
  });
  service.onModuleInit();
  const timeout = AbortSignal.timeout(15000);
  expect(await service.wait(id, "u", undefined, timeout)).toEqual({ ok: true });
  const channel = await connection.createConfirmChannel();
  await new Promise<void>((resolve, reject) => {
    channel.sendToQueue(`${prefix}.meal-note`, Buffer.from(id), { persistent: true }, (error) => error ? reject(error) : resolve());
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(calls).toBe(1);
  expect((await postgres.pool.query("SELECT * FROM job_effects")).rows).toHaveLength(1);
  await channel.close();
}, 30000);

test("expired worker recovers; stale and cancelled transactions roll back domain effects", async () => {
  const id = await service.enqueue({ kind: "agent-turn", userId: "lease-user", actorId: "a", payload: {} });
  const dead = await claim(id);
  await postgres.pool.query("UPDATE ai_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
  await store.recover();
  await postgres.pool.query("UPDATE ai_jobs SET available_at=now() WHERE id=$1", [id]);
  const live = await claim(id);
  expect(live.leaseToken).not.toBe(dead.leaseToken);
  async function commit(token: string) {
    return aiJobContext.run({ id, token }, async () => {
      setAiJobResult({ ok: true });
      await store.database.db.transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO job_effects VALUES (${id})`);
        await completeCurrentAiJob(tx);
      });
    });
  }
  await expect(commit(dead.leaseToken)).rejects.toThrow("lease lost");
  await service.cancel(id, "lease-user");
  await expect(commit(live.leaseToken)).rejects.toThrow("lease lost");
  expect((await postgres.pool.query("SELECT * FROM job_effects WHERE job_id=$1", [id])).rows).toHaveLength(0);
});

test("agent turns serialize per user across store instances", async () => {
  const input = { kind: "agent-turn" as const, userId: "serial-user", actorId: "a", payload: {} };
  const a = await store.enqueue(input);
  const b = await store.enqueue(input);
  const otherStore = new PostgresAiJobStore(store.database, 3000, 3);
  const claimed = await Promise.all([store.claim(a), otherStore.claim(b)]);
  expect(claimed.filter(Boolean)).toHaveLength(1);
  await service.cancel(a, input.userId);
  await service.cancel(b, input.userId);
});

test("submissions survive broker outage and publish after reconnect", async () => {
  await broker.exec(["rabbitmqctl", "stop_app"]);
  const id = await service.enqueue({ kind: "meal-note", userId: "outage-user", actorId: "a", payload: {} });
  expect((await service.get(id, "outage-user")).status).toBe("queued");
  await broker.exec(["rabbitmqctl", "start_app"]);
  expect(await service.wait(id, "outage-user", undefined, AbortSignal.timeout(30000))).toEqual({ ok: true });
}, 45000);

test("delayed earlier turn fences later queued turns until it completes", async () => {
  const input = { kind: "agent-turn" as const, userId: "fifo-user", actorId: "a", payload: {} };
  const a = await store.enqueue(input);
  const b = await store.enqueue(input);
  await postgres.pool.query("UPDATE ai_jobs SET available_at=now()+interval '1 hour' WHERE id=$1", [a]);
  expect(await store.claim(b)).toBeUndefined();
  await service.cancel(a, input.userId);
  expect(await store.claim(b)).toBeDefined();
  await service.cancel(b, input.userId);
});

test("retry and busy delivery deadlines replace the stale publication deadline", async () => {
  // Inspect store deadlines without the background publisher changing them.
  await service.onApplicationShutdown();
  const id = await store.enqueue({ kind: "agent-turn", userId: "retry-user", actorId: "a", payload: {} });
  const claimed = await claim(id);
  await postgres.pool.query("UPDATE ai_job_outbox SET available_at=now()+interval '30 seconds' WHERE job_id=$1", [id]);
  await store.fail(claimed, "unavailable", true);
  const retry = await postgres.pool.query<{ difference: number }>(`
    SELECT extract(epoch from (o.available_at-j.available_at))::float AS difference
    FROM ai_job_outbox o JOIN ai_jobs j ON j.id=o.job_id WHERE j.id=$1`, [id]);
  expect(retry.rows[0].difference).toBe(0);
  await postgres.pool.query("UPDATE ai_jobs SET available_at=now() WHERE id=$1", [id]);
  await store.defer(id);
  await store.published(id);
  const deferred = await postgres.pool.query<{ seconds: number }>(`
    SELECT extract(epoch from (available_at-now()))::float AS seconds FROM ai_job_outbox WHERE job_id=$1`, [id]);
  expect(deferred.rows[0].seconds).toBeGreaterThan(0);
  expect(deferred.rows[0].seconds).toBeLessThan(2);
  await service.cancel(id, "retry-user");
});
