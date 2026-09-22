import { BadRequestException } from "@nestjs/common";
import { expect, test } from "vitest";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../../api-core/events/testing/in-memory-workout.catalog";
import { StubMealParsingGateway } from "../../api-core/events/testing/stub-meal-parsing.gateway";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { CreateRecurrenceUseCase } from "../create-recurrence/create-recurrence.usecase";
import { DeleteRecurrenceUseCase } from "../delete-recurrence/delete-recurrence.usecase";
import { GetRecurrenceUseCase } from "../get-recurrence/get-recurrence.usecase";
import { ListRecurrencesUseCase } from "./list-recurrences.usecase";
import { UpdateRecurrenceUseCase } from "../update-recurrence/update-recurrence.usecase";
import { RecurrencesController } from "./test-recurrences-controller";

const actor = { userId: "auth-user-1" };

function makeController() {
  const database = new InMemoryEventDatabase();
  const recurrences = new InMemoryRecurrenceRepository(database);
  const tasks = new InMemoryTaskRepository();
  const createEvent = new CreateEventUseCase(
    new InMemoryEventRepository(database),
    new StubMealParsingGateway(),
    new InMemoryWorkoutCatalog(),
  );
  return new RecurrencesController(
    new ListRecurrencesUseCase(recurrences),
    new CreateRecurrenceUseCase(recurrences, createEvent, tasks),
    new GetRecurrenceUseCase(recurrences),
    new UpdateRecurrenceUseCase(recurrences, createEvent, tasks),
    new DeleteRecurrenceUseCase(recurrences),
  );
}

const body = {
  target: "event" as const,
  frequency: "weekly" as const,
  interval: 1,
  byWeekday: 0b0101010,
  timeOfDay: "18:30",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-14",
  template: { name: "Academia", items: [{ type: "routine" as const }] },
};

test("creates a series and returns it with the stored template", async () => {
  const controller = makeController();

  const { recurrenceId } = await controller.create(body, actor);
  const detail = await controller.detail(recurrenceId, actor);

  expect(detail).toMatchObject({
    id: recurrenceId,
    target: "event",
    frequency: "weekly",
    byWeekday: 0b0101010,
    revision: 1,
  });
  expect(detail.template).toMatchObject({ name: "Academia", priority: "normal" });
  expect(await controller.list(actor)).toHaveLength(1);
});

test("rejects an unknown target", async () => {
  await expect(makeController().create({ ...body, target: "habit" } as never, actor)).rejects.toThrow(
    BadRequestException,
  );
});

test("rejects a template that is not an object", async () => {
  await expect(makeController().create({ ...body, template: "Academia" } as never, actor)).rejects.toThrow(
    "Invalid template",
  );
});

test("PATCH requires expectedRevision and cannot change the target", async () => {
  const controller = makeController();
  const { recurrenceId } = await controller.create(body, actor);

  await expect(controller.update(recurrenceId, { interval: 2 } as never, actor)).rejects.toThrow(
    "Invalid expectedRevision",
  );
  await expect(
    controller.update(recurrenceId, { expectedRevision: 1, target: "task" } as never, actor),
  ).rejects.toThrow("The target of a recurrence cannot change");
});

test("GET of a missing series is a 404", async () => {
  await expect(makeController().detail("01K2MISSING000000000000000A", actor)).rejects.toThrow(
    "Recurrence not found",
  );
});
