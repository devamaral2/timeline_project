import { expect, test } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { InMemoryProjectRepository } from "../../api-core/projects/testing/in-memory-project.repository";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { createProjectRoute } from "./create-project.route";
import { CreateProjectUseCase } from "./create-project.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

function setup() {
  const repository = new InMemoryProjectRepository();
  const app = createFastifyInstance();
  registerApiRoutes(app, [createProjectRoute(new CreateProjectUseCase(repository))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, repository };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], body: unknown) {
  const response = await app.inject({ method: "POST", url: "/api/projects", headers: session, payload: body as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("POST /api/projects cria o projeto e responde 201 com ele", async () => {
  const { app, repository } = setup();

  const created = await post(app, { name: "  timeline_project " });

  expect(created.status).toBe(201);
  expect(created.body).toEqual({ id: expect.any(String), name: "timeline_project", personal: false });
  expect(repository.of("auth-user-1")).toEqual([created.body]);
  await app.close();
});

test("nome repetido, inclusive o pessoal, e 409; nome invalido e campo desconhecido sao 400", async () => {
  const { app } = setup();
  await post(app, { name: "Braid" });

  expect((await post(app, { name: " braid " })).status).toBe(409);
  expect((await post(app, { name: "Diario" })).status).toBe(409);
  expect((await post(app, { name: "" })).status).toBe(400);
  expect((await post(app, { name: "braid", personal: true })).status).toBe(400);
  await app.close();
});
