import { expect, test } from "vitest";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { createRecurrenceRoute } from "./create-recurrence.route";
import { CreateRecurrenceUseCase } from "./create-recurrence.usecase";

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
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [createRecurrenceRoute(new CreateRecurrenceUseCase(recurrences, kit.createTask, kit.taskRepository))],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return { app, recurrences };
}

test("POST /api/recurrences cria a serie com o template guardado e responde 201", async () => {
  const { app, recurrences } = setup();

  const response = await app.inject({ method: "POST", url: "/api/recurrences", headers: session, payload: body });

  expect(response.statusCode).toBe(201);
  const { recurrenceId } = JSON.parse(response.body) as { recurrenceId: string };
  expect(await recurrences.findById(recurrenceId)).toMatchObject({
    rule: { frequency: "weekly" },
    template: { name: "Academia", kind: "common", priority: "medium", artifactIds: [] },
    revision: 1,
  });
  await app.close();
});

test("POST /api/recurrences preserva a idempotencia da criacao", async () => {
  const { app, recurrences } = setup();
  const headers = { ...session, "idempotency-key": "criar-serie" };

  const first = await app.inject({ method: "POST", url: "/api/recurrences", headers, payload: body });
  expect(first.statusCode).toBe(201);
  const { recurrenceId } = JSON.parse(first.body) as { recurrenceId: string };

  const replay = await app.inject({ method: "POST", url: "/api/recurrences", headers, payload: body });
  expect(replay.statusCode).toBe(201);
  expect(replay.headers["idempotent-replayed"]).toBe("true");
  expect(JSON.parse(replay.body)).toEqual({ recurrenceId });
  expect(await recurrences.listByUserId("auth-user-1")).toHaveLength(1);

  const mismatch = await app.inject({
    method: "POST",
    url: "/api/recurrences",
    headers,
    payload: { ...body, interval: 2 },
  });
  expect(mismatch.statusCode).toBe(422);
  await app.close();
});

test("POST /api/recurrences recusa template invalido ou ausente", async () => {
  const { app } = setup();

  const invalid = await app.inject({
    method: "POST",
    url: "/api/recurrences",
    headers: session,
    payload: { ...body, template: "Academia" },
  });
  expect(invalid.statusCode).toBe(400);
  expect(JSON.parse(invalid.body)).toEqual({ error: "Invalid template" });

  const missingTemplate = await app.inject({
    method: "POST",
    url: "/api/recurrences",
    headers: session,
    payload: { ...body, template: undefined },
  });
  expect(missingTemplate.statusCode).toBe(400);
  await app.close();
});
