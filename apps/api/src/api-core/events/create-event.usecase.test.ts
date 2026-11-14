import { describe, expect, test } from "vitest";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactValidationError,
  EntityBatchConflictError,
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventValidationError,
} from "../../domain";
import { parseInstant, toEntityBatch } from "./create-event.usecase";
import { createEventsKit, type EventsKitOptions } from "./testing/in-memory-events-kit";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo: hora de almoco.
const now = new Date("2026-08-17T15:00:00.000Z");
const MINUTE = 60_000;

const zeroTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};
const foodData = { description: "arroz branco", items: [], totals: { ...zeroTotals, totalCaloriesKcal: 130 } };

function setup(options: EventsKitOptions = {}) {
  return createEventsKit({ clock: () => now, ...options });
}

function humanEvent(id: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId: actor.userId, name: id, status: "todo", ...overrides });
}

describe("reference and tracked defaults", () => {
  test("a reference event without a start begins now, with the default duration and notification", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute({ name: "Reunião", tags: ["Trabalho"] }, actor);

    const saved = await kit.eventRepository.findById(eventId);
    expect(eventId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(saved).toMatchObject({
      userId: "auth-user-1",
      actor: "human",
      kind: "routine",
      name: "Reunião",
      description: "",
      priority: "medium",
      tags: ["trabalho"],
      notifyOffsetsMinutes: [5],
      longRunning: false,
      revision: 1,
    });
    expect(saved?.status).toBeUndefined();
    expect(saved?.startedAt).toEqual(now);
    expect(saved?.estimatedFinishAt).toEqual(new Date(now.getTime() + 60 * MINUTE));
    expect(saved?.finishedAt).toBeUndefined();
  });

  test("keeps the window, the conclusion and the fields that were given", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute(
      {
        name: "Consulta",
        description: "Dentista",
        priority: "high",
        startedAt: "2026-08-20T13:00:00.000Z",
        estimatedFinishAt: "2026-08-20T13:40:00.000Z",
        finishedAt: "2026-08-20T13:35:00.000Z",
        notifyOffsetsMinutes: [60, 1440],
      },
      actor,
    );

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved).toMatchObject({ description: "Dentista", priority: "high", notifyOffsetsMinutes: [60, 1440] });
    expect(saved?.startedAt?.toISOString()).toBe("2026-08-20T13:00:00.000Z");
    expect(saved?.estimatedFinishAt?.toISOString()).toBe("2026-08-20T13:40:00.000Z");
    expect(saved?.finishedAt?.toISOString()).toBe("2026-08-20T13:35:00.000Z");
  });

  test("a tracked event may have no dates and gets no default notification", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute({ name: "Declarar imposto", status: "toDefine" }, actor);

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved?.status).toBe("toDefine");
    expect(saved?.startedAt).toBeUndefined();
    expect(saved?.estimatedFinishAt).toBeUndefined();
    expect(saved?.notifyOffsetsMinutes).toEqual([]);
  });

  test("a tracked event keeps its start but gets no estimated finish", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute(
      { name: "Pagar aluguel", status: "todo", startedAt: "2026-09-05T12:00:00.000Z" },
      actor,
    );

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved?.startedAt?.toISOString()).toBe("2026-09-05T12:00:00.000Z");
    expect(saved?.estimatedFinishAt).toBeUndefined();
  });

  test("a long-running event is born todo, without a start", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute({ name: "Reforma", longRunning: true }, actor);

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved).toMatchObject({ longRunning: true, status: "todo", notifyOffsetsMinutes: [] });
    expect(saved?.startedAt).toBeUndefined();
  });

  test("the schedule resolved by the caller overrides the dates of the input", async () => {
    const kit = setup();
    const schedule = {
      startedAt: new Date("2026-08-18T10:00:00.000Z"),
      estimatedFinishAt: new Date("2026-08-18T10:30:00.000Z"),
    };

    const { eventId } = await kit.createEvent.execute(
      { name: "Correr", startedAt: "2026-01-01T00:00:00.000Z", estimatedFinishAt: "2026-01-01T01:00:00.000Z" },
      actor,
      schedule,
    );

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved?.startedAt).toEqual(schedule.startedAt);
    expect(saved?.estimatedFinishAt).toEqual(schedule.estimatedFinishAt);
  });

  test("a schedule without a finish falls back to the finish of the input, then to the default duration", async () => {
    const kit = setup();
    const schedule = { startedAt: new Date("2026-08-18T10:00:00.000Z") };

    const { event } = await kit.createEvent.prepare({ name: "Correr" }, actor, schedule);

    expect(event.estimatedFinishAt).toEqual(new Date("2026-08-18T11:00:00.000Z"));
  });

  test("rejects an invalid date, an unknown kind and an unknown status", async () => {
    const kit = setup();

    await expect(kit.createEvent.execute({ name: "x", startedAt: "amanha" }, actor)).rejects.toThrow("Invalid date");
    await expect(kit.createEvent.execute({ name: "x", kind: "request" as never }, actor)).rejects.toThrow(
      "Unknown event kind: request",
    );
    await expect(kit.createEvent.execute({ name: "x", status: "queued" as never }, actor)).rejects.toThrow(
      "Unknown event status: queued",
    );
    expect(kit.database.events).toEqual([]);
  });

  test("parseInstant translates what came and refuses what is not a date", () => {
    expect(parseInstant(undefined)).toBeUndefined();
    expect(parseInstant("2026-08-17T15:00:00.000Z")).toEqual(now);
    expect(() => parseInstant("ontem")).toThrow(EventValidationError);
  });
});

