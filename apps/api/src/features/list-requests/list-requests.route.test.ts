import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { listRequestsRoute } from "./list-requests.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const listed = [{ id: "r1", status: "completed" }];

function setup() {
  const list = vi.fn(async () => listed);
  const app = createFastifyInstance();
  registerApiRoutes(app, [listRequestsRoute({ list } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, list };
}

async function get(app: Awaited<ReturnType<typeof setup>>["app"], path = "/api/requests") {
  const response = await app.inject({ method: "GET", url: path, headers: session });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("GET /api/requests devolve os pedidos do usuario, do mais novo para o mais antigo", async () => {
  const { app, list } = setup();

  const response = await get(app);

  expect(response.status).toBe(200);
  expect(response.body).toEqual(listed);
  expect(list).toHaveBeenCalledWith({ userId: "owner-1" }, undefined);
  await app.close();
});

test("o limite vem da query, como antes", async () => {
  const { app, list } = setup();

  expect((await get(app, "/api/requests?limit=3")).status).toBe(200);
  expect(list).toHaveBeenCalledWith({ userId: "owner-1" }, 3);
  await app.close();
});

test.each(["?limit=0", "?limit=51", "?limit=abc", "?limit=1.5"])("um limite invalido (%s) e 400 sem consultar o banco", async (query) => {
  const { app, list } = setup();

  expect((await get(app, `/api/requests${query}`)).status).toBe(400);
  expect(list).not.toHaveBeenCalled();
  await app.close();
});
