import { afterEach, expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { startRequestRoute } from "./start-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const body = { userId: "owner-1", text: "o que tenho amanhã?", context: { screen: "agenda" } };

function setup() {
  const start = vi.fn(async () => "request-1");
  const app = createFastifyInstance();
  registerApiRoutes(app, [startRequestRoute({ start } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, start };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], payload: unknown) {
  const response = await app.inject({ method: "POST", url: "/api/requests", headers: session, payload: payload as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

afterEach(() => vi.unstubAllEnvs());

test("POST /api/requests responde 202 com o requestId e sem modelo nao confere chave de provedor", async () => {
  const { app, start } = setup();

  const response = await post(app, body);

  expect(response.status).toBe(202);
  expect(response.body).toEqual({ requestId: "request-1" });
  expect(start).toHaveBeenCalledWith(body, { userId: "owner-1" });
  await app.close();
});

test("aceita o modelo que o campo do chat mostra e o projectId opcional", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const { app, start } = setup();
  const model = { provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" };
  const projectId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

  expect((await post(app, { ...body, model, projectId })).status).toBe(202);
  expect(start).toHaveBeenCalledWith({ ...body, model, projectId }, { userId: "owner-1" });
  await app.close();
});

test("sem a identidade do gateway e 401 antes de qualquer validacao", async () => {
  const { app, start } = setup();
  const response = await app.inject({ method: "POST", url: "/api/requests", payload: { garbage: true } });

  expect(response.statusCode).toBe(401);
  expect(start).not.toHaveBeenCalled();
  await app.close();
});

test.each([
  ["de um provedor sem chave", { provider: "openai", model: "gpt-6.2-sol", effort: "low" }, { ANTHROPIC_API_KEY: "sk-test", OPENAI_API_KEY: "" }],
  ["fora da lista do provedor", { provider: "anthropic", model: "claude-3", effort: "low" }, { ANTHROPIC_API_KEY: "sk-test" }],
  ["sem esforco", { provider: "anthropic", model: "claude-haiku-5-5" }, { ANTHROPIC_API_KEY: "sk-test" }],
])("recusa o modelo %s com 400", async (_label, model, env) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { app, start } = setup();

  expect((await post(app, { ...body, model })).status).toBe(400);
  expect(start).not.toHaveBeenCalled();
  await app.close();
});

test.each([
  ["texto vazio", { ...body, text: "   " }],
  ["projectId que nao e ulid", { ...body, projectId: "braid" }],
  ["sem texto", { userId: "owner-1" }],
])("recusa %s com 400", async (_label, payload) => {
  const { app, start } = setup();

  expect((await post(app, payload)).status).toBe(400);
  expect(start).not.toHaveBeenCalled();
  await app.close();
});
