import { describe, expect, test } from "vitest";
import type { CreateRecurrenceInput } from "@repo/contracts";
import {
  Artifact,
  Event,
  EventNotFoundError,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  RecurrenceValidationError,
} from "../../domain";
import type { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { createEventsKit, type EventsKitOptions } from "../../api-core/events/testing/in-memory-events-kit";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { DeleteRecurrenceUseCase } from "../delete-recurrence/delete-recurrence.usecase";
import { GetRecurrenceUseCase } from "../get-recurrence/get-recurrence.usecase";
import { ListRecurrencesUseCase } from "../list-recurrences/list-recurrences.usecase";
import { UpdateRecurrenceUseCase } from "../update-recurrence/update-recurrence.usecase";
import { CreateRecurrenceUseCase } from "./create-recurrence.usecase";

const actor = { userId: "auth-user-1" };
const intruder = { userId: "someone-else" };
// 15/09/2026, 12:00 em Sao Paulo.
const now = new Date("2026-09-15T15:00:00.000Z");

function setup(clock: { now: Date } = { now }, options: EventsKitOptions = {}) {
  const kit = createEventsKit({ clock: () => clock.now, ...options });
  const recurrences = new InMemoryRecurrenceRepository(kit.database);
  const tick = () => clock.now;
  return {
    ...kit,
    recurrences,
    create: new CreateRecurrenceUseCase(recurrences, kit.createEvent, kit.eventRepository),
    update: new UpdateRecurrenceUseCase(recurrences, kit.createEvent, kit.eventRepository, tick),
    remove: new DeleteRecurrenceUseCase(recurrences, tick),
    get: new GetRecurrenceUseCase(recurrences),
    list: new ListRecurrencesUseCase(recurrences),
    materializer: new MaterializeRecurrencesUseCase(recurrences, kit.artifactRepository, tick),
  };
}

const dailyRun: CreateRecurrenceInput = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "07:00",
  durationMinutes: 30,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
  template: { name: "Correr", tags: ["saude"], kind: "common" },
};

function daysOf(database: InMemoryEventDatabase) {
  return database.events.map((event) => event.occurrence?.occurrenceOn).sort();
}

function on(database: InMemoryEventDatabase, day: string): Event {
  return database.events.find((event) => event.occurrence?.occurrenceOn === day) as Event;
}

describe("creating a series", () => {
  test("saves the rule and the resolved template, and generates nothing until someone reads", async () => {
    const { create, get, database } = setup();

    const { recurrenceId } = await create.execute(dailyRun, actor);

    expect(await get.execute({ recurrenceId }, actor)).toEqual({
      id: recurrenceId,
      frequency: "daily",
      interval: 1,
      timeOfDay: "07:00",
      durationMinutes: 30,
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-01",
      template: {
        kind: "common",
        name: "Correr",
        description: "",
        tags: ["saude"],
        priority: "medium",
        notifyOffsetsMinutes: [5],
        artifactIds: [],
        previousEventIds: [],
      },
      revision: 1,
    });
    expect(database.events).toEqual([]);
  });

  test("the new artifacts of the template are saved with the series, and the stored template points to them", async () => {
    const { create, get, database } = setup();

    const { recurrenceId } = await create.execute(
      { ...dailyRun, template: { kind: "sleep", artifacts: [{ type: "sleep", data: { trackedSleepTime: 420 } }] } },
      actor,
    );

    const stored = await get.execute({ recurrenceId }, actor);
    expect(database.artifacts).toHaveLength(1);
    expect(database.artifacts[0]).toMatchObject({ type: "sleep", userId: "auth-user-1" });
    expect(stored?.template).toMatchObject({ name: "Sono", kind: "sleep", artifactIds: [database.artifacts[0]?.id] });
    expect(stored?.template).not.toHaveProperty("artifacts");
  });

  test("a copy of a food in the template is saved with its derivation", async () => {
    const totals = { totalCaloriesKcal: 130, totalProteinGrams: 3, totalCarbohydrateGrams: 28, totalFatGrams: 0, totalFiberGrams: 0 };
    const original = Artifact.create({ id: "food-1", userId: actor.userId, type: "food", name: "Arroz", data: { description: "arroz", items: [], totals } });
    const { create, database } = setup({ now }, { artifacts: [original] });

    await create.execute({ ...dailyRun, timeOfDay: "12:00", template: { artifacts: [{ copyOf: "food-1", quantity: "1 prato" }] } }, actor);

    expect(database.artifacts).toHaveLength(2);
    expect(database.derivations).toEqual([{ originalId: "food-1", copyId: database.artifacts[1]?.id }]);
  });

  test("saves nothing when the series is refused", async () => {
    const { create, database, recurrences } = setup();

    await expect(
      create.execute({ ...dailyRun, frequency: "monthly", byMonthDay: 31, startsOn: "2026-04-01", endsOn: "2026-04-30" }, actor),
    ).rejects.toThrow(RecurrenceValidationError);
    await expect(
      create.execute({ ...dailyRun, template: { name: "Filha", artifacts: [{ data: { body: "nota" } }], previousEventIds: ["missing"] } }, actor),
    ).rejects.toThrow(EventNotFoundError);
    await expect(create.execute({ ...dailyRun, template: {} }, actor)).rejects.toThrow("Event requires a name");
    expect(recurrences.recurrences).toEqual([]);
    expect(database.artifacts).toEqual([]);
  });
});

