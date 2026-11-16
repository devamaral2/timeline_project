import { describe, expect, test } from "vitest";
import type { UpdateEventInput } from "@repo/contracts";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventValidationError,
  type FoodData,
} from "../../../domain";
import { eventWith, type EventFixture } from "../testing/event-fixtures";
import { createEventsKit } from "../testing/in-memory-events-kit";
import { mergeEventUpdate, toUpdateBatch } from "./event-update-merger.service";

const userId = "auth-user-1";
const startedAt = new Date("2026-08-17T15:00:00.000Z");
const zeroTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};
const foodData = { description: "arroz branco", items: [], totals: { ...zeroTotals, totalCaloriesKcal: 130 } };

function setup(fixtures: EventFixture[], extra: { events?: Event[]; artifacts?: Artifact[] } = {}) {
  const kit = createEventsKit({
    events: [...fixtures.map((fixture) => fixture.event), ...(extra.events ?? [])],
    artifacts: [...fixtures.flatMap((fixture) => fixture.artifacts), ...(extra.artifacts ?? [])],
  });
  const merge = async (eventId: string, input: Omit<UpdateEventInput, "eventId" | "expectedRevision">) => {
    const existing = (await kit.eventRepository.findById(eventId)) as Event;
    return mergeEventUpdate(
      existing,
      { eventId, expectedRevision: existing.revision, ...input },
      { artifactBuilder: kit.artifactBuilder, artifactRepository: kit.artifactRepository, eventRepository: kit.eventRepository },
    );
  };
  return { ...kit, merge };
}

function meeting(artifacts: Parameters<typeof eventWith>[1] = []): EventFixture {
  return eventWith({ id: "event-1", userId, name: "Reunião", description: "Semanal", startedAt, tags: ["trabalho"] }, artifacts);
}

describe("fields", () => {
  test("changes what was sent, keeps the rest and bumps the revision", async () => {
    const { merge } = setup([meeting()]);

    const { event, artifacts, sequence } = await merge("event-1", {
      name: "Retrospectiva",
      priority: "high",
      tags: ["Time"],
      notifyOffsetsMinutes: [30],
      status: "doing",
      startedAt: "2026-08-18T15:00:00.000Z",
      estimatedFinishAt: "2026-08-18T16:30:00.000Z",
      finishedAt: "2026-08-18T16:10:00.000Z",
    });

    expect(event).toMatchObject({
      id: "event-1",
      name: "Retrospectiva",
      description: "Semanal",
      kind: "common",
      priority: "high",
      tags: ["time"],
      notifyOffsetsMinutes: [30],
      status: "doing",
      revision: 2,
    });
    expect(event.startedAt?.toISOString()).toBe("2026-08-18T15:00:00.000Z");
    expect(event.estimatedFinishAt?.toISOString()).toBe("2026-08-18T16:30:00.000Z");
    expect(event.finishedAt?.toISOString()).toBe("2026-08-18T16:10:00.000Z");
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
    expect(sequence).toEqual([]);
  });

  test("an empty change is still a revision of the event", async () => {
    const { merge } = setup([meeting([{ type: "text", data: { body: "pauta" } }])]);

    const { event } = await merge("event-1", {});

    expect(event.revision).toBe(2);
    expect(event.name).toBe("Reunião");
    expect(event.artifactLinks).toHaveLength(1);
  });

  test("null clears the status and the dates", async () => {
    const tracked = eventWith({
      id: "event-1",
      userId,
      name: "Entregar relatório",
      status: "done",
      startedAt,
      estimatedFinishAt: new Date("2026-08-17T16:00:00.000Z"),
      finishedAt: new Date("2026-08-17T15:50:00.000Z"),
    });
    const { merge } = setup([tracked]);

    const dates = await merge("event-1", { startedAt: null, estimatedFinishAt: null, finishedAt: null });
    const status = await merge("event-1", { status: null });

    expect(dates.event.startedAt).toBeUndefined();
    expect(dates.event.estimatedFinishAt).toBeUndefined();
    expect(dates.event.finishedAt).toBeUndefined();
    expect(dates.event.status).toBe("done");
    expect(status.event.status).toBeUndefined();
    expect(status.event.isReference).toBe(true);
  });

  test("a reference event cannot lose its start", async () => {
    const { merge } = setup([meeting()]);

    await expect(merge("event-1", { startedAt: null })).rejects.toThrow("A reference event requires startedAt");
  });

  test("rejects an invalid date, an unknown kind and an unknown status", async () => {
    const { merge } = setup([meeting()]);

    await expect(merge("event-1", { startedAt: "amanha" })).rejects.toThrow("Invalid date");
    await expect(merge("event-1", { finishedAt: "x" })).rejects.toThrow(EventValidationError);
    await expect(merge("event-1", { kind: "step" as never })).rejects.toThrow("Unknown event kind: step");
    await expect(merge("event-1", { status: "running" as never })).rejects.toThrow("Unknown event status: running");
  });

  test("turns a tracked event into a long-running one", async () => {
    const fixture = eventWith({ id: "event-1", userId, name: "Reforma", status: "todo" });
    const { merge } = setup([fixture]);

    expect((await merge("event-1", { longRunning: true })).event.longRunning).toBe(true);
  });

  test("detaches an occurrence from its series", async () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const { merge } = setup([eventWith({ id: "event-1", userId, name: "Correr", startedAt, occurrence })]);

    expect((await merge("event-1", { description: "na esteira" })).event.occurrence?.detached).toBe(true);
  });
});