describe("kind and name", () => {
  test("a routine requires a name", async () => {
    const kit = setup();

    await expect(kit.createEvent.execute({}, actor)).rejects.toThrow("Event requires a name");
    await expect(kit.createEvent.execute({ artifacts: [{ data: { body: "nota" } }] }, actor)).rejects.toThrow(
      "Event requires a name",
    );
  });

  test("infers the kind from the first food, sleep or training artifact", async () => {
    const kit = setup();
    const kindOf = async (artifacts: Parameters<typeof kit.createEvent.prepare>[0]["artifacts"]) =>
      (await kit.createEvent.prepare({ name: "x", artifacts }, actor)).event.kind;

    expect(await kindOf([{ type: "sleep" }])).toBe("sleep");
    expect(await kindOf([{ type: "training" }])).toBe("training");
    expect(await kindOf([{ type: "food", data: { inputText: "banana" } }])).toBe("meal");
    expect(await kindOf([{ data: { body: "nota" } }])).toBe("routine");
    expect(await kindOf([{ data: { body: "nota" } }, { type: "training" }, { type: "sleep" }])).toBe("training");
    expect(await kindOf([])).toBe("routine");
  });

  test("the kind that was given wins over the artifacts", async () => {
    const kit = setup();

    const { event, artifacts } = await kit.createEvent.prepare(
      { name: "Churrasco", kind: "routine", artifacts: [{ type: "food", data: { inputText: "picanha" } }] },
      actor,
    );

    expect(event.kind).toBe("routine");
    expect(artifacts.map((artifact) => artifact.type)).toEqual(["food"]);
  });

  test("sleep and training get the name of their kind, and the duration of it", async () => {
    const kit = setup();

    const sleep = await kit.createEvent.prepare({ artifacts: [{ type: "sleep", data: { trackedSleepTime: 420 } }] }, actor);
    const training = await kit.createEvent.prepare({ kind: "training" }, actor);

    expect(sleep.event.name).toBe("Sono");
    expect(sleep.event.estimatedFinishAt).toEqual(new Date(now.getTime() + 7 * 60 * MINUTE));
    expect(sleep.artifacts[0]?.data).toEqual({ trackedSleepTime: 420, score: 0 });
    expect(training.event.name).toBe("Treino");
    expect(training.event.estimatedFinishAt).toEqual(new Date(now.getTime() + 90 * MINUTE));
    expect(training.artifacts).toEqual([]);
  });

  test("a training artifact resolves the workout names from the global exercises", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute(
      {
        tags: ["Gym"],
        artifacts: [
          { type: "training", data: { workouts: [{ workoutCode: "running", pace: 320, distance: 5, duration: 25, calories: 320 }] } },
        ],
      },
      actor,
    );

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved).toMatchObject({ kind: "training", name: "Treino", tags: ["gym"] });
    expect(saved?.artifactLinks).toEqual([
      { artifactId: kit.database.artifacts[0]?.id, relation: "creates", fromRecurrence: false },
    ]);
    expect(kit.database.artifacts[0]?.data).toMatchObject({
      workouts: [{ workoutCode: "running", workoutName: "Corrida", calories: 320 }],
      caloriesBurned: 320,
    });
  });

  test("a meal is named after the time of day of its start", async () => {
    const kit = setup();

    const lunch = await kit.createEvent.prepare({ kind: "meal" }, actor);
    const dinner = await kit.createEvent.prepare({ kind: "meal", startedAt: "2026-08-17T23:00:00.000Z" }, actor);

    expect(lunch.event.name).toBe("Almoço");
    expect(dinner.event.name).toBe("Jantar");
  });

  test("a meal takes the name of its food when the food has one", async () => {
    const kit = setup();

    const { event } = await kit.createEvent.prepare(
      { artifacts: [{ type: "food", name: "Feijoada", data: { inputText: "feijoada completa" } }] },
      actor,
    );

    expect(event.kind).toBe("meal");
    expect(event.name).toBe("Feijoada");
  });

  test("the name that was given is kept", async () => {
    const kit = setup();

    expect((await kit.createEvent.prepare({ kind: "meal", name: "Aniversário" }, actor)).event.name).toBe("Aniversário");
  });
});