describe("reading series", () => {
  test("lists only the series of the actor", async () => {
    const { create, list } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);
    await create.execute({ ...dailyRun, startsOn: "2026-08-01", template: { name: "Nadar" } }, actor);
    await create.execute({ ...dailyRun, template: { name: "Deles" } }, intruder);

    const mine = await list.execute(actor);

    expect(mine.map((series) => series.template.name)).toEqual(["Nadar", "Correr"]);
    expect(mine[1]).toMatchObject({ id: recurrenceId, frequency: "daily", revision: 1 });
    expect(mine[1]).not.toHaveProperty("target");
    expect(await list.execute({ userId: "nobody" })).toEqual([]);
  });

  test("a missing series reads as null, and another user's series is refused", async () => {
    const { create, get } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);

    expect(await get.execute({ recurrenceId: "missing" }, actor)).toBeNull();
    await expect(get.execute({ recurrenceId }, intruder)).rejects.toThrow(RecurrenceOwnershipError);
  });

  test("the template that is read is a copy: changing it does not change the series", async () => {
    const { create, get } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);

    const first = await get.execute({ recurrenceId }, actor);
    const tags = first?.template.tags as string[];
    tags.push("alterada");

    expect((await get.execute({ recurrenceId }, actor))?.template.tags).toEqual(["saude"]);
  });
});

