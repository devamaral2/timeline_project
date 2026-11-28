import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { idempotencyRequestHash } from "../http/idempotency/idempotency-key";
import { createPostgresTestContext, type PostgresTestContext } from "../infrastructure/persistence/testing/postgres-test-context";
import { createApiTestApp, type ApiTestApp } from "../testing/create-api-test-app";

/**
 * A costura da coexistencia: as operacoes de tarefas, projetos e situacoes sao
 * servidas pelo Fastify dentro do mesmo processo/porta que ainda hospeda as
 * rotas Nest. O comportamento externo e o mesmo da linha de base.
 */

const GATEWAY_KEY = "coexistence-gateway-key-with-32-chars";
const ORIGIN = "https://app.example.com";

let ctx: PostgresTestContext;
let app: ApiTestApp;

const session = (userId: string): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-session-id": `session-${userId}`,
});

interface Response {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

async function call(method: string, path: string, options: { headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  if (body !== undefined) headers["content-type"] ??= "application/json";
  const response = await fetch(`${app.url}${path}`, { method, headers, body });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, text, json };
}

const newUser = () => `coexistence-user-${randomUUID()}`;

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  app = await createApiTestApp({
    DATABASE_URL: ctx.connectionString,
    AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
    // Fora do loopback o CORS liga, como no main.ts.
    API_HOST: "0.0.0.0",
    AI_AUTOMATION: "off",
    AI_JOBS_POLL_MS: "60000",
    OPENROUTER_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

describe("coexistencia", () => {
  test("as operacoes migradas respondem pelo Fastify e as restantes continuam no Nest", async () => {
    const user = newUser();

    const agenda = await call("GET", "/api/tasks", { headers: session(user) });
    expect(agenda.status).toBe(200);
    expect(agenda.json).toEqual({ items: [] });

    const tracked = await call("GET", "/api/tasks/tracked?actor=human", { headers: session(user) });
    expect(tracked.status).toBe(200);
    expect(tracked.json).toEqual([]);

    const project = await call("POST", "/api/projects", { headers: session(user), body: { name: "casa" } });
    expect(project.status).toBe(201);

    const projects = await call("GET", "/api/projects", { headers: session(user) });
    expect(projects.status).toBe(200);
    expect(projects.json).toEqual([
      { id: expect.any(String), name: "diario", personal: true },
      project.json,
    ]);

    // Ainda no Nest: tags e um metodo que nenhuma rota migrada declarou.
    const tags = await call("GET", "/api/tags?query=cas", { headers: session(user) });
    expect(tags.status).toBe(200);

    const unknownMethod = await call("PUT", "/api/tasks", { headers: session(user), body: {} });
    expect(unknownMethod.status).toBe(404);
    expect(unknownMethod.json).toEqual({ error: "Cannot PUT /api/tasks" });
  });

  test("o trailing slash e o CORS seguem a linha de base nas duas bordas", async () => {
    const user = newUser();

    const slash = await call("GET", "/api/tasks/", { headers: session(user) });
    expect(slash.status).toBe(200);
    expect(slash.json).toEqual({ items: [] });

    const preflight = await call("OPTIONS", "/api/tasks", {
      headers: { origin: ORIGIN, "access-control-request-method": "GET" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    const migrated = await call("GET", "/api/tasks", { headers: { ...session(user), origin: ORIGIN } });
    expect(migrated.headers.get("access-control-allow-origin")).toBe("*");

    const nest = await call("GET", "/api/tags?query=cas", { headers: { ...session(user), origin: ORIGIN } });
    expect(nest.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("idempotencia da criacao de tarefa", () => {
  const body = { name: "idempotente" };

  test("claim, replay, divergencia e concorrencia", async () => {
    const user = newUser();
    const key = `key-${randomUUID()}`;
    const headers = { ...session(user), "idempotency-key": key };

    const first = await call("POST", "/api/tasks", { headers, body });
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    const taskId = (first.json as { taskId: string }).taskId;

    const replay = await call("POST", "/api/tasks", { headers, body });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(replay.json).toEqual({ taskId });

    const mismatch = await call("POST", "/api/tasks", { headers, body: { name: "outra" } });
    expect(mismatch.status).toBe(422);
    expect(mismatch.json).toEqual({ error: "Idempotency-Key was already used with a different request" });

    const inProgressKey = `key-${randomUUID()}`;
    const inProgressBody = { name: "em andamento" };
    await ctx.pool.query(
      "INSERT INTO idempotency_keys (user_id, scope, key, request_hash) VALUES ($1, $2, $3, $4)",
      [user, "/api/tasks", inProgressKey, idempotencyRequestHash(inProgressBody)],
    );
    const inProgress = await call("POST", "/api/tasks", {
      headers: { ...session(user), "idempotency-key": inProgressKey },
      body: inProgressBody,
    });
    expect(inProgress.status).toBe(409);
    expect(inProgress.json).toEqual({ error: "A request with this Idempotency-Key is in progress" });
  });

  test("quando a criacao falha a chave e liberada e pode ser usada de novo", async () => {
    const user = newUser();
    const key = `key-${randomUUID()}`;
    const headers = { ...session(user), "idempotency-key": key };

    const failed = await call("POST", "/api/tasks", {
      headers,
      body: { name: "sem projeto", projectId: "missing-project" },
    });
    expect(failed.status).toBe(404);

    const retried = await call("POST", "/api/tasks", { headers, body: { name: "com projeto" } });
    expect(retried.status).toBe(201);
    expect(retried.json).toEqual({ taskId: expect.any(String) });
  });
});
