import { expect, test } from "vitest";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { CreateRecurrenceUseCase } from "../create-recurrence/create-recurrence.usecase";
import { listRecurrencesRoute } from "./list-recurrences.route";
import { ListRecurrencesUseCase } from "./list-recurrences.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

const body = {
  frequency: "weekly" as const,
  interval: 1,
  byWeekday: 0b0101010,
  timeOfDay: "18:30",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-14",
  template: { name: "Academia", kind: "common" as const },
};

function setup() {
  const kit = createTasksKit();
  const recurrences = new InMemoryRecurrenceRepository(kit.database);
  const createRecurrence = new CreateRecurrenceUseCase(recurrences, kit.createTask, kit.taskRepository);
  const app = createFastifyInstance();
  registerApiRoutes(app, [listRecurrencesRoute(new ListRecurrencesUseCase(recurrences))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, createRecurrence };
}

test("GET /api/recurrences devolve as series do usuario autenticado", async () => {
  const { app, createRecurrence } = setup();
  const { recurrenceId } = await createRecurrence.execute(body, { userId: "auth-user-1" });
  await createRecurrence.execute(
    { ...body, template: { name: "De outro" } },
    { userId: "someone-else" },
  );

  const response = await app.inject({ method: "GET", url: "/api/recurrences", headers: session });

  expect(response.statusCode).toBe(200);
  const recurrences = JSON.parse(response.body) as Array<{ id: string; frequency: string; revision: number }>;
  expect(recurrences).toHaveLength(1);
  expect(recurrences[0]).toMatchObject({ id: recurrenceId, frequency: "weekly", revision: 1 });
  await app.close();
});
