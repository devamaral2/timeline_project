import { describe, expect, test } from "vitest";
import {
  Note,
  RecurrenceOwnershipError,
  RecurrenceValidationError,
  TaskNotFoundError,
  type Event,
} from "../../domain";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { createEventsKit } from "../../api-core/events/testing/in-memory-events-kit";
import { StubMealParsingGateway } from "../../api-core/events/testing/stub-meal-parsing.gateway";
import { InMemoryNoteRepository } from "../../api-core/notes/testing/in-memory-note.repository";
import { AttachNotesToRecurrenceUseCase } from "../attach-notes-to-recurrence/attach-notes-to-recurrence.usecase";
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
  const { database, createEvent } = createEventsKit();
  const recurrences = new InMemoryRecurrenceRepository(database);
  const tasks = new InMemoryTaskRepository();
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
  template: { name: "Correr", tags: ["saude"], kind: "routine" },
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

test("shares one pending meal note with every occurrence without calling the model", async () => {
  const meals = new StubMealParsingGateway();
  const { database, createEvent } = createEventsKit({ mealParsingGateway: meals });
  const recurrences = new InMemoryRecurrenceRepository(database);
  const create = new CreateRecurrenceUseCase(recurrences, createEvent, new InMemoryTaskRepository());
  const materializer = new MaterializeRecurrencesUseCase(recurrences, () => now);
  let calls = 0;
  const parseMeal = meals.parseMeal.bind(meals);
  meals.parseMeal = async () => {
    calls += 1;
    return parseMeal();
  };

  const { recurrenceId } = await create.execute(
    {
      ...dailyRun,
      timeOfDay: "12:30",
      template: { kind: "meal", notes: [{ type: "meal", data: { inputText: "arroz e feijao" } }] },
    },
    actor,
  );
  await materializer.materialize(actor.userId);

  expect(calls).toBe(0);
  expect(database.events.length).toBeGreaterThan(1);
  expect(database.events.every((event) => event.kind === "meal")).toBe(true);
  // A mesma note em todas as ocorrencias — uma so, ligada a serie —, cada uma com o proprio vinculo da serie.
  const [mealNote] = database.notes;
  expect(database.notes).toHaveLength(1);
  expect(mealNote.data).toMatchObject({
    generation: { status: "pending" }, description: "arroz e feijao", foodItems: [],
  });
  expect((await recurrences.findById(recurrenceId))?.noteIds).toEqual([mealNote.id]);
  expect(
    database.events.every(
      (event) => event.noteLinks.length === 1 && event.noteLinks[0].noteId === mealNote.id && event.noteLinks[0].fromRecurrence,
    ),
  ).toBe(true);
});

