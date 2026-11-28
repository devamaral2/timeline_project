import { afterEach, expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { getModelOptionsRoute } from "./get-model-options.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };

function setup() {
  const app = createFastifyInstance();
  registerApiRoutes(app, [getModelOptionsRoute()], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

afterEach(() => vi.unstubAllEnvs());

test("GET /api/requests/model/options lista os provedores com chave e os modelos de cada um", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const app = setup();

  const response = await app.inject({ method: "GET", url: "/api/requests/model/options", headers: session });

  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body);
  expect(body.providers.map((provider: { id: string }) => provider.id)).toEqual(["anthropic"]);
  expect(body.default).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" });
  expect(body.efforts).toEqual(["low", "medium", "high", "max"]);
  await app.close();
});

test("sem nenhuma chave de provedor o modo nao existe: 404", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const app = setup();

  const response = await app.inject({ method: "GET", url: "/api/requests/model/options", headers: session });

  expect(response.statusCode).toBe(404);
  expect(JSON.parse(response.body)).toEqual({ error: "Not Found" });
  await app.close();
});
