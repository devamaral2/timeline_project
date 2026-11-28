import { expect, test } from "vitest";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Recurrence } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { deleteRecurrenceRoute } from "./delete-recurrence.route";
import { DeleteRecurrenceUseCase } from "./delete-recurrence.usecase";

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
  registerApiRoutes(app, [deleteRecurrenceRoute(new DeleteRecurrenceUseCase(repository))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, repository };
}

test("DELETE /api/recurrences/:recurrenceId apaga a serie e responde 204 sem corpo", async () => {
  const stored = recurrence();
  const { app, repository } = await setup([stored]);

  const response = await app.inject({ method: "DELETE", url: `/api/recurrences/${stored.id}`, headers: session });

  expect(response.statusCode).toBe(204);
  expect(response.body).toBe("");
  expect(await repository.findById(stored.id)).toBeNull();
  await app.close();
});

test("DELETE /api/recurrences/:recurrenceId responde 404 quando nao existe e 403 quando e de outro usuario", async () => {
  const theirs = recurrence("someone-else");
  const { app } = await setup([theirs]);

  const missing = await app.inject({ method: "DELETE", url: "/api/recurrences/missing", headers: session });
  expect(missing.statusCode).toBe(404);

  const other = await app.inject({ method: "DELETE", url: `/api/recurrences/${theirs.id}`, headers: session });
  expect(other.statusCode).toBe(403);
  await app.close();
});