describe("meal events and their food", () => {
  test("a meal event without a food creates a pending one from what the event says", async () => {
    const kit = setup();

    const { eventId } = await kit.createEvent.execute({ kind: "meal", description: "  arroz, feijão e bife  " }, actor);

    const saved = await kit.eventRepository.findById(eventId);
    const [food] = kit.database.artifacts;
    expect(kit.database.artifacts).toHaveLength(1);
    expect(food).toMatchObject({ type: "food", userId: "auth-user-1", name: "Almoço", derived: false, revision: 1 });
    expect(food?.data).toEqual({
      description: "arroz, feijão e bife",
      items: [],
      totals: zeroTotals,
      generation: { status: "pending" },
    });
    expect(saved?.artifactLinks).toEqual([{ artifactId: food?.id, relation: "creates", fromRecurrence: false }]);
    expect(saved?.name).toBe("Almoço");
    expect(saved?.estimatedFinishAt).toEqual(new Date(now.getTime() + 20 * MINUTE));
  });

  test("the pending food describes the name of the event, or the meal of that hour, when there is no description", async () => {
    const kit = setup();

    const named = await kit.createEvent.prepare({ kind: "meal", name: "Pizza com amigos" }, actor);
    const bare = await kit.createEvent.prepare({ kind: "meal" }, actor);

    expect(named.artifacts[0]?.data).toMatchObject({ description: "Pizza com amigos" });
    expect(bare.artifacts[0]?.data).toMatchObject({ description: "Almoço" });
  });

  test("`derivedArtifacts: false` creates no food for the meal", async () => {
    const kit = setup();

    const { event, artifacts } = await kit.createEvent.prepare({ kind: "meal" }, actor, undefined, {
      derivedArtifacts: false,
    });

    expect(event.kind).toBe("meal");
    expect(event.name).toBe("Almoço");
    expect(artifacts).toEqual([]);
    expect(event.artifactLinks).toEqual([]);
  });

  test("a food that comes with the meal is the only one, pending with its own text", async () => {
    const kit = setup();

    const { event, artifacts } = await kit.createEvent.prepare(
      { kind: "meal", description: "almoço de domingo", artifacts: [{ type: "food", data: { inputText: " lasanha " } }] },
      actor,
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.data).toMatchObject({ description: "lasanha", generation: { status: "pending" } });
    expect(event.artifactLinks).toHaveLength(1);
  });

  test("a food without text falls back to what the event says", async () => {
    const kit = setup();

    const { artifacts } = await kit.createEvent.prepare(
      { description: "sopa de legumes", artifacts: [{ type: "food", data: { inputText: "   " } }] },
      actor,
    );

    expect(artifacts[0]?.data).toMatchObject({ description: "sopa de legumes" });
  });

  test("a meal that uses a food that already exists creates no other", async () => {
    const existing = Artifact.create({ userId: actor.userId, type: "food", name: "Arroz", data: foodData });
    const kit = setup({ artifacts: [existing] });

    const { event, artifacts } = await kit.createEvent.prepare({ kind: "meal", artifactIds: [existing.id] }, actor);

    expect(artifacts).toEqual([]);
    expect(event.artifactLinks).toEqual([{ artifactId: existing.id, relation: "uses", fromRecurrence: false }]);
  });

  test("a non-meal event never gets a food on its own", async () => {
    const kit = setup();

    expect((await kit.createEvent.prepare({ name: "Reunião" }, actor)).artifacts).toEqual([]);
  });
});

