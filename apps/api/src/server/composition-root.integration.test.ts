import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { REQUEST_JOBS } from "../api-core/requests/request-steps";
import { TRANSCRIPTION_FORMAT_JOB } from "../api-core/transcription/transcription-requests";
import { FOOD_GENERATION_JOB } from "../infrastructure/persistence/artifacts/repositories/food-generation";
import { JobsService } from "../infrastructure/jobs/jobs.service";
import { createPostgresTestContext, type PostgresTestContext } from "../infrastructure/persistence/testing/postgres-test-context";
import { createApiRuntime, type ApiRuntime } from "./composition-root";
import { declaredOperationKey } from "./declared-operations";

/**
 * O runtime como o `main.ts` o monta: um worker unico, um registro por handler,
 * handlers antes do polling e shutdown explicito. A fila e o Postgres de
 * verdade; o job escolhido (`video-transcription-format`) e o unico que nao
 * chama provedor quando o pedido nao existe.
 */

const GATEWAY_KEY = "worker-gateway-key-with-32-characters!!";
const ALL_HANDLERS = [
  TRANSCRIPTION_FORMAT_JOB,
  FOOD_GENERATION_JOB,
  ...Object.values(REQUEST_JOBS),
];
let ctx: PostgresTestContext;
let previousEnv: Record<string, string | undefined> = {};

const statusOf = async (jobId: string): Promise<string | undefined> =>
  (await ctx.pool.query<{ status: string }>("SELECT status FROM jobs WHERE id = $1", [jobId])).rows[0]?.status;

async function waitForStatus(jobId: string, status: string, timeoutMs = 10_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await statusOf(jobId)) === status) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`O job ${jobId} nao chegou a ${status}; esta em ${await statusOf(jobId)}`);
}

function newRuntime(): Promise<ApiRuntime> {
  return createApiRuntime({
    databaseUrl: ctx.connectionString,
    authInternalServiceKey: GATEWAY_KEY,
    logger: { warn() {}, error() {} },
  });
}

const enqueueFormat = (runtime: ApiRuntime): Promise<string> =>
  runtime.jobs.enqueue({
    kind: TRANSCRIPTION_FORMAT_JOB,
    userId: `worker-user-${randomUUID()}`,
    actorId: `worker-user-${randomUUID()}`,
    payload: { requestId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  });

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  const env = {
    DATABASE_URL: ctx.connectionString,
    AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
    AI_JOBS_POLL_MS: "50",
    AI_JOBS_LEASE_MS: "3000",
    AI_JOBS_CONCURRENCY: "2",
  };
  previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
}, 120_000);

afterAll(async () => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await ctx?.stop();
});

describe("composition root", () => {
  test("monta o worker unico, registra cada handler antes do polling e serve as operacoes dos pedidos", async () => {
    const runtime = await newRuntime();
    try {
      expect(runtime.jobs).toBeInstanceOf(JobsService);

      const keys = runtime.routes.map(declaredOperationKey);
      for (const key of [
        "POST /api/requests",
        "POST /api/requests/edit",
        "POST /api/requests/hermes",
        "POST /api/requests/model",
        "GET /api/requests/model/options",
        "POST /api/requests/voice",
        "GET /api/requests",
        "GET /api/requests/{requestId}",
        "POST /api/requests/{requestId}/cancel",
        "POST /api/tasks",
        "GET /api/projects",
      ]) {
        expect(keys, key).toContain(key);
      }
      // As estaticas vem antes das parametrizadas.
      expect(keys.indexOf("GET /api/requests/model/options")).toBeLessThan(keys.indexOf("GET /api/requests/{requestId}"));

      // Nada e reclamado antes do startup: o polling so comeca em `start`.
      const beforeStart = await enqueueFormat(runtime);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await statusOf(beforeStart)).toBe("queued");

      await runtime.start();

      for (const kind of ALL_HANDLERS) {
        expect(() => runtime.jobs.register(kind, async () => {}), kind).toThrow(/already registered/);
      }

      // Depois do startup, o handler registrado antes do polling executa o job.
      await waitForStatus(beforeStart, "succeeded");
    } finally {
      await runtime.close();
    }
  });

  test("o shutdown para o polling e e idempotente", async () => {
    const runtime = await newRuntime();
    const queued = await enqueueFormat(runtime);

    await runtime.close();
    // Mesmo chamando um tick explicito, o worker encerrado nao reclama nada.
    await runtime.jobs.tick();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await statusOf(queued)).toBe("queued");
    await runtime.close();
  });
});
