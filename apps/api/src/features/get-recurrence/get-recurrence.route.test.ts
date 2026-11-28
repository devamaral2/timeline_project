import { expect, test } from "vitest";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Recurrence } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { getRecurrenceRoute } from "./get-recurrence.route";
import { GetRecurrenceUseCase } from "./get-recurrence.usecase";

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
  registerApiRoutes(app, [getRecurrenceRoute(new GetRecurrenceUseCase(repository))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

test("GET /api/recurrences/:recurrenceId devolve a serie do dono, com o template", async () => {
  const stored = recurrence();
  const app = await setup([stored]);

  const response = await app.inject({ method: "GET", url: `/api/recurrences/${stored.id}`, headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({
    id: stored.id,
    frequency: "weekly",
    byWeekday: 0b0101010,
    template: { name: "Academia" },
    revision: 1,
  });
  await app.close();
});

test("GET /api/recurrences/:recurrenceId responde 404 quando nao existe e 403 quando e de outro usuario", async () => {
  const theirs = recurrence("someone-else");
  const app = await setup([theirs]);

  const missing = await app.inject({ method: "GET", url: "/api/recurrences/missing", headers: session });
  expect(missing.statusCode).toBe(404);
  expect(JSON.parse(missing.body)).toEqual({ error: "Recurrence not found" });

  const other = await app.inject({ method: "GET", url: `/api/recurrences/${theirs.id}`, headers: session });
  expect(other.statusCode).toBe(403);
  await app.close();
});
