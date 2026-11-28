import { expect, test } from "vitest";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Recurrence } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { updateRecurrenceRoute } from "./update-recurrence.route";
import { UpdateRecurrenceUseCase } from "./update-recurrence.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };
const rule = {
  frequency: "weekly" as const,
  interval: 1,
  byWeekday: 0b0101010,
  timeOfDay: "18:30",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-14",
};

function recurrence(userId = "auth-user-1"): Recurrence {
  return Recurrence.create({ userId, rule, template: { name: "Academia" } });
}

async function setup(recurrencesToSeed: Recurrence[]) {
  const kit = createTasksKit();
  const repository = new InMemoryRecurrenceRepository(kit.database);
  for (const stored of recurrencesToSeed) await repository.save(stored);
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [updateRecurrenceRoute(new UpdateRecurrenceUseCase(repository, kit.createTask, kit.taskRepository))],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return { app, repository };
}

test("PATCH /api/recurrences/:recurrenceId edita a serie e responde 204 sem corpo", async () => {
  const stored = recurrence();
  const { app, repository } = await setup([stored]);

  const response = await app.inject({
    method: "PATCH",
    url: `/api/recurrences/${stored.id}`,
    headers: session,
    payload: { expectedRevision: 1, interval: 2 },
  });

  expect(response.statusCode).toBe(204);
  expect(response.body).toBe("");
  expect(response.headers["content-type"]).toBeUndefined();
  expect(await repository.findById(stored.id)).toMatchObject({ rule: { interval: 2 }, revision: 2 });
  await app.close();
});

test("PATCH /api/recurrences/:recurrenceId edita a serie do caminho, qualquer que seja o id do corpo", async () => {
  const stored = recurrence();
  const other = recurrence();
  const { app, repository } = await setup([stored, other]);

  const response = await app.inject({
    method: "PATCH",
    url: `/api/recurrences/${stored.id}`,
    headers: session,
    payload: { expectedRevision: 1, interval: 3, recurrenceId: other.id },
  });

  expect(response.statusCode).toBe(204);
  expect(await repository.findById(stored.id)).toMatchObject({ rule: { interval: 3 }, revision: 2 });
  expect(await repository.findById(other.id)).toMatchObject({ rule: { interval: 1 }, revision: 1 });
  await app.close();
});

test("PATCH /api/recurrences/:recurrenceId preserva 404, 403, 409 e 400", async () => {
  const theirs = recurrence("someone-else");
  const stored = recurrence();
  const { app } = await setup([stored, theirs]);

  const missing = await app.inject({
    method: "PATCH",
    url: "/api/recurrences/missing",
    headers: session,
    payload: { expectedRevision: 1, interval: 2 },
  });
  expect(missing.statusCode).toBe(404);

  const other = await app.inject({
    method: "PATCH",
    url: `/api/recurrences/${theirs.id}`,
    headers: session,
    payload: { expectedRevision: 1, interval: 2 },
  });
  expect(other.statusCode).toBe(403);

  const stale = await app.inject({
    method: "PATCH",
    url: `/api/recurrences/${stored.id}`,
    headers: session,
    payload: { expectedRevision: 7, interval: 2 },
  });
  expect(stale.statusCode).toBe(409);

  for (const expectedRevision of [undefined, 0, 1.5]) {
    const invalid = await app.inject({
      method: "PATCH",
      url: `/api/recurrences/${stored.id}`,
      headers: session,
      payload: { expectedRevision, interval: 2 },
    });
    expect(invalid.statusCode, String(expectedRevision)).toBe(400);
    expect(JSON.parse(invalid.body)).toEqual({ error: "Invalid expectedRevision" });
  }

  const invalidTemplate = await app.inject({
    method: "PATCH",
    url: `/api/recurrences/${stored.id}`,
    headers: session,
    payload: { expectedRevision: 1, template: null },
  });
  expect(invalidTemplate.statusCode).toBe(400);
  expect(JSON.parse(invalidTemplate.body)).toEqual({ error: "Invalid template" });
  await app.close();
});