describe("editing a series", () => {
  test("regenerates from today on, but keeps the past and the hand-edited occurrences", async () => {
    const clock = { now: new Date("2026-09-10T15:00:00.000Z") };
    const { create, update, materializer, database, recurrences } = setup(clock);
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-20" }, actor);
    await materializer.materialize(actor.userId);

    // O usuario marca a ocorrencia do dia 18 como perdida: ela sai da serie.
    const eighteenth = on(database, "2026-09-18").revise({ status: "missed" });
    database.events = database.events.map((event) => (event.id === eighteenth.id ? eighteenth : event));

    clock.now = now; // dia 15
    await update.execute({ recurrenceId, expectedRevision: 1, timeOfDay: "08:00" }, actor);
    expect(daysOf(database)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-18"]);
    await materializer.materialize(actor.userId);

    const hourOf = (day: string) => on(database, day).startedAt?.toISOString();
    expect(hourOf("2026-09-14")).toBe("2026-09-14T10:00:00.000Z"); // passado, intocado
    expect(hourOf("2026-09-15")).toBe("2026-09-15T11:00:00.000Z"); // regerado as 08:00
    expect(hourOf("2026-09-18")).toBe("2026-09-18T10:00:00.000Z"); // editado a mao, fica
    expect(on(database, "2026-09-18").status).toBe("missed");
    expect(daysOf(database)).toHaveLength(11);
    expect((await recurrences.findById(recurrenceId))?.revision).toBe(2);
  });

  test("changes only the rule fields that were sent and keeps the template", async () => {
    const { create, update, get } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);

    await update.execute({ recurrenceId, expectedRevision: 1, interval: 2, endsOn: "2026-12-31" }, actor);

    expect(await get.execute({ recurrenceId }, actor)).toMatchObject({
      interval: 2,
      endsOn: "2026-12-31",
      timeOfDay: "07:00",
      durationMinutes: 30,
      template: { name: "Correr", tags: ["saude"] },
      revision: 2,
    });
  });

  test("a new template replaces the whole one, artifacts included: the old artifact stays, loose", async () => {
    const clock = { now };
    const { create, update, get, materializer, database } = setup(clock);
    const { recurrenceId } = await create.execute(
      { ...dailyRun, endsOn: "2026-09-17", template: { name: "Correr", artifacts: [{ data: { body: "alongar" } }] } },
      actor,
    );
    await materializer.materialize(actor.userId);
    const [oldNote] = database.artifacts;

    await update.execute(
      { recurrenceId, expectedRevision: 1, template: { name: "Nadar", status: "todo", artifacts: [{ data: { body: "levar touca" } }] } },
      actor,
    );
    await materializer.materialize(actor.userId);

    const [, newNote] = database.artifacts;
    expect(database.artifacts).toHaveLength(2);
    expect(database.artifacts[0]).toBe(oldNote);
    expect((await get.execute({ recurrenceId }, actor))?.template).toMatchObject({
      name: "Nadar",
      status: "todo",
      tags: [],
      artifactIds: [newNote?.id],
    });
    expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
    for (const event of database.events) {
      expect(event).toMatchObject({ name: "Nadar", status: "todo" });
      expect(event.artifactLinks).toEqual([{ artifactId: newNote?.id, relation: "uses", fromRecurrence: true }]);
    }
  });

  test("editing the series leaves the artifacts of a single occurrence alone, and editing one occurrence leaves the series alone", async () => {
    const clock = { now: new Date("2026-09-10T15:00:00.000Z") };
    const { create, update, get, materializer, database } = setup(clock);
    const { recurrenceId } = await create.execute(
      { ...dailyRun, endsOn: "2026-09-20", template: { name: "Correr", artifacts: [{ data: { body: "alongar" } }] } },
      actor,
    );
    await materializer.materialize(actor.userId);
    const [seriesNote] = database.artifacts;

    // So a ocorrencia do dia 18 ganha um artefato proprio: ela deixa de acompanhar a serie.
    const own = Artifact.create({ userId: actor.userId, data: { body: "so hoje: 10 km" } });
    database.artifacts.push(own);
    const before = on(database, "2026-09-18");
    const edited = before.revise({ artifactLinks: [...before.artifactLinks, { artifactId: own.id, relation: "creates", fromRecurrence: false }] });
    database.events = database.events.map((event) => (event.id === edited.id ? edited : event));

    clock.now = now; // dia 15
    await update.execute({ recurrenceId, expectedRevision: 1, timeOfDay: "08:00" }, actor);
    await materializer.materialize(actor.userId);

    // O dia 16 foi regerado e continua com o artefato da serie...
    expect(on(database, "2026-09-16").artifactLinks).toEqual([{ artifactId: seriesNote?.id, relation: "uses", fromRecurrence: true }]);
    // ... e o dia 18, que tinha um artefato so dele, nao foi tocado: continua com os dois.
    expect(on(database, "2026-09-18").artifactLinks).toEqual([
      { artifactId: seriesNote?.id, relation: "uses", fromRecurrence: true },
      { artifactId: own.id, relation: "creates", fromRecurrence: false },
    ]);
    expect(on(database, "2026-09-18").startedAt?.toISOString()).toBe("2026-09-18T10:00:00.000Z");
    // O artefato proprio do dia 18 nao vazou para a serie.
    expect((await get.execute({ recurrenceId }, actor))?.template.artifactIds).toEqual([seriesNote?.id]);
  });

  test("rejects a stale revision without touching the series or its occurrences", async () => {
    const { create, update, materializer, database, recurrences } = setup();
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-17" }, actor);
    await update.execute({ recurrenceId, expectedRevision: 1, interval: 1 }, actor);
    await materializer.materialize(actor.userId);

    await expect(
      update.execute(
        { recurrenceId, expectedRevision: 1, timeOfDay: "08:00", template: { name: "Nadar", artifacts: [{ data: { body: "touca" } }] } },
        actor,
      ),
    ).rejects.toThrow(RecurrenceRevisionConflictError);

    expect((await recurrences.findById(recurrenceId))?.revision).toBe(2);
    expect((await recurrences.findById(recurrenceId))?.rule.timeOfDay).toBe("07:00");
    expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
    expect(database.artifacts).toEqual([]);
  });

  test("refuses a change that makes the series invalid", async () => {
    const { create, update, recurrences } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);

    await expect(update.execute({ recurrenceId, expectedRevision: 1, frequency: "weekly" }, actor)).rejects.toThrow(
      RecurrenceValidationError,
    );
    await expect(update.execute({ recurrenceId, expectedRevision: 1, template: {} }, actor)).rejects.toThrow(
      "Event requires a name",
    );
    expect((await recurrences.findById(recurrenceId))?.revision).toBe(1);
  });
});