describe("copy of a food (`copyOf`)", () => {
  test("creates a derived copy with the quantity, records the derivation and never touches the original", async () => {
    const original = Artifact.create({ userId: actor.userId, type: "food", name: "Arroz", data: foodData });
    const kit = setup({ artifacts: [original] });

    const { eventId } = await kit.createEvent.execute(
      { artifacts: [{ copyOf: original.id, quantity: "2 colheres" }] },
      actor,
    );

    const saved = await kit.eventRepository.findById(eventId);
    const copy = kit.database.artifacts.find((artifact) => artifact.id !== original.id);
    expect(kit.database.artifacts).toHaveLength(2);
    expect(copy).toMatchObject({ type: "food", name: "Arroz", derived: true, userId: "auth-user-1", revision: 1 });
    expect(copy?.data).toEqual({ ...foodData, quantity: "2 colheres" });
    expect(kit.database.derivations).toEqual([{ originalId: original.id, copyId: copy?.id }]);
    expect(saved?.artifactLinks).toEqual([{ artifactId: copy?.id, relation: "uses", fromRecurrence: false }]);
    // O evento vira refeicao pela copia, e nao ganha um alimento pendente a mais.
    expect(saved).toMatchObject({ kind: "meal", name: "Arroz" });
    // O original e o mesmo objeto, na mesma revisao, e nao aparece no evento.
    expect(kit.database.artifacts[0]).toBe(original);
    expect(original.revision).toBe(1);
    expect(original.derived).toBe(false);
    expect(original.data).toEqual(foodData);
    expect(kit.batchWriter.commits[0]?.artifacts).toEqual([{ op: "create", entity: copy }]);
  });

  test("copies a global food into a copy owned by the user", async () => {
    const global = Artifact.create({ type: "food", name: "Banana", data: foodData });
    const kit = setup({ artifacts: [global] });

    const { artifacts, derivations } = await kit.createEvent.prepare({ artifacts: [{ copyOf: global.id }] }, actor);

    expect(artifacts[0]).toMatchObject({ userId: "auth-user-1", derived: true });
    expect(artifacts[0]?.data).not.toHaveProperty("quantity");
    expect(derivations).toEqual([{ originalId: global.id, copyId: artifacts[0]?.id }]);
  });

  test("refuses a food that does not exist, someone else's food and an artifact that is not a food", async () => {
    const theirs = Artifact.create({ userId: "someone-else", type: "food", name: "Arroz", data: foodData });
    const note = Artifact.create({ userId: actor.userId, data: { body: "nota" } });
    const kit = setup({ artifacts: [theirs, note] });

    await expect(kit.createEvent.execute({ artifacts: [{ copyOf: "missing" }] }, actor)).rejects.toThrow(
      ArtifactNotFoundError,
    );
    await expect(kit.createEvent.execute({ artifacts: [{ copyOf: theirs.id }] }, actor)).rejects.toThrow(
      ArtifactOwnershipError,
    );
    await expect(kit.createEvent.execute({ name: "x", artifacts: [{ copyOf: note.id }] }, actor)).rejects.toThrow(
      ArtifactValidationError,
    );
    expect(kit.database.events).toEqual([]);
    expect(kit.database.artifacts).toHaveLength(2);
    expect(kit.database.derivations).toEqual([]);
  });
});

