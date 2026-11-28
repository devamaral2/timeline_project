import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { BadRequestError } from "../../common/http-errors";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CreateRecurrenceController } from "../create-recurrence/create-recurrence.controller";
import { CreateRecurrenceUseCase } from "../create-recurrence/create-recurrence.usecase";
import { DeleteRecurrenceController } from "../delete-recurrence/delete-recurrence.controller";
import { DeleteRecurrenceUseCase } from "../delete-recurrence/delete-recurrence.usecase";
import { GetRecurrenceController } from "../get-recurrence/get-recurrence.controller";
import { GetRecurrenceUseCase } from "../get-recurrence/get-recurrence.usecase";
import { UpdateRecurrenceController } from "../update-recurrence/update-recurrence.controller";
import { UpdateRecurrenceUseCase } from "../update-recurrence/update-recurrence.usecase";
import { ListRecurrencesController } from "./list-recurrences.controller";
import { ListRecurrencesUseCase } from "./list-recurrences.usecase";

const actor = { userId: "auth-user-1" };

function makeControllers() {
  const { database, createTask, taskRepository } = createTasksKit();
  const recurrences = new InMemoryRecurrenceRepository(database);
  return {
    list: new ListRecurrencesController(new ListRecurrencesUseCase(recurrences)),
    create: new CreateRecurrenceController(new CreateRecurrenceUseCase(recurrences, createTask, taskRepository)),
    detail: new GetRecurrenceController(new GetRecurrenceUseCase(recurrences)),
    update: new UpdateRecurrenceController(new UpdateRecurrenceUseCase(recurrences, createTask, taskRepository)),
    remove: new DeleteRecurrenceController(new DeleteRecurrenceUseCase(recurrences)),
  };
}

const body = {
  frequency: "weekly" as const,
  interval: 1,
  byWeekday: 0b0101010,
  timeOfDay: "18:30",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-14",
  template: { name: "Academia", kind: "common" as const },
};

test("POST creates a series and GET returns it with the stored template", async () => {
  const { create, detail, list } = makeControllers();

  const { recurrenceId } = await create.execute(body, actor);
  const stored = await detail.execute(recurrenceId, actor);

  expect(stored).toMatchObject({ id: recurrenceId, frequency: "weekly", byWeekday: 0b0101010, revision: 1 });
  expect(stored.template).toMatchObject({ name: "Academia", kind: "common", priority: "medium", artifactIds: [] });
  expect(stored).not.toHaveProperty("target");
  expect(await list.execute(actor)).toEqual([stored]);
});

test("GET lists only the series of the authenticated actor", async () => {
  const { create, list } = makeControllers();
  await create.execute(body, actor);

  expect(await list.execute({ userId: "someone-else" })).toEqual([]);
});

test("POST rejects a template that is missing or is not an object", async () => {
  const { create } = makeControllers();

  await expect(async () => create.execute({ ...body, template: "Academia" } as never, actor)).rejects.toThrow("Invalid template");
  await expect(async () => create.execute({ ...body, template: undefined } as never, actor)).rejects.toThrow(BadRequestError);
  await expect(async () => create.execute({ ...body, template: [] } as never, actor)).rejects.toThrow(BadRequestError);
});

test("PATCH requires expectedRevision and an object template when one is sent", async () => {
  const { create, update } = makeControllers();
  const { recurrenceId } = await create.execute(body, actor);

  await expect(update.execute(recurrenceId, { interval: 2 } as never, actor)).rejects.toThrow("Invalid expectedRevision");
  await expect(update.execute(recurrenceId, { expectedRevision: 0 }, actor)).rejects.toThrow("Invalid expectedRevision");
  await expect(update.execute(recurrenceId, { expectedRevision: 1.5 }, actor)).rejects.toThrow(BadRequestException);
  await expect(update.execute(recurrenceId, { expectedRevision: 1, template: null } as never, actor)).rejects.toThrow(
    "Invalid template",
  );
});

test("PATCH edits the series named in the route, whatever id the body carries", async () => {
  const { create, update, detail } = makeControllers();
  const { recurrenceId } = await create.execute(body, actor);
  const other = await create.execute({ ...body, template: { name: "Natação" } }, actor);

  await update.execute(recurrenceId, { expectedRevision: 1, interval: 2, recurrenceId: other.recurrenceId } as never, actor);

  expect(await detail.execute(recurrenceId, actor)).toMatchObject({ interval: 2, revision: 2 });
  expect(await detail.execute(other.recurrenceId, actor)).toMatchObject({ interval: 1, revision: 1 });
});

test("GET of a missing series is a 404", async () => {
  await expect(makeControllers().detail.execute("01K2MISSING000000000000000A", actor)).rejects.toThrow(NotFoundException);
});

test("DELETE removes the series", async () => {
  const { create, remove, list } = makeControllers();
  const { recurrenceId } = await create.execute(body, actor);

  await remove.execute(recurrenceId, actor);

  expect(await list.execute(actor)).toEqual([]);
});

test("every recurrence route requires GatewayIdentityGuard", () => {
  for (const controller of [
    ListRecurrencesController,
    CreateRecurrenceController,
    GetRecurrenceController,
    UpdateRecurrenceController,
    DeleteRecurrenceController,
  ]) {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller.prototype.execute) as unknown[] | undefined;

    expect(guards, controller.name).toContain(GatewayIdentityGuard);
  }
});
