import { expect, test } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { Task, type TaskCreateProps } from "../../domain";
import { SetTaskSituationUseCase } from "./set-task-situation.usecase";
import { setTaskSituationRoute } from "./set-task-situation.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };
const startedAt = new Date("2026-11-20T12:00:00.000Z");

function agent(id: string, props: Partial<TaskCreateProps> = {}): Task {
  return Task.create({ id, userId: "auth-user-1", actor: "agent", kind: "request", status: "completed", name: "Pedido", startedAt, ...props });
}

function setup(tasks: Task[]) {
  const database = new InMemoryTaskDatabase(tasks);
  const useCase = new SetTaskSituationUseCase(new InMemoryTaskRepository(database), new InMemoryTaskCardQuery(database));
  const app = createFastifyInstance();
  registerApiRoutes(app, [setTaskSituationRoute(useCase)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

async function put(app: Awaited<ReturnType<typeof setup>>, taskId: string, body: unknown) {
  const response = await app.inject({ method: "PUT", url: `/api/tasks/${taskId}/situation`, headers: session, payload: body as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("PUT /api/tasks/:taskId/situation grava qualquer das tres situacoes e devolve o cartao", async () => {
  const app = setup([agent("r1", { situation: "to_review" })]);

  const first = await put(app, "r1", { situation: "reviewed" });
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ id: "r1", actor: "agent", status: "completed", situation: "reviewed" });

  const second = await put(app, "r1", { situation: "bookmarked" });
  expect(second.body).toMatchObject({ id: "r1", situation: "bookmarked" });
  await app.close();
});

test("corpo invalido e 400, tarefa ausente e de outro usuario sao 404 e tarefa que nao aceita e 409", async () => {
  const app = setup([
    agent("r1"),
    Task.create({ id: "h1", userId: "auth-user-1", name: "Ler", status: "done", startedAt }),
  ]);

  expect((await put(app, "r1", { situation: "archived" })).status).toBe(400);
  expect((await put(app, "r1", { situation: "reviewed", expectedRevision: 1 })).status).toBe(400);
  expect((await put(app, "r1", {})).status).toBe(400);
  expect((await put(app, "missing", { situation: "reviewed" })).status).toBe(404);
  expect((await put(app, "h1", { situation: "reviewed" })).status).toBe(409);
  await app.close();
});
