import { afterEach, expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { startHermesRequestRoute } from "./start-hermes-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const accepted = { id: "request-1", route: "hermes", status: "queued" };

function setup() {
  const startHermes = vi.fn(async () => accepted);
  const app = createFastifyInstance();
  registerApiRoutes(app, [startHermesRequestRoute({ startHermes } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, startHermes };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], payload: unknown) {
  const response = await app.inject({ method: "POST", url: "/api/requests/hermes", headers: session, payload: payload as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

afterEach(() => vi.unstubAllEnvs());

test("POST /api/requests/hermes e 404 enquanto a rota esta desligada, antes mesmo de ler o corpo", async () => {
  vi.stubEnv("AI_AUTOMATION", "off");
  const { app, startHermes } = setup();

  const response = await post(app, { garbage: true });

  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: "Not Found" });
  expect(startHermes).not.toHaveBeenCalled();
  await app.close();
});

test("aceita a mensagem e devolve 202 com o pedido, com a fala sem espacos das pontas", async () => {
  vi.stubEnv("AI_AUTOMATION", "on");
  const { app, startHermes } = setup();
  const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

  const response = await post(app, { userId: "owner-1", text: "  crie uma tarefa  ", sessionId, clientMessageId: "m1" });

  expect(response.status).toBe(202);
  expect(response.body).toEqual(accepted);
  expect(startHermes).toHaveBeenCalledWith(
    { userId: "owner-1", text: "crie uma tarefa", sessionId, clientMessageId: "m1" },
    { userId: "owner-1" },
  );
  await app.close();
});

test("aceita o projectId opcional", async () => {
  vi.stubEnv("AI_AUTOMATION", "on");
  const { app, startHermes } = setup();
  const projectId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

  await post(app, { userId: "owner-1", text: "oi", clientMessageId: "m1", projectId });

  expect(startHermes).toHaveBeenCalledWith({ userId: "owner-1", text: "oi", clientMessageId: "m1", projectId }, { userId: "owner-1" });
  await app.close();
});

test.each([
  { userId: "owner-1", text: "oi", clientMessageId: "m1", projectId: "nao-e-ulid" },
  { userId: "owner-1", text: "oi" },
  { userId: "owner-1", text: " ", clientMessageId: "m1" },
  { userId: "owner-1", text: "oi", clientMessageId: "bad id" },
  { userId: "owner-1", text: "oi", clientMessageId: "m1", sessionId: "nao-e-ulid" },
])("recusa um corpo invalido %# com 400", async (payload) => {
  vi.stubEnv("AI_AUTOMATION", "on");
  const { app, startHermes } = setup();

  expect((await post(app, payload)).status).toBe(400);
  expect(startHermes).not.toHaveBeenCalled();
  await app.close();
});
