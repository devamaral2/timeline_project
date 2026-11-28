import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSqliteTestContext, type SqliteTestContext } from "../infrastructure/persistence/testing/sqlite-test-context";
import { createApiTestApp, type ApiTestApp } from "../testing/create-api-test-app";

/**
 * As operacoes dos pedidos no Fastify em coexistencia, com o comportamento que
 * os clientes ja conhecem: 202 para abrir, 200 para acompanhar e cancelar, 404
 * para o que nao existe neste ambiente e 400 para corpo invalido. O worker fica
 * parado (`AI_JOBS_POLL_MS` longo) para observar o pedido ainda na fila.
 */

const GATEWAY_KEY = "requests-gateway-key-with-32-chars";
const ORIGIN = "https://app.example.com";
let ctx: SqliteTestContext;
let app: ApiTestApp;

const session = (userId: string): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-session-id": `session-${userId}`,
});

const newUser = () => `requests-user-${randomUUID()}`;

interface Response {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

async function call(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown; raw?: string } = {},
): Promise<Response> {
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

beforeAll(async () => {
  ctx = await createSqliteTestContext();
  app = await createApiTestApp({
    API_DATABASE_PATH: ctx.path,
    AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
    API_HOST: "0.0.0.0",
    AI_AUTOMATION: "off",
    AI_JOBS_POLL_MS: "60000",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    OPENROUTER_API_KEY: "",
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

describe("pedidos pelo Fastify", () => {
  test("o pedido em texto responde 202 e aparece na listagem e no detalhe do usuario", async () => {
    const user = newUser();
    const headers = session(user);

    const started = await call("POST", "/api/requests", {
      headers,
      body: { userId: user, text: "o que tenho amanhã?", context: { screen: "agenda" } },
    });
    expect(started.status).toBe(202);
    const requestId = (started.json as { requestId: string }).requestId;
    expect(requestId).toEqual(expect.any(String));

    const list = await call("GET", "/api/requests", { headers });
    expect(list.status).toBe(200);
    expect(list.json).toEqual([expect.objectContaining({ id: requestId, route: "steps" })]);

    const detail = await call("GET", `/api/requests/${requestId}`, { headers });
    expect(detail.status).toBe(200);
    expect(detail.json).toMatchObject({ id: requestId, route: "steps", status: "preparing" });

    // Pedido de outra pessoa recebe o mesmo 404 de um id que nao existe.
    const other = await call("GET", `/api/requests/${requestId}`, { headers: session(newUser()) });
    expect(other.status).toBe(404);
    expect(other.json).toEqual({ error: "Request not found" });
  });

  test("a edicao e a voz tambem respondem 202, e o limite invalido e 400", async () => {
    const user = newUser();
    const headers = session(user);

    const edit = await call("POST", "/api/requests/edit", {
      headers,
      body: { userId: user, text: "mude para 19h", entityType: "task", entityId: "01H0TASK" },
    });
    expect(edit.status).toBe(202);
    expect(edit.json).toEqual({ requestId: expect.any(String) });

    const voice = await call("POST", "/api/requests/voice", {
      headers,
      body: { transcript: "comecei a estudar", clientMessageId: "v1" },
    });
    expect(voice.status).toBe(202);
    expect(voice.json).toEqual({ requestId: expect.any(String) });

    expect((await call("GET", "/api/requests?limit=0", { headers })).status).toBe(400);
    expect((await call("POST", "/api/requests", { headers, body: { userId: user, text: "   " } })).status).toBe(400);
    expect((await call("POST", "/api/requests", { headers, body: { userId: newUser(), text: "oi" } })).status).toBe(403);
  });

  test("cancelar um pedido ainda na fila responde 200 com o pedido interrompido", async () => {
    const user = newUser();
    const headers = session(user);
    const started = await call("POST", "/api/requests", { headers, body: { userId: user, text: "almocei arroz" } });
    const requestId = (started.json as { requestId: string }).requestId;

    const cancelled = await call("POST", `/api/requests/${requestId}/cancel`, { headers });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json).toMatchObject({ id: requestId, status: "cancelled" });

    const missing = await call("POST", "/api/requests/01ARZ3NDEKTSV4RRFFQ69G5FAV/cancel", { headers });
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: "Request not found" });
  });

  test("o Hermes e o modo modelo sao 404 neste ambiente, antes de ler o corpo", async () => {
    const user = newUser();
    const headers = { ...session(user), origin: ORIGIN };

    const hermes = await call("POST", "/api/requests/hermes", { headers, body: { garbage: true } });
    expect(hermes.status).toBe(404);
    expect(hermes.json).toEqual({ error: "Not Found" });
    expect(hermes.headers.get("access-control-allow-origin")).toBe("*");

    const model = await call("POST", "/api/requests/model", { headers, body: { garbage: true } });
    expect(model.status).toBe(404);
    expect(model.json).toEqual({ error: "Not Found" });

    const options = await call("GET", "/api/requests/model/options", { headers });
    expect(options.status).toBe(404);
    expect(options.json).toEqual({ error: "Not Found" });
  });

  test("sem a identidade do gateway as operacoes continuam 401 com o mesmo corpo", async () => {
    for (const [method, path] of [
      ["POST", "/api/requests"],
      ["POST", "/api/requests/edit"],
      ["POST", "/api/requests/hermes"],
      ["POST", "/api/requests/model"],
      ["GET", "/api/requests/model/options"],
      ["POST", "/api/requests/voice"],
      ["GET", "/api/requests"],
      ["GET", "/api/requests/01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      ["POST", "/api/requests/01ARZ3NDEKTSV4RRFFQ69G5FAV/cancel"],
    ] as const) {
      const response = await call(method, path);
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.json, `${method} ${path}`).toEqual({ error: "Unauthorized" });
    }
  });
});
