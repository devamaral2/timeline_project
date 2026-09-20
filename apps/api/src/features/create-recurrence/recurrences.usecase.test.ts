import { expect, test } from "vitest";
import { RecurrenceOwnershipError, RecurrenceValidationError, TaskNotFoundError } from "../../domain";
import type { CreateRecurrenceInput } from "@repo/contracts";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../../api-core/events/testing/in-memory-workout.catalog";
import { StubMealParsingGateway } from "../../api-core/events/testing/stub-meal-parsing.gateway";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { CreateRecurrenceUseCase } from "./create-recurrence.usecase";
import { DeleteRecurrenceUseCase } from "../delete-recurrence/delete-recurrence.usecase";
import { MAX_HORIZON_DAYS, MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { UpdateRecurrenceUseCase } from "../update-recurrence/update-recurrence.usecase";

const actor = { userId: "auth-user-1" };
// 15/09/2026, 12:00 em Sao Paulo.
const now = new Date("2026-09-15T15:00:00.000Z");

function setup(clock: { now: Date } = { now }) {
  const database = new InMemoryEventDatabase();
  const recurrences = new InMemoryRecurrenceRepository(database);
  const tasks = new InMemoryTaskRepository();
  const createEvent = new CreateEventUseCase(
    new InMemoryEventRepository(database),
    new StubMealParsingGateway(),
    new InMemoryWorkoutCatalog(),
  );
  const tick = () => clock.now;
  return {
    database,
    recurrences,
    tasks,
    create: new CreateRecurrenceUseCase(recurrences, createEvent, tasks),
    update: new UpdateRecurrenceUseCase(recurrences, createEvent, tasks, tick),
    remove: new DeleteRecurrenceUseCase(recurrences, tick),
    materializer: new MaterializeRecurrencesUseCase(recurrences, tick),
  };
}

const dailyRun: CreateRecurrenceInput = {
  target: "event",
  frequency: "daily",
  interval: 1,
  timeOfDay: "07:00",
  durationMinutes: 30,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
  template: { name: "Correr", tags: ["saude"], items: [{ type: "routine" }] },
};

function daysOf(database: InMemoryEventDatabase) {
  return database.events.map((event) => event.occurrence?.occurrenceOn).sort();
}

test("creates an event series and generates it from today, not from startsOn", async () => {
  const { create, materializer, database } = setup();

  await create.execute({ ...dailyRun, endsOn: "2026-09-17" }, actor);
  await materializer.materialize(actor.userId);

  expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
  const first = database.events.find((event) => event.occurrence?.occurrenceOn === "2026-09-15");
  expect(first?.name).toBe("Correr");
  expect(first?.tags).toEqual(["saude"]);
  expect(first?.startedAt.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  expect(first?.finishedAt?.toISOString()).toBe("2026-09-15T10:30:00.000Z");
});

test("a second read writes nothing new", async () => {
  const { create, materializer, database } = setup();
  await create.execute(dailyRun, actor);

  await materializer.materialize(actor.userId);
  const afterFirst = database.events.length;
  await materializer.materialize(actor.userId);

  expect(afterFirst).toBe(61);
  expect(database.events).toHaveLength(afterFirst);
});

test("reaching further into the future generates up to the day asked, within the ceiling", async () => {
  const { create, materializer, recurrences } = setup();
  const { recurrenceId } = await create.execute(dailyRun, actor);

  await materializer.materialize(actor.userId, new Date("2026-12-31T15:00:00.000Z"));
  expect((await recurrences.findById(recurrenceId))?.materializedThrough).toBe("2026-12-31");

  await materializer.materialize(actor.userId, new Date("2099-01-01T15:00:00.000Z"));
  const ceiling = new Date(Date.UTC(2026, 8, 15 + MAX_HORIZON_DAYS)).toISOString().slice(0, 10);
  expect((await recurrences.findById(recurrenceId))?.materializedThrough).toBe(ceiling);
});

test("skips the days that were deleted from the series", async () => {
  const { create, materializer, recurrences, database } = setup();
  const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-17" }, actor);
  await recurrences.addException(recurrenceId, "2026-09-16");

  await materializer.materialize(actor.userId);

  expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-17"]);
});

test("resolves a meal template once, instead of once per occurrence", async () => {
  const meals = new StubMealParsingGateway();
  const database = new InMemoryEventDatabase();
  const recurrences = new InMemoryRecurrenceRepository(database);
  const createEvent = new CreateEventUseCase(new InMemoryEventRepository(database), meals, new InMemoryWorkoutCatalog());
  const create = new CreateRecurrenceUseCase(recurrences, createEvent, new InMemoryTaskRepository());
  const materializer = new MaterializeRecurrencesUseCase(recurrences, () => now);
  let calls = 0;
  const parseMeal = meals.parseMeal.bind(meals);
  meals.parseMeal = async () => {
    calls += 1;
    return parseMeal();
  };

  await create.execute(
    { ...dailyRun, timeOfDay: "12:30", template: { items: [{ type: "meal", data: { inputText: "arroz e feijao" } }] } },
    actor,
  );
  await materializer.materialize(actor.userId);

  expect(calls).toBe(1);
  expect(database.events.length).toBeGreaterThan(1);
  expect(database.events.every((event) => event.items[0]?.type === "meal")).toBe(true);
  // Cada ocorrencia e dona dos proprios itens.
  expect(new Set(database.events.map((event) => event.items[0]?.id)).size).toBe(database.events.length);
});

test("refuses a series that never happens", async () => {
  const { create } = setup();

  await expect(
    create.execute(
      { ...dailyRun, frequency: "monthly", byMonthDay: 31, startsOn: "2026-04-01", endsOn: "2026-04-30" },
      actor,
    ),
  ).rejects.toThrow(RecurrenceValidationError);
});

test("creates a task series with the window as start and deadline", async () => {
  const { create, materializer, recurrences } = setup();

  await create.execute(
    {
      target: "task",
      frequency: "monthly",
      interval: 1,
      byMonthDay: 5,
      timeOfDay: "09:00",
      durationMinutes: 60,
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-01",
      endsOn: "2026-11-30",
      template: { name: "Pagar aluguel", priority: "high" },
    },
    actor,
  );
  await materializer.materialize(actor.userId, new Date("2026-11-30T15:00:00.000Z"));

  expect(recurrences.tasks.map((task) => task.occurrence?.occurrenceOn)).toEqual(["2026-10-05", "2026-11-05"]);
  const october = recurrences.tasks[0];
  expect(october?.status).toBe("todo");
  expect(october?.priority).toBe("high");
  expect(october?.startedAt?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
  expect(october?.estimatedFinishAt?.toISOString()).toBe("2026-10-05T13:00:00.000Z");
});

test("refuses a task series under a parent that does not exist", async () => {
  const { create } = setup();

  await expect(
    create.execute(
      { ...dailyRun, target: "task", template: { name: "Filha", parentTaskId: "01K2NOPARENT0000000000000A" } },
      actor,
    ),
  ).rejects.toThrow(TaskNotFoundError);
});

test("editing the series regenerates from today on, but keeps the past and the hand-edited occurrences", async () => {
  const clock = { now: new Date("2026-09-10T15:00:00.000Z") };
  const { create, update, materializer, database, recurrences } = setup(clock);
  const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-20" }, actor);
  await materializer.materialize(actor.userId);

  // O usuario marca a ocorrencia do dia 18 como perdida: ela sai da serie.
  const eighteenth = database.events.findIndex((event) => event.occurrence?.occurrenceOn === "2026-09-18");
  database.events[eighteenth] = (database.events[eighteenth] as (typeof database.events)[number]).revise({ missed: true });

  clock.now = now; // dia 15
  await update.execute({ recurrenceId, expectedRevision: 1, timeOfDay: "08:00" }, actor);
  await materializer.materialize(actor.userId);

  const hourOf = (day: string) =>
    database.events.find((event) => event.occurrence?.occurrenceOn === day)?.startedAt.toISOString();
  expect(hourOf("2026-09-14")).toBe("2026-09-14T10:00:00.000Z"); // passado, intocado
  expect(hourOf("2026-09-15")).toBe("2026-09-15T11:00:00.000Z"); // regerado as 08:00
  expect(hourOf("2026-09-18")).toBe("2026-09-18T10:00:00.000Z"); // editado a mao, fica
  expect(daysOf(database)).toHaveLength(11);
  expect((await recurrences.findById(recurrenceId))?.revision).toBe(2);
});

test("deleting the series keeps what already happened", async () => {
  const clock = { now: new Date("2026-09-13T15:00:00.000Z") };
  const { create, remove, materializer, database, recurrences } = setup(clock);
  const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-17" }, actor);
  await materializer.materialize(actor.userId);

  clock.now = now;
  await remove.execute({ recurrenceId }, actor);

  expect(daysOf(database)).toEqual(["2026-09-13", "2026-09-14"]);
  expect(await recurrences.findById(recurrenceId)).toBeNull();
});

test("only the owner edits or deletes a series", async () => {
  const { create, update, remove } = setup();
  const { recurrenceId } = await create.execute(dailyRun, actor);
  const intruder = { userId: "someone-else" };

  await expect(update.execute({ recurrenceId, expectedRevision: 1, interval: 2 }, intruder)).rejects.toThrow(
    RecurrenceOwnershipError,
  );
  await expect(remove.execute({ recurrenceId }, intruder)).rejects.toThrow(RecurrenceOwnershipError);
});

test("another user's series is never materialized into this user's timeline", async () => {
  const { create, materializer, database } = setup();
  await create.execute(dailyRun, { userId: "someone-else" });

  await materializer.materialize(actor.userId);

  expect(database.events).toHaveLength(0);
});
