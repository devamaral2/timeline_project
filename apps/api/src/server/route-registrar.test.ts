import { describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { TaskNotFoundError, TaskValidationError } from "../domain";
import type { IdempotencyStore } from "../domain/ports";
import type { ApiRoute } from "../http/api-route";
import { InMemoryIdempotencyStore } from "../http/idempotency/testing/in-memory-idempotency-store";
import { idempotencyRequestHash } from "../http/idempotency/idempotency-key";
import { createFastifyInstance, registerApiRoutes } from "./route-registrar";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "user-1" };

const silentLogger = { warn() {}, error() {} };

function appWith(routes: readonly ApiRoute[], options: { store?: IdempotencyStore; bodyLimit?: number } = {}) {
  const app = createFastifyInstance({ bodyLimit: options.bodyLimit });
  registerApiRoutes(app, routes, {
    authInternalServiceKey: KEY,
    idempotencyStore: options.store ?? new InMemoryIdempotencyStore(),
    logger: silentLogger,
  });
  return app;
}

function route(overrides: Partial<ApiRoute> & Pick<ApiRoute, "method" | "path" | "handler">): ApiRoute {
  return { status: 200, authentication: "gateway-session", ...overrides };
}

async function json(response: Awaited<ReturnType<FastifyInstance["inject"]>>): Promise<unknown> {
  return response.body ? JSON.parse(response.body) : undefined;
}

describe("registrador declarativo", () => {
  test("declara metodo, caminho, status e handler, e entrega parametros, query, corpo e identidade", async () => {
    const app = appWith([
      route({
        method: "PATCH",
        path: "/api/things/:id",
        status: 200,
        handler: ({ params, query, body, actor }) => ({ params, query, body, actor }),
      }),
    ]);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/things/thing-1?verbose=true",
      headers: session,
      payload: { name: "novo" },
    });

    expect(response.statusCode).toBe(200);
    expect(await json(response)).toEqual({
      params: { id: "thing-1" },
      query: { verbose: "true" },
      body: { name: "novo" },
      actor: { userId: "user-1" },
    });
    await app.close();
  });

  test("a rota estatica vence a parametrizada, e o trailing slash encontra a mesma rota", async () => {
    const app = appWith([
      route({ method: "GET", path: "/api/tasks/:taskId", handler: ({ params }) => ({ kind: "task", params }) }),
      route({ method: "GET", path: "/api/tasks/tracked", handler: () => ({ kind: "tracked" }) }),
    ]);

    expect(await json(await app.inject({ method: "GET", url: "/api/tasks/tracked", headers: session }))).toEqual({
      kind: "tracked",
    });
    expect(await json(await app.inject({ method: "GET", url: "/api/tasks/tracked/", headers: session }))).toEqual({
      kind: "tracked",
    });
    expect(await json(await app.inject({ method: "GET", url: "/api/tasks/abc/", headers: session }))).toEqual({
      kind: "task",
      params: { taskId: "abc" },
    });
    await app.close();
  });

  test("204 responde sem corpo nem content-type", async () => {
    const app = appWith([route({ method: "DELETE", path: "/api/things/:id", status: 204, handler: () => undefined })]);

    const response = await app.inject({ method: "DELETE", url: "/api/things/1", headers: session });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(response.headers["content-type"]).toBeUndefined();
    await app.close();
  });
});