describe("list of artifacts", () => {
  const twoNotes = () => meeting([
    { id: "note-1", type: "text", data: { body: "pauta" } },
    { id: "note-2", type: "text", data: { body: "ata" } },
  ]);

  test("absent, the artifacts of the event stay as they are", async () => {
    const { merge } = setup([twoNotes()]);

    const { event, artifacts } = await merge("event-1", { name: "Outra" });

    expect(event.artifactLinks.map((link) => link.artifactId)).toEqual(["note-1", "note-2"]);
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
  });

  test("an entry with only the id keeps the artifact and its relation, without editing it", async () => {
    const { merge } = setup([twoNotes()]);

    const { event, artifacts } = await merge("event-1", { artifacts: [{ id: "note-2" }, { id: "note-1" }] });

    expect(event.artifactLinks).toEqual([
      { artifactId: "note-2", relation: "creates", fromRecurrence: false },
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
    ]);
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
  });

  test("an artifact left out of the list leaves the event but is not deleted", async () => {
    const kit = setup([twoNotes()]);

    const merged = await kit.merge("event-1", { artifacts: [{ id: "note-2" }] });
    await kit.batchWriter.commit(toUpdateBatch(merged, 1));

    expect(merged.event.artifactLinks.map((link) => link.artifactId)).toEqual(["note-2"]);
    expect(kit.database.artifacts.map((artifact) => artifact.id)).toEqual(["note-1", "note-2"]);
    expect((await kit.artifactRepository.findById("note-1"))?.revision).toBe(1);
  });

  test("an empty list removes every artifact from the event", async () => {
    const { merge } = setup([twoNotes()]);

    expect((await merge("event-1", { artifacts: [] })).event.artifactLinks).toEqual([]);
  });

  test("an entry with id and data edits the artifact at the revision that was read", async () => {
    const { merge } = setup([twoNotes()]);

    const { event, artifacts } = await merge("event-1", {
      artifacts: [{ id: "note-1", type: "text", data: { body: "pauta revisada" }, name: "Pauta", tags: ["Time"] }, { id: "note-2" }],
    });

    expect(artifacts.created).toEqual([]);
    expect(artifacts.updated).toHaveLength(1);
    expect(artifacts.updated[0]?.expectedRevision).toBe(1);
    expect(artifacts.updated[0]?.artifact).toMatchObject({
      id: "note-1",
      name: "Pauta",
      tags: ["time"],
      data: { body: "pauta revisada" },
      revision: 2,
    });
    expect(event.artifactLinks.map((link) => link.artifactId)).toEqual(["note-1", "note-2"]);
  });

  test("an entry with id and only a name or tags edits just that", async () => {
    const { merge } = setup([twoNotes()]);

    const { artifacts } = await merge("event-1", { artifacts: [{ id: "note-1", name: "Pauta" }, { id: "note-2", tags: ["ata"] }] });

    expect(artifacts.updated.map(({ artifact }) => [artifact.id, artifact.name, artifact.tags, artifact.data])).toEqual([
      ["note-1", "Pauta", [], { body: "pauta" }],
      ["note-2", "ata", ["ata"], { body: "ata" }],
    ]);
  });

  test("an edited training has its workout names and calories recalculated", async () => {
    const training = eventWith({ id: "event-1", userId, name: "Treino", startedAt }, [
      { id: "training-1", type: "training", data: { workouts: [], caloriesBurned: 0 } },
    ]);
    const { merge } = setup([training]);

    const { artifacts } = await merge("event-1", {
      artifacts: [
        {
          id: "training-1",
          type: "training",
          data: {
            workouts: [{ id: "w1", workoutCode: "free", workoutName: "Qualquer", calories: 200, duration: 30 }],
            caloriesBurned: 9999,
          },
        },
      ],
    });

    expect(artifacts.updated[0]?.artifact.data).toEqual({
      workouts: [{ id: "w1", workoutCode: "free", workoutName: "Livre", calories: 200, duration: 30 }],
      caloriesBurned: 200,
    });
  });

  test("an entry without id creates a new artifact, created by the event unless said otherwise", async () => {
    const { merge } = setup([twoNotes()]);

    const { event, artifacts } = await merge("event-1", {
      artifacts: [
        { id: "note-1" },
        { type: "text", data: { body: "decisões" }, name: "Decisões" },
        { type: "sleep", data: { trackedSleepTime: 400, score: 70 }, relation: "updates" },
      ],
    });

    expect(artifacts.created.map((artifact) => [artifact.type, artifact.name, artifact.userId, artifact.revision])).toEqual([
      ["text", "Decisões", userId, 1],
      ["sleep", "Sono", userId, 1],
    ]);
    expect(event.artifactLinks).toEqual([
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
      { artifactId: artifacts.created[0]?.id, relation: "creates", fromRecurrence: false },
      { artifactId: artifacts.created[1]?.id, relation: "updates", fromRecurrence: false },
    ]);
    expect(artifacts.updated).toEqual([]);
  });

  test("a new artifact requires data, and a new food cannot bring generation metadata", async () => {
    const { merge } = setup([meeting()]);

    await expect(merge("event-1", { artifacts: [{ name: "vazio" } as never] })).rejects.toThrow(
      "A new artifact requires data",
    );
    await expect(
      merge("event-1", { artifacts: [{ type: "food", data: { ...foodData, nutritionSource: "model-estimate" } }] }),
    ).rejects.toThrow("Food generation metadata is server-owned");
    await expect(
      merge("event-1", { artifacts: [{ type: "food", data: { ...foodData, generation: { status: "pending" } } }] }),
    ).rejects.toThrow("Only food creation can schedule the nutrient calculation");
  });

  test("`copyOf` creates a derived copy with the quantity and never touches the original", async () => {
    const original = Artifact.create({ id: "food-1", userId, type: "food", name: "Arroz", data: foodData });
    const { merge } = setup([meeting()], { artifacts: [original] });

    const { event, artifacts } = await merge("event-1", { artifacts: [{ copyOf: "food-1", quantity: "1 prato" }] });

    const [copy] = artifacts.created;
    expect(copy).toMatchObject({ type: "food", name: "Arroz", derived: true, userId });
    expect(copy?.id).not.toBe("food-1");
    expect(copy?.data).toEqual({ ...foodData, quantity: "1 prato" });
    expect(artifacts.derivations).toEqual([{ originalId: "food-1", copyId: copy?.id }]);
    expect(artifacts.updated).toEqual([]);
    expect(event.artifactLinks).toEqual([{ artifactId: copy?.id, relation: "uses", fromRecurrence: false }]);
    expect(original.revision).toBe(1);
  });

  test("an artifact of the user, or a global one, that was not in the event enters as used", async () => {
    const own = Artifact.create({ id: "own-1", userId, data: { body: "checklist" } });
    const global = Artifact.create({ id: "global-1", type: "food", name: "Banana", data: foodData });
    const { merge } = setup([twoNotes()], { artifacts: [own, global] });

    const { event, artifacts } = await merge("event-1", {
      artifacts: [{ id: "note-1" }, { id: "own-1" }, { id: "global-1", relation: "updates" }],
    });

    expect(event.artifactLinks).toEqual([
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
      { artifactId: "own-1", relation: "uses", fromRecurrence: false },
      { artifactId: "global-1", relation: "updates", fromRecurrence: false },
    ]);
    expect(artifacts).toEqual({ created: [], updated: [], derivations: [] });
  });

  test("the relation of an artifact already in the event can be changed", async () => {
    const { merge } = setup([twoNotes()]);

    const { event } = await merge("event-1", { artifacts: [{ id: "note-1", relation: "uses" }] });

    expect(event.artifactLinks).toEqual([{ artifactId: "note-1", relation: "uses", fromRecurrence: false }]);
  });

  test("a link inherited from the series stays from the series, even when the artifact is edited here", async () => {
    const note = Artifact.create({ id: "series-note", userId, data: { body: "alongar" } });
    const own = Artifact.create({ id: "own-note", userId, data: { body: "so hoje" } });
    const occurrence = Event.create({
      id: "event-1",
      userId,
      name: "Correr",
      startedAt,
      artifactLinks: [
        { artifactId: "series-note", relation: "uses", fromRecurrence: true },
        { artifactId: "own-note", relation: "creates", fromRecurrence: false },
      ],
      occurrence: { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false },
    });
    const { merge } = setup([], { events: [occurrence], artifacts: [note, own] });

    const { event, artifacts } = await merge("event-1", {
      artifacts: [{ id: "own-note" }, { id: "series-note", type: "text", data: { body: "alongar 10 min" } }],
    });

    expect(event.artifactLinks).toEqual([
      { artifactId: "own-note", relation: "creates", fromRecurrence: false },
      { artifactId: "series-note", relation: "uses", fromRecurrence: true },
    ]);
    expect(artifacts.updated[0]?.artifact.data).toEqual({ body: "alongar 10 min" });
  });

  test("refuses an artifact that does not exist or belongs to someone else, as id or as copyOf", async () => {
    const theirs = Artifact.create({ id: "theirs", userId: "someone-else", type: "food", name: "Arroz", data: foodData });
    const { merge } = setup([meeting()], { artifacts: [theirs] });

    await expect(merge("event-1", { artifacts: [{ id: "missing" }] })).rejects.toThrow(ArtifactNotFoundError);
    await expect(merge("event-1", { artifacts: [{ copyOf: "missing" }] })).rejects.toThrow("Artifact not found: missing");
    await expect(merge("event-1", { artifacts: [{ id: "theirs" }] })).rejects.toThrow(ArtifactOwnershipError);
    await expect(merge("event-1", { artifacts: [{ copyOf: "theirs" }] })).rejects.toThrow(ArtifactOwnershipError);
  });

  test("a global artifact can be kept in the event but not edited through it", async () => {
    const global = Artifact.create({ id: "global-1", type: "food", name: "Banana", data: foodData });
    const { merge } = setup([meeting()], { artifacts: [global] });

    await expect(merge("event-1", { artifacts: [{ id: "global-1", name: "Minha banana" }] })).rejects.toThrow(
      "A global artifact cannot be edited",
    );
  });

  test("the same artifact cannot be listed twice", async () => {
    const { merge } = setup([twoNotes()]);

    await expect(merge("event-1", { artifacts: [{ id: "note-1" }, { id: "note-1" }] })).rejects.toThrow(
      "Duplicate artifact link: note-1",
    );
  });
});

