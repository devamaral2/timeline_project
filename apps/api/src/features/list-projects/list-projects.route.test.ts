import { expect, test } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { InMemoryProjectQuery } from "../../api-core/projects/testing/in-memory-project.query";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { listProjectsRoute } from "./list-projects.route";
import { ListProjectsUseCase } from "./list-projects.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

function setup() {
  const app = createFastifyInstance();
  registerApiRoutes(app, [listProjectsRoute(new ListProjectsUseCase(new InMemoryProjectQuery()))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

test("GET /api/projects devolve o projeto pessoal do usuario autenticado", async () => {
  const app = setup();

  const response = await app.inject({ method: "GET", url: "/api/projects", headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual([{ id: "personal-auth-user-1", name: "diario", personal: true }]);
  await app.close();
});