describe("artifacts that already exist (`artifactIds`)", () => {
  test("appear in the event after the new ones, as used, without being changed", async () => {
    const own = Artifact.create({ userId: actor.userId, data: { body: "pauta" } });
    const global = Artifact.create({ type: "workout", name: "Corrida", data: { code: "running", category: "cardio" } });
    const kit = setup({ artifacts: [own, global] });

    const { eventId } = await kit.createEvent.execute(
      { name: "Reunião", artifacts: [{ data: { body: "ata" } }], artifactIds: [own.id, global.id] },
      actor,
    );

    const saved = await kit.eventRepository.findById(eventId);
    const created = kit.database.artifacts.find((artifact) => artifact.id !== own.id && artifact.id !== global.id);
    expect(saved?.artifactLinks).toEqual([
      { artifactId: created?.id, relation: "creates", fromRecurrence: false },
      { artifactId: own.id, relation: "uses", fromRecurrence: false },
      { artifactId: global.id, relation: "uses", fromRecurrence: false },
    ]);
    expect(kit.database.artifacts).toHaveLength(3);
    expect(own.revision).toBe(1);
    expect(kit.batchWriter.commits[0]?.artifacts).toEqual([{ op: "create", entity: created }]);
  });

  test("must be owned by the user or global, and must exist", async () => {
    const theirs = Artifact.create({ userId: "someone-else", data: { body: "dele" } });
    const kit = setup({ artifacts: [theirs] });

    await expect(kit.createEvent.execute({ name: "x", artifactIds: [theirs.id] }, actor)).rejects.toThrow(
      ArtifactOwnershipError,
    );
    await expect(kit.createEvent.execute({ name: "x", artifactIds: ["missing"] }, actor)).rejects.toThrow(
      "Artifact not found: missing",
    );
    expect(kit.database.events).toEqual([]);
  });

  test("the same artifact cannot appear twice in the event", async () => {
    const own = Artifact.create({ userId: actor.userId, data: { body: "pauta" } });
    const kit = setup({ artifacts: [own] });

    await expect(kit.createEvent.execute({ name: "x", artifactIds: [own.id, own.id] }, actor)).rejects.toThrow(
      `Duplicate artifact link: ${own.id}`,
    );
  });
});

describe("relations with other events", () => {
  test("stores the outgoing relations on the new event", async () => {
    const kit = setup({ events: [humanEvent("sub-1"), humanEvent("blocked-1")] });

    const { eventId } = await kit.createEvent.execute(
      { name: "Reforma", status: "todo", subtaskEventIds: ["sub-1"], blocksEventIds: ["blocked-1"] },
      actor,
    );

    const saved = await kit.eventRepository.findById(eventId);
    expect(saved?.subtaskIds).toEqual(["sub-1"]);
    expect(saved?.blocksIds).toEqual(["blocked-1"]);
    expect((await kit.eventRepository.findById("sub-1"))?.parentIds).toEqual([eventId]);
    expect((await kit.eventRepository.findById("sub-1"))?.revision).toBe(1);
  });

  test("`parentEventIds` and `blockedByEventIds` revise the origin events in the same batch", async () => {
    const kit = setup({
      events: [humanEvent("older"), humanEvent("parent-1", { subtaskIds: ["older"] }), humanEvent("blocker-1")],
    });

    const { eventId } = await kit.createEvent.execute(
      { name: "Pintar parede", status: "todo", parentEventIds: ["parent-1"], blockedByEventIds: ["blocker-1"] },
      actor,
    );

    const created = await kit.eventRepository.findById(eventId);
    const parent = await kit.eventRepository.findById("parent-1");
    const blocker = await kit.eventRepository.findById("blocker-1");
    // A relacao pertence ao evento de origem: ele e quem muda de revisao.
    expect(parent?.revision).toBe(2);
    expect(parent?.subtaskIds).toEqual(["older", eventId]);
    expect(blocker?.revision).toBe(2);
    expect(blocker?.blocksIds).toEqual([eventId]);
    // O evento novo so le as relacoes que chegam: a revisao dele continua 1.
    expect(created?.revision).toBe(1);
    expect(created?.parentIds).toEqual(["parent-1"]);
    expect(created?.blockedByIds).toEqual(["blocker-1"]);
    expect(created?.subtaskIds).toEqual([]);

    expect(kit.batchWriter.commits).toHaveLength(1);
    expect(kit.batchWriter.commits[0]?.events.map((change) => change.op)).toEqual(["create", "update", "update"]);
    expect(kit.batchWriter.commits[0]?.events.slice(1)).toMatchObject([
      { entity: { id: "parent-1" }, expectedRevision: 1 },
      { entity: { id: "blocker-1" }, expectedRevision: 1 },
    ]);
  });

  test("an origin that is both parent and blocker is revised once", async () => {
    const kit = setup({ events: [humanEvent("origin-1")] });

    const { eventId } = await kit.createEvent.execute(
      { name: "Filha", status: "todo", parentEventIds: ["origin-1"], blockedByEventIds: ["origin-1"] },
      actor,
    );

    const origin = await kit.eventRepository.findById("origin-1");
    expect(origin?.revision).toBe(2);
    expect(origin?.subtaskIds).toEqual([eventId]);
    expect(origin?.blocksIds).toEqual([eventId]);
  });

  test("an origin that is an occurrence of a series is detached from it", async () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const kit = setup({ events: [humanEvent("parent-1", { occurrence })] });

    await kit.createEvent.execute({ name: "Filha", status: "todo", parentEventIds: ["parent-1"] }, actor);

    expect((await kit.eventRepository.findById("parent-1"))?.occurrence).toEqual({ ...occurrence, detached: true });
  });

  test("refuses an origin that does not exist, belongs to someone else or is an agent event", async () => {
    const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const request = Event.create({ id: "request-1", userId: actor.userId, actor: "agent", kind: "request", status: "queued", name: "Pedido" });
    const kit = setup({ events: [theirs, request] });
    const create = (input: { parentEventIds?: string[]; blockedByEventIds?: string[] }) =>
      kit.createEvent.execute({ name: "Filha", status: "todo", ...input }, actor);

    await expect(create({ parentEventIds: ["missing"] })).rejects.toThrow(EventNotFoundError);
    await expect(create({ blockedByEventIds: ["theirs"] })).rejects.toThrow(EventOwnershipError);
    await expect(create({ parentEventIds: ["request-1"] })).rejects.toThrow("An agent event cannot be edited");
    expect(kit.database.events).toHaveLength(2);
    expect(kit.batchWriter.commits).toEqual([]);
  });

  test("nothing is written when an origin changed between preparing and saving", async () => {
    const kit = setup({ events: [humanEvent("parent-1")] });
    const prepared = await kit.createEvent.prepare({ name: "Filha", status: "todo", parentEventIds: ["parent-1"] }, actor);
    const parent = (await kit.eventRepository.findById("parent-1")) as Event;
    await kit.eventRepository.update(parent.revise({ name: "Editado em outra aba" }), actor.userId, 1);

    await expect(kit.createEvent.save(prepared)).rejects.toThrow(EntityBatchConflictError);

    expect(kit.database.events.map((event) => event.id)).toEqual(["parent-1"]);
    expect((await kit.eventRepository.findById("parent-1"))?.subtaskIds).toEqual([]);
  });
});