describe("identidade", () => {
  const secure = [route({ method: "GET", path: "/api/secure", handler: () => ({ ok: true }) })];

  test("sem a chave do gateway, sem usuario ou com a chave errada responde como a linha de base", async () => {
    const app = appWith(secure);

    const missing = await app.inject({ method: "GET", url: "/api/secure" });
    expect(missing.statusCode).toBe(401);
    expect(await json(missing)).toEqual({ error: "Unauthorized" });

    const noUser = await app.inject({ method: "GET", url: "/api/secure", headers: { "x-auth-gateway-key": KEY } });
    expect(noUser.statusCode).toBe(401);

    const wrong = await app.inject({
      method: "GET",
      url: "/api/secure",
      headers: { ...session, "x-auth-gateway-key": "x".repeat(KEY.length) },
    });
    expect(wrong.statusCode).toBe(403);
    expect(await json(wrong)).toEqual({ error: "Forbidden" });

    await app.close();
  });

  test("a chave de dispositivo nao serve numa rota de sessao, e a rota do servico local exige a permissao dele", async () => {
    const app = appWith([
      ...secure,
      route({
        method: "POST",
        path: "/api/worker/next",
        authentication: "transcription-device-key",
        handler: ({ actor }) => ({ actor }),
      }),
    ]);

    const deviceOnSession = await app.inject({
      method: "GET",
      url: "/api/secure",
      headers: { ...session, "x-auth-permissions": "transcription:work" },
    });
    expect(deviceOnSession.statusCode).toBe(403);

    const sessionOnWorker = await app.inject({ method: "POST", url: "/api/worker/next", headers: session });
    expect(sessionOnWorker.statusCode).toBe(403);

    const worker = await app.inject({
      method: "POST",
      url: "/api/worker/next",
      headers: { ...session, "x-auth-device-key-id": "device-1", "x-auth-permissions": "transcription:work" },
    });
    expect(worker.statusCode).toBe(200);
    expect(await json(worker)).toEqual({ actor: { userId: "user-1", permissions: ["transcription:work"] } });

    await app.close();
  });
});

describe("erros e compatibilidade HTTP", () => {
  test("o dominio vira o status e o corpo `{ error }`, e o inesperado e 500", async () => {
    const app = appWith([
      route({
        method: "GET",
        path: "/api/missing",
        handler: () => {
          throw new TaskNotFoundError("Task not found: missing");
        },
      }),
      route({
        method: "GET",
        path: "/api/invalid",
        handler: () => {
          throw new TaskValidationError("Task requires a name");
        },
      }),
      route({
        method: "GET",
        path: "/api/boom",
        handler: () => {
          throw new Error("boom");
        },
      }),
    ]);

    const missing = await app.inject({ method: "GET", url: "/api/missing", headers: session });
    expect(missing.statusCode).toBe(404);
    expect(await json(missing)).toEqual({ error: "Task not found: missing" });

    const invalid = await app.inject({ method: "GET", url: "/api/invalid", headers: session });
    expect(invalid.statusCode).toBe(400);
    expect(await json(invalid)).toEqual({ error: "Task requires a name" });

    const boom = await app.inject({ method: "GET", url: "/api/boom", headers: session });
    expect(boom.statusCode).toBe(500);
    expect(await json(boom)).toEqual({ error: "boom" });

    await app.close();
  });

  test("JSON malformado preserva a mensagem, corpo vazio de JSON vira objeto e content-type estranho deixa o corpo ausente", async () => {
    const app = appWith([route({ method: "POST", path: "/api/echo", handler: ({ body }) => ({ body }) })]);

    const malformed = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { ...session, "content-type": "application/json" },
      payload: "{oops",
    });
    expect(malformed.statusCode).toBe(400);
    expect(await json(malformed)).toEqual({
      error: "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    });

    const empty = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { ...session, "content-type": "application/json" },
      payload: "",
    });
    expect(empty.statusCode).toBe(200);
    expect(await json(empty)).toEqual({ body: {} });

    const text = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { ...session, "content-type": "text/plain" },
      payload: '{"name":"tarefa"}',
    });
    expect(text.statusCode).toBe(200);
    expect(await json(text)).toEqual({});

    await app.close();
  });

  test("query repetida chega como lista e o corpo acima do teto preserva o 500 da linha de base", async () => {
    const app = appWith(
      [route({ method: "POST", path: "/api/echo", handler: ({ query, body }) => ({ query, body }) })],
      { bodyLimit: 64 },
    );

    const repeated = await app.inject({
      method: "POST",
      url: "/api/echo?from=2026-01-01T00:00:00Z&from=2026-01-02T00:00:00Z",
      headers: session,
      payload: {},
    });
    expect(await json(repeated)).toMatchObject({ query: { from: ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"] } });

    const tooLarge = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { ...session, "content-type": "application/json" },
      payload: JSON.stringify({ body: "a".repeat(256) }),
    });
    expect(tooLarge.statusCode).toBe(500);
    expect(await json(tooLarge)).toEqual({ error: "request entity too large" });

    await app.close();
  });
});

