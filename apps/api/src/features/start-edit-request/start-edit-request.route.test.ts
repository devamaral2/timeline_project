import { afterEach, expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { startEditRequestRoute } from "./start-edit-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const body = { userId: "owner-1", text: "mude para 19h", entityType: "task", entityId: "01H0TASK" };

function setup() {
  const startEdit = vi.fn(async () => "request-1");
  const app = createFastifyInstance();
  registerApiRoutes(app, [startEditRequestRoute({ startEdit } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, startEdit };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], payload: unknown) {
  const response = await app.inject({ method: "POST", url: "/api/requests/edit", headers: session, payload: payload as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

afterEach(() => vi.unstubAllEnvs());

test.each(["task", "artifact", "food_artifact", "sleep_artifact", "training_artifact", "skill_artifact", "agent_artifact"])(
  "POST /api/requests/edit aceita o alvo %s e responde 202 com o requestId",
  async (entityType) => {
    const { app, startEdit } = setup();

    const response = await post(app, { ...body, entityType });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ requestId: "request-1" });
    expect(startEdit).toHaveBeenCalledWith({ ...body, entityType }, { userId: "owner-1" });
    await app.close();
  },
);

test("aceita o modelo que o campo mostra, quando o provedor esta ligado e o modelo e da lista dele", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const { app, startEdit } = setup();
  const model = { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" };

  expect((await post(app, { ...body, model })).status).toBe(202);
  expect(startEdit).toHaveBeenCalledWith({ ...body, model }, { userId: "owner-1" });
  await app.close();
});

test.each([
  ["de um provedor sem chave", { provider: "openai", model: "gpt-6.2-sol", effort: "low" }, { ANTHROPIC_API_KEY: "sk-test", OPENAI_API_KEY: "" }],
  ["fora da lista do provedor", { provider: "anthropic", model: "claude-3", effort: "low" }, { ANTHROPIC_API_KEY: "sk-test" }],
  ["com esforco desconhecido", { provider: "anthropic", model: "claude-haiku-5-5", effort: "extremo" }, { ANTHROPIC_API_KEY: "sk-test" }],
])("recusa o modelo %s com 400", async (_label, model, env) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { app, startEdit } = setup();

  expect((await post(app, { ...body, model })).status).toBe(400);
  expect(startEdit).not.toHaveBeenCalled();
  await app.close();
});

test.each([
  ["texto vazio", { ...body, text: "   " }],
  ["tipo desconhecido", { ...body, entityType: "recurrence" }],
  ["id com caracteres invalidos", { ...body, entityId: "../x" }],
  ["sem tipo", { userId: "owner-1", text: "x", entityId: "a" }],
])("recusa %s com 400", async (_label, payload) => {
  const { app, startEdit } = setup();

  expect((await post(app, payload)).status).toBe(400);
  expect(startEdit).not.toHaveBeenCalled();
  await app.close();
});