describe("prepare and toEntityBatch", () => {
  test("prepare writes nothing", async () => {
    const kit = setup({ events: [humanEvent("parent-1")] });

    await kit.createEvent.prepare({ kind: "meal", parentEventIds: ["parent-1"] }, actor);

    expect(kit.database.events).toHaveLength(1);
    expect(kit.database.artifacts).toEqual([]);
    expect(kit.batchWriter.commits).toEqual([]);
  });

  test("the batch creates the artifacts and the event, and updates the origins at the revision they were read", async () => {
    const original = Artifact.create({ userId: actor.userId, type: "food", name: "Arroz", data: foodData });
    const kit = setup({ events: [humanEvent("parent-1")], artifacts: [original] });
    const prepared = await kit.createEvent.prepare(
      { artifacts: [{ copyOf: original.id }], parentEventIds: ["parent-1"] },
      actor,
    );

    const batch = toEntityBatch(prepared);

    expect(batch.userId).toBe("auth-user-1");
    expect(batch.artifacts).toEqual([{ op: "create", entity: prepared.artifacts[0] }]);
    expect(batch.derivations).toEqual([{ originalId: original.id, copyId: prepared.artifacts[0]?.id }]);
    expect(batch.events[0]).toEqual({ op: "create", entity: prepared.event });
    expect(batch.events[1]).toMatchObject({ op: "update", expectedRevision: 1, entity: { id: "parent-1", revision: 2 } });
  });

  test("buildArtifact builds what the event creation would, owned by the actor", async () => {
    const kit = setup();

    const food = await kit.createEvent.buildArtifact({ type: "food", data: { inputText: "banana" } }, actor, now);

    expect(food).toMatchObject({ type: "food", userId: "auth-user-1", name: "Almoço" });
    expect(food.data).toMatchObject({ generation: { status: "pending" } });
    expect(kit.database.artifacts).toEqual([]);
  });
});