test("the stored template carries the kind and no notes", async () => {
  const { create, recurrences } = setup();

  const { recurrenceId } = await create.execute(
    { ...dailyRun, template: { kind: "sleep", notes: [{ type: "sleep", data: { trackedSleepTime: 420 } }] } },
    actor,
  );

  const stored = await recurrences.findById(recurrenceId);
  expect(stored?.template).toMatchObject({ name: "Sono", kind: "sleep" });
  expect(stored?.template).not.toHaveProperty("items");
  expect(stored?.template).not.toHaveProperty("notes");
  expect(stored?.noteIds).toHaveLength(1);
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

test("editing the series leaves the notes of a single occurrence alone, and editing one occurrence leaves the series notes alone", async () => {
  const clock = { now: new Date("2026-09-10T15:00:00.000Z") };
  const { create, update, materializer, database, recurrences } = setup(clock);
  const { recurrenceId } = await create.execute(
    { ...dailyRun, endsOn: "2026-09-20", template: { name: "Correr", notes: [{ data: { body: "alongar" } }] } },
    actor,
  );
  await materializer.materialize(actor.userId);
  const [seriesNote] = database.notes;

  // So a ocorrencia do dia 18 ganha uma note propria: ela deixa de ser "da serie" e segue sozinha.
  const own = Note.create({ userId: actor.userId, data: { body: "so hoje: 10 km" } });
  database.notes.push(own);
  const eighteenth = database.events.findIndex((event) => event.occurrence?.occurrenceOn === "2026-09-18");
  const before = database.events[eighteenth] as Event;
  database.events[eighteenth] = before.revise({ noteLinks: [...before.noteLinks, { noteId: own.id, fromRecurrence: false }] });

  clock.now = now; // dia 15
  await update.execute({ recurrenceId, expectedRevision: 1, timeOfDay: "08:00" }, actor);
  await materializer.materialize(actor.userId);

  const on = (day: string) => database.events.find((event) => event.occurrence?.occurrenceOn === day) as Event;
  // A serie editada: o dia 16 foi regerado e continua com a note da serie...
  expect(on("2026-09-16").noteLinks).toEqual([{ noteId: seriesNote.id, fromRecurrence: true }]);
  // ... e o dia 18, que tinha uma note so dele, nao foi tocado: continua com as duas.
  expect(on("2026-09-18").noteLinks).toEqual([
    { noteId: seriesNote.id, fromRecurrence: true },
    { noteId: own.id, fromRecurrence: false },
  ]);
  expect(on("2026-09-18").startedAt.toISOString()).toBe("2026-09-18T10:00:00.000Z");
  // E a note propria do dia 18 nao vazou para a serie.
  expect((await recurrences.findById(recurrenceId))?.noteIds).toEqual([seriesNote.id]);
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

describe("attaching notes to every occurrence of a series", () => {
  function setupAttach(clock: { now: Date }) {
    const kit = setup(clock);
    const noteRepository = new InMemoryNoteRepository(kit.database.notes);
    const attach = new AttachNotesToRecurrenceUseCase(kit.recurrences, noteRepository, () => clock.now);
    return { ...kit, attach };
  }

  test("links the same note to the future occurrences, not to the past, and the ones generated later inherit it", async () => {
    const clock = { now: new Date("2026-09-10T15:00:00.000Z") };
    const { create, attach, materializer, database, recurrences } = setupAttach(clock);
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-20" }, actor);
    await materializer.materialize(actor.userId);
    const note = Note.create({ userId: actor.userId, data: { body: "levar tênis" } });
    database.notes.push(note);

    clock.now = now; // dia 15
    await attach.execute({ recurrenceId, noteIds: [note.id] }, actor);

    const on = (day: string) => database.events.find((event) => event.occurrence?.occurrenceOn === day) as Event;
    // Passado: ate o dia 14, nada muda.
    expect(on("2026-09-10").noteLinks).toEqual([]);
    expect(on("2026-09-14").noteLinks).toEqual([]);
    // De hoje em diante: a mesma note, vinda da serie, sem editar a ocorrencia.
    expect(on("2026-09-15").noteLinks).toEqual([{ noteId: note.id, fromRecurrence: true }]);
    expect(on("2026-09-20").noteLinks).toEqual([{ noteId: note.id, fromRecurrence: true }]);
    expect(on("2026-09-15").revision).toBe(1);
    expect(on("2026-09-15").occurrence?.detached).toBe(false);
    expect((await recurrences.findById(recurrenceId))?.noteIds).toEqual([note.id]);
  });

  test("an occurrence the user already edited keeps its own notes and does not receive the series note", async () => {
    const clock = { now: new Date("2026-09-10T15:00:00.000Z") };
    const { create, attach, materializer, database } = setupAttach(clock);
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-20" }, actor);
    await materializer.materialize(actor.userId);
    const note = Note.create({ userId: actor.userId, data: { body: "da serie" } });
    database.notes.push(note);
    const eighteenth = database.events.findIndex((event) => event.occurrence?.occurrenceOn === "2026-09-18");
    database.events[eighteenth] = (database.events[eighteenth] as Event).revise({ description: "editada a mão" });

    clock.now = now;
    await attach.execute({ recurrenceId, noteIds: [note.id] }, actor);

    const on = (day: string) => database.events.find((event) => event.occurrence?.occurrenceOn === day) as Event;
    expect(on("2026-09-18").noteLinks).toEqual([]);
    expect(on("2026-09-17").noteLinks).toEqual([{ noteId: note.id, fromRecurrence: true }]);
  });

  test("occurrences generated after the link are born with the note", async () => {
    const { create, attach, materializer, database } = setupAttach({ now });
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-16" }, actor);
    const note = Note.create({ userId: actor.userId, data: { body: "da serie" } });
    database.notes.push(note);

    // Antes de qualquer ocorrencia existir.
    await attach.execute({ recurrenceId, noteIds: [note.id] }, actor);
    await materializer.materialize(actor.userId);

    expect(database.events).toHaveLength(2);
    expect(database.events.every((event) => event.noteLinks[0]?.noteId === note.id && event.noteLinks[0].fromRecurrence)).toBe(true);
  });

  test("attaching a note the series already has changes nothing", async () => {
    const { create, attach, materializer, database, recurrences } = setupAttach({ now });
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-16" }, actor);
    await materializer.materialize(actor.userId);
    const note = Note.create({ userId: actor.userId, data: { body: "x" } });
    database.notes.push(note);

    await attach.execute({ recurrenceId, noteIds: [note.id] }, actor);
    await attach.execute({ recurrenceId, noteIds: [note.id] }, actor);

    expect((await recurrences.findById(recurrenceId))?.noteIds).toEqual([note.id]);
    expect(database.events.every((event) => event.noteLinks.length === 1)).toBe(true);
  });

  test("refuses a note that does not exist, someone else's note, and someone else's series", async () => {
    const { create, attach, database } = setupAttach({ now });
    const { recurrenceId } = await create.execute(dailyRun, actor);
    const foreign = Note.create({ userId: "someone-else", data: { body: "dele" } });
    database.notes.push(foreign);

    await expect(attach.execute({ recurrenceId, noteIds: ["01HZZZZZZZZZZZZZZZZZZZZZZZ"] }, actor)).rejects.toThrow("Note not found");
    await expect(attach.execute({ recurrenceId, noteIds: [foreign.id] }, actor)).rejects.toThrow("Only the note owner can modify it");
    await expect(attach.execute({ recurrenceId, noteIds: [foreign.id] }, { userId: "someone-else" })).rejects.toThrow(
      RecurrenceOwnershipError,
    );
    await expect(attach.execute({ recurrenceId, noteIds: [] }, actor)).rejects.toThrow("non-empty list");
  });
});