describe("idempotencia declarada", () => {
  function setup() {
    const store = new InMemoryIdempotencyStore();
    let calls = 0;
    const app = appWith(
      [
        route({
          method: "POST",
          path: "/api/things",
          status: 201,
          idempotent: true,
          handler: async () => ({ id: `thing-${++calls}` }),
        }),
      ],
      { store },
    );
    return { app, store, calls: () => calls };
  }

  test("a primeira execucao cria, o replay devolve a mesma resposta com Idempotent-Replayed e não executa de novo", async () => {
    const { app, calls } = setup();
    const headers = { ...session, "idempotency-key": "criar-thing" };

    const first = await app.inject({ method: "POST", url: "/api/things", headers, payload: { name: "x" } });
    expect(first.statusCode).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(await json(first)).toEqual({ id: "thing-1" });

    const replay = await app.inject({ method: "POST", url: "/api/things", headers, payload: { name: "x" } });
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(await json(replay)).toEqual({ id: "thing-1" });
    expect(calls()).toBe(1);

    await app.close();
  });

  test("mesma chave com outro corpo e 422, chave invalida e 400 e execucao em andamento e 409", async () => {
    const { app, store } = setup();
    const headers = { ...session, "idempotency-key": "criar-thing" };
    await app.inject({ method: "POST", url: "/api/things", headers, payload: { name: "x" } });

    const mismatch = await app.inject({ method: "POST", url: "/api/things", headers, payload: { name: "y" } });
    expect(mismatch.statusCode).toBe(422);
    expect(await json(mismatch)).toEqual({ error: "Idempotency-Key was already used with a different request" });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/things",
      headers: { ...session, "idempotency-key": "chave com espaço" },
      payload: { name: "x" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(await json(invalid)).toEqual({ error: "Invalid Idempotency-Key" });

    const scope = "/api/things";
    const key = "em-andamento";
    const body = { name: "x" };
    await store.claim({
      userId: "user-1",
      scope,
      key,
      requestHash: idempotencyRequestHash(body),
    });
    const inProgress = await app.inject({
      method: "POST",
      url: "/api/things",
      headers: { ...session, "idempotency-key": key },
      payload: body,
    });
    expect(inProgress.statusCode).toBe(409);
    expect(await json(inProgress)).toEqual({ error: "A request with this Idempotency-Key is in progress" });

    await app.close();
  });

  test("quando o handler falha a chave e liberada e pode ser usada de novo", async () => {
    const store = new InMemoryIdempotencyStore();
    let calls = 0;
    const app = appWith(
      [
        route({
          method: "POST",
          path: "/api/things",
          status: 201,
          idempotent: true,
          handler: () => {
            calls += 1;
            if (calls === 1) throw new TaskNotFoundError("Project not found");
            return { id: "thing-1" };
          },
        }),
      ],
      { store },
    );
    const headers = { ...session, "idempotency-key": "tentar-de-novo" };

    const failed = await app.inject({ method: "POST", url: "/api/things", headers, payload: { name: "x" } });
    expect(failed.statusCode).toBe(404);

    const retried = await app.inject({ method: "POST", url: "/api/things", headers, payload: { name: "x" } });
    expect(retried.statusCode).toBe(201);
    expect(await json(retried)).toEqual({ id: "thing-1" });
    expect(calls).toBe(2);

    await app.close();
  });
});