describe("a meal event always has a food", () => {
  const descriptionOf = (artifact: Artifact | undefined) => (artifact?.data as FoodData | undefined)?.description;

  test("an event that becomes a meal gets a pending food from its description", async () => {
    const { merge } = setup([meeting([{ id: "note-1", type: "text", data: { body: "pauta" } }])]);

    const { event, artifacts } = await merge("event-1", { kind: "meal" });

    const [food] = artifacts.created;
    expect(food).toMatchObject({ type: "food", userId, revision: 1 });
    expect(food?.data).toMatchObject({ description: "Semanal", items: [], generation: { status: "pending" } });
    expect(event.kind).toBe("meal");
    expect(event.artifactLinks).toEqual([
      { artifactId: "note-1", relation: "creates", fromRecurrence: false },
      { artifactId: food?.id, relation: "creates", fromRecurrence: false },
    ]);
  });

  test("the pending food uses the new description, or the name when there is none", async () => {
    const plain = eventWith({ id: "event-1", userId, name: "Lanche", startedAt });
    const { merge } = setup([plain]);

    const described = await merge("event-1", { kind: "meal", description: "  pão com ovo " });
    const named = await merge("event-1", { kind: "meal", name: "Tapioca" });
    const bare = await merge("event-1", { kind: "meal" });

    expect(descriptionOf(described.artifacts.created[0])).toBe("pão com ovo");
    expect(descriptionOf(named.artifacts.created[0])).toBe("Tapioca");
    expect(descriptionOf(bare.artifacts.created[0])).toBe("Lanche");
  });

  test("a meal that already has a food gets no other, whatever is edited", async () => {
    const meal = eventWith({ id: "event-1", userId, name: "Almoço", startedAt }, [{ id: "food-1", type: "food", data: foodData }]);
    const { merge } = setup([meal]);

    const renamed = await merge("event-1", { name: "Almoço de domingo" });
    const kept = await merge("event-1", { artifacts: [{ id: "food-1" }] });

    expect(renamed.event.kind).toBe("meal");
    expect(renamed.artifacts.created).toEqual([]);
    expect(kept.artifacts.created).toEqual([]);
    expect(kept.event.artifactLinks.map((link) => link.artifactId)).toEqual(["food-1"]);
  });

  test("a food that enters through the list counts: new, copied or edited", async () => {
    const meal = eventWith({ id: "event-1", userId, name: "Almoço", startedAt }, [{ id: "food-1", type: "food", data: foodData }]);
    const other = Artifact.create({ id: "food-2", userId, type: "food", name: "Feijão", data: foodData });
    const { merge } = setup([meal], { artifacts: [other] });

    const created = await merge("event-1", { artifacts: [{ type: "food", data: foodData }] });
    const copied = await merge("event-1", { artifacts: [{ copyOf: "food-2" }] });
    const edited = await merge("event-1", { artifacts: [{ id: "food-1", type: "food", data: { ...foodData, description: "arroz integral" } }] });

    expect(created.artifacts.created).toHaveLength(1);
    expect(copied.artifacts.created).toHaveLength(1);
    expect(edited.artifacts.created).toEqual([]);
    expect(edited.event.artifactLinks).toHaveLength(1);
  });

  test("a meal whose foods all left the list gets a new pending one, after what stayed", async () => {
    const meal = eventWith({ id: "event-1", userId, name: "Almoço", description: "feijoada", startedAt }, [
      { id: "food-1", type: "food", data: foodData },
      { id: "note-1", type: "text", data: { body: "estava bom" } },
    ]);
    const { merge } = setup([meal]);

    const { event, artifacts } = await merge("event-1", { artifacts: [{ id: "note-1" }] });

    expect(artifacts.created).toHaveLength(1);
    expect(descriptionOf(artifacts.created[0])).toBe("feijoada");
    expect(event.artifactLinks.map((link) => link.artifactId)).toEqual(["note-1", artifacts.created[0]?.id]);
  });

  test("a meal that stops being one gets no food", async () => {
    const meal = eventWith({ id: "event-1", userId, name: "Almoço", startedAt, kind: "meal" });
    const { merge } = setup([meal]);

    const { event, artifacts } = await merge("event-1", { kind: "common" });

    expect(event.kind).toBe("common");
    expect(artifacts.created).toEqual([]);
  });
});

