import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { NotFoundError } from "../../common/http-errors";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { getRequestRoute } from "./get-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const detailed = { id: "r1", status: "completed", steps: [] };

function setup(view: (id: string, actor: unknown) => Promise<unknown>) {
  const app = createFastifyInstance();
  registerApiRoutes(app, [getRequestRoute({ view } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

test("GET /api/requests/:requestId devolve o pedido com os passos", async () => {
  const view = vi.fn(async () => detailed);
  const app = setup(view);

  const response = await app.inject({ method: "GET", url: "/api/requests/r1", headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual(detailed);
  expect(view).toHaveBeenCalledWith("r1", { userId: "owner-1" });
  await app.close();
});

test("um pedido que nao existe ou e de outra pessoa e 404 com o mesmo corpo", async () => {
  const app = setup(async () => {
    throw new NotFoundError("Request not found");
  });

  const response = await app.inject({ method: "GET", url: "/api/requests/r1", headers: session });

  expect(response.statusCode).toBe(404);
  expect(JSON.parse(response.body)).toEqual({ error: "Request not found" });
  await app.close();
});
