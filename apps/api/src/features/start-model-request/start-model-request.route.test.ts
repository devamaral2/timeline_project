import { afterEach, expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { startModelRequestRoute } from "./start-model-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const accepted = { id: "request-1", route: "model", status: "queued" };
const body = { userId: "owner-1", text: "oi", clientMessageId: "m1", model: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" } };

function setup() {
  const startModel = vi.fn(async () => accepted);
  const app = createFastifyInstance();
  registerApiRoutes(app, [startModelRequestRoute({ startModel } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, startModel };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], payload: unknown) {
  const response = await app.inject({ method: "POST", url: "/api/requests/model", headers: session, payload: payload as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

afterEach(() => vi.unstubAllEnvs());

test("POST /api/requests/model e 404 sem nenhuma chave de provedor, antes mesmo de ler o corpo", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const { app, startModel } = setup();

  const response = await post(app, { garbage: true });

  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: "Not Found" });
  expect(startModel).not.toHaveBeenCalled();
  await app.close();
});

test("aceita a mensagem com o modelo escolhido e responde 202", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const { app, startModel } = setup();

  const response = await post(app, body);

  expect(response.status).toBe(202);
  expect(response.body).toEqual(accepted);
  expect(startModel).toHaveBeenCalledWith(expect.objectContaining(body), { userId: "owner-1" }, undefined);
  await app.close();
});

test("com as ferramentas da agenda ligadas, o dono do MCP e passado adiante", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("MCP_TOKEN", "mcp-token-with-at-least-32-characters");
  vi.stubEnv("MCP_OWNER_USER_ID", "owner-1");
  const { app, startModel } = setup();

  await post(app, body);

  expect(startModel).toHaveBeenCalledWith(expect.objectContaining(body), { userId: "owner-1" }, "owner-1");
  await app.close();
});

test.each([
  ["fora da lista do provedor", { ...body, model: { provider: "anthropic", model: "claude-3", effort: "low" } }],
  ["sem modelo", { userId: "owner-1", text: "oi", clientMessageId: "m1" }],
])("recusa %s com 400", async (_label, payload) => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const { app, startModel } = setup();

  expect((await post(app, payload)).status).toBe(400);
  expect(startModel).not.toHaveBeenCalled();
  await app.close();
});