describe("sequence (what the event follows and what follows it)", () => {
  // p1 -> child -> n1, p2 -> child -> n2, p3 solto.
  function chain() {
    const child = eventWith({ id: "child", userId, name: "Pintar", status: "todo" });
    const other = (id: string) => Event.create({ id, userId, name: id, status: "todo" });
    const kit = setup([child], { events: ["p1", "p2", "p3", "n1", "n2", "n3"].map(other) });
    kit.database.edges.push(
      { fromId: "p1", toId: "child" },
      { fromId: "p2", toId: "child" },
      { fromId: "child", toId: "n1" },
      { fromId: "child", toId: "n2" },
    );
    return kit;
  }

  test("reads the sequence of the event from the database", async () => {
    const { merge } = chain();

    const { event } = await merge("child", { name: "Pintar a sala" });

    expect(event.previousIds).toEqual(["p1", "p2"]);
    expect(event.nextIds).toEqual(["n1", "n2"]);
  });

  test("absent, the sequence does not change", async () => {
    const { merge } = chain();

    const { sequence } = await merge("child", { name: "Pintar a sala" });

    expect(sequence).toEqual([]);
  });

  test("sending the same lists changes nothing", async () => {
    const { merge } = chain();

    const { sequence } = await merge("child", { previousEventIds: ["p2", "p1"], nextEventIds: ["n1", "n2"] });

    expect(sequence).toEqual([]);
  });

  test("plans only the edges that were gained or lost, on either side", async () => {
    const { merge } = chain();

    const { sequence } = await merge("child", { previousEventIds: ["p2", "p3"], nextEventIds: ["n2", "n3"] });

    expect(sequence).toEqual(
      expect.arrayContaining([
        { op: "add", fromId: "p3", toId: "child" },
        { op: "remove", fromId: "p1", toId: "child" },
        { op: "add", fromId: "child", toId: "n3" },
        { op: "remove", fromId: "child", toId: "n1" },
      ]),
    );
    expect(sequence).toHaveLength(4);
  });

  test("an empty list removes every edge of that side and leaves the other side alone", async () => {
    const { merge } = chain();

    const { sequence } = await merge("child", { previousEventIds: [] });

    expect(sequence).toEqual([
      { op: "remove", fromId: "p1", toId: "child" },
      { op: "remove", fromId: "p2", toId: "child" },
    ]);
  });

  test("changing the sequence revises only the edited event, never the ends", async () => {
    const kit = chain();

    const merged = await kit.merge("child", { previousEventIds: ["p3"], nextEventIds: [] });
    await kit.batchWriter.commit(toUpdateBatch(merged, 1));

    const child = await kit.eventRepository.findById("child");
    expect(child?.previousIds).toEqual(["p3"]);
    expect(child?.nextIds).toEqual([]);
    expect(child?.revision).toBe(2);
    for (const id of ["p1", "p2", "p3", "n1", "n2"]) {
      expect((await kit.eventRepository.findById(id))?.revision).toBe(1);
    }
    expect((await kit.eventRepository.findById("p3"))?.nextIds).toEqual(["child"]);
    expect((await kit.eventRepository.findById("p1"))?.nextIds).toEqual([]);
  });

  test("an agent event can be on either end", async () => {
    const child = eventWith({ id: "child", userId, name: "Pintar", status: "todo" });
    const request = Event.create({ id: "request-1", userId, actor: "agent", kind: "request", status: "queued", name: "Pedido" });
    const { merge } = setup([child], { events: [request] });

    const before = await merge("child", { previousEventIds: ["request-1"] });
    const after = await merge("child", { nextEventIds: ["request-1"] });

    expect(before.sequence).toEqual([{ op: "add", fromId: "request-1", toId: "child" }]);
    expect(after.sequence).toEqual([{ op: "add", fromId: "child", toId: "request-1" }]);
  });

  test("refuses an end that does not exist, belongs to someone else or is the event itself", async () => {
    const child = eventWith({ id: "child", userId, name: "Pintar", status: "todo" });
    const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const { merge } = setup([child], { events: [theirs] });

    await expect(merge("child", { previousEventIds: ["missing"] })).rejects.toThrow(EventNotFoundError);
    await expect(merge("child", { nextEventIds: ["theirs"] })).rejects.toThrow(EventOwnershipError);
    await expect(merge("child", { previousEventIds: ["child"] })).rejects.toThrow("An event cannot follow itself");
    await expect(merge("child", { nextEventIds: ["child"] })).rejects.toThrow(EventValidationError);
  });

  test("refuses a change that closes a cycle when it is written", async () => {
    const kit = chain();
    // child -> n1 ja existe: n1 nao pode ser antecessor de child.
    const merged = await kit.merge("child", { previousEventIds: ["p1", "p2", "n1"] });

    expect(() => kit.database.apply(userId, merged.sequence)).toThrow("Events cannot follow each other in a cycle");
  });
});