describe("deleting a series", () => {
  test("keeps what already happened, without the link to the series", async () => {
    const clock = { now: new Date("2026-09-13T15:00:00.000Z") };
    const { create, remove, materializer, database, recurrences } = setup(clock);
    const { recurrenceId } = await create.execute(
      { ...dailyRun, endsOn: "2026-09-17", template: { name: "Correr", artifacts: [{ data: { body: "alongar" } }] } },
      actor,
    );
    await materializer.materialize(actor.userId);

    clock.now = now;
    await remove.execute({ recurrenceId }, actor);

    expect(await recurrences.findById(recurrenceId)).toBeNull();
    expect(database.events.map((event) => event.startedAt?.toISOString().slice(0, 10))).toEqual(["2026-09-13", "2026-09-14"]);
    for (const event of database.events) {
      expect(event.occurrence).toBeUndefined();
      expect(event.revision).toBe(1);
      // A relacao herdada da serie vira da propria ocorrencia: a serie some, o artefato fica.
      expect(event.artifactLinks).toEqual([{ artifactId: database.artifacts[0]?.id, relation: "uses", fromRecurrence: false }]);
    }
    expect(database.artifacts).toHaveLength(1);
  });

  test("keeps the future occurrences someone edited by hand", async () => {
    const { create, remove, materializer, database } = setup();
    const { recurrenceId } = await create.execute({ ...dailyRun, endsOn: "2026-09-17" }, actor);
    await materializer.materialize(actor.userId);
    const edited = on(database, "2026-09-16").revise({ description: "com a Ana" });
    database.events = database.events.map((event) => (event.id === edited.id ? edited : event));

    await remove.execute({ recurrenceId }, actor);

    expect(database.events.map((event) => event.description)).toEqual(["com a Ana"]);
    expect(database.events[0]?.occurrence).toBeUndefined();
  });

  test("a deleted series is not generated again", async () => {
    const { create, remove, materializer, database } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);

    await remove.execute({ recurrenceId }, actor);
    await materializer.materialize(actor.userId);

    expect(database.events).toEqual([]);
  });
});

describe("ownership", () => {
  test("only the owner edits or deletes a series, and a missing one is not found", async () => {
    const { create, update, remove, recurrences } = setup();
    const { recurrenceId } = await create.execute(dailyRun, actor);

    await expect(update.execute({ recurrenceId, expectedRevision: 1, interval: 2 }, intruder)).rejects.toThrow(
      RecurrenceOwnershipError,
    );
    await expect(remove.execute({ recurrenceId }, intruder)).rejects.toThrow(RecurrenceOwnershipError);
    await expect(update.execute({ recurrenceId: "missing", expectedRevision: 1 }, actor)).rejects.toThrow(RecurrenceNotFoundError);
    await expect(remove.execute({ recurrenceId: "missing" }, actor)).rejects.toThrow(RecurrenceNotFoundError);
    expect((await recurrences.findById(recurrenceId))?.revision).toBe(1);
  });

  test("the previous events of a series template must belong to who creates it", async () => {
    const theirs = Event.create({ id: "theirs", userId: intruder.userId, name: "Projeto deles", longRunning: true });
    const { create } = setup({ now }, { events: [theirs] });

    await expect(create.execute({ ...dailyRun, template: { name: "Sessão", previousEventIds: ["theirs"] } }, actor)).rejects.toThrow(
      "Only the event owner can modify it",
    );
  });
});