describe("toUpdateBatch", () => {
  test("carries the event at the expected revision, the artifacts and the sequence, without other events", async () => {
    const original = Artifact.create({ id: "food-1", userId, type: "food", name: "Arroz", data: foodData });
    const parent = Event.create({ id: "parent", userId, name: "Projeto", status: "todo" });
    const kit = setup([meeting([{ id: "note-1", type: "text", data: { body: "pauta" } }])], {
      events: [parent],
      artifacts: [original],
    });
    const merged = await kit.merge("event-1", {
      artifacts: [{ id: "note-1", name: "Pauta" }, { copyOf: "food-1" }],
      previousEventIds: ["parent"],
    });

    const batch = toUpdateBatch(merged, 1);

    expect(batch.userId).toBe(userId);
    expect(batch.artifacts).toEqual([
      { op: "create", entity: merged.artifacts.created[0] },
      { op: "update", entity: merged.artifacts.updated[0]?.artifact, expectedRevision: 1 },
    ]);
    expect(batch.derivations).toEqual([{ originalId: "food-1", copyId: merged.artifacts.created[0]?.id }]);
    expect(batch.events).toEqual([{ op: "update", entity: merged.event, expectedRevision: 1 }]);
    expect(batch.sequence).toEqual([{ op: "add", fromId: "parent", toId: "event-1" }]);
  });
});
