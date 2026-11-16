import { describe, expect, test } from "vitest";
import { Artifact, Event, Recurrence } from "../../domain";
import { toArtifactDto, toArtifactEventLinkDto } from "./artifact.dto";
import { toEventCardDto, toEventDto } from "./event.dto";

const userId = "auth-user-1";
const startedAt = new Date("2026-08-17T15:00:00.000Z");
const rule = { frequency: "daily" as const, interval: 1, timeOfDay: "12:00", timeZone: "America/Sao_Paulo", startsOn: "2026-08-01" };
const series = Recurrence.create({ id: "rec-1", userId, rule, template: { name: "Almoço" } });
const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };

function artifact(id: string, body = id): Artifact {
  return Artifact.rehydrate({
    id,
    userId,
    name: `Nota ${id}`,
    type: "text",
    schemaVersion: 1,
    data: { body },
    tags: ["casa"],
    revision: 2,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
  });
}

describe("toEventCardDto", () => {
  test("maps a reference event as it is stored, without a status", () => {
    const event = Event.create({ id: "event-1", userId, name: "Reunião", description: "Semanal", location: "Sala 3, Av. Paulista, São Paulo", startedAt, tags: ["trabalho"] });

    const card = toEventCardDto({ event, artifactTypes: ["text", "food"] });

    expect(card).toEqual({
      id: "event-1",
      actor: "human",
      kind: "common",
      priority: "medium",
      name: "Reunião",
      description: "Semanal",
      location: "Sala 3, Av. Paulista, São Paulo",
      startedAt: "2026-08-17T15:00:00.000Z",
      estimatedFinishAt: "2026-08-17T16:00:00.000Z",
      finishedAt: undefined,
      longRunning: false,
      notifyOffsetsMinutes: [5],
      tags: ["trabalho"],
      artifactTypes: ["text", "food"],
      previousTaskIds: [],
      revision: 1,
    });
    expect(card).not.toHaveProperty("status");
    expect(card).not.toHaveProperty("recurrence");
    expect(card).not.toHaveProperty("missed");
  });

  test("maps a tracked event without dates, with its status and the events it follows", () => {
    const event = Event.rehydrate({
      id: "event-1",
      userId,
      actor: "human",
      kind: "common",
      status: "inHold",
      priority: "urgent",
      name: "Projeto",
      longRunning: true,
      finishedAt: startedAt,
      previousIds: ["p1", "p2"],
      revision: 4,
    });

    const card = toEventCardDto({ event, artifactTypes: [] });

    expect(card).toMatchObject({
      status: "inHold",
      priority: "urgent",
      longRunning: true,
      finishedAt: "2026-08-17T15:00:00.000Z",
      previousTaskIds: ["p1", "p2"],
      notifyOffsetsMinutes: [],
      revision: 4,
    });
    expect(card.startedAt).toBeUndefined();
    expect(card.estimatedFinishAt).toBeUndefined();
  });

  test("maps an agent event with the agent kind and status", () => {
    const event = Event.create({ userId, actor: "agent", kind: "search_request", status: "waiting", name: "Pesquisar voos" });

    expect(toEventCardDto({ event, artifactTypes: [] })).toMatchObject({
      actor: "agent",
      kind: "search_request",
      status: "waiting",
    });
  });

  test("shows the series of an occurrence, with its rule and whether it was detached", () => {
    const event = Event.create({ userId, name: "Almoço", startedAt, occurrence: { ...occurrence, detached: true } });

    const card = toEventCardDto({ event, artifactTypes: [], recurrence: series });

    expect(card.recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-17", detached: true, rule });
  });

  test("leaves the series out when the event is not an occurrence or the series was not loaded", () => {
    const plain = Event.create({ userId, name: "Almoço", startedAt });
    const orphan = Event.create({ userId, name: "Almoço", startedAt, occurrence });

    expect(toEventCardDto({ event: plain, artifactTypes: [], recurrence: series })).not.toHaveProperty("recurrence");
    expect(toEventCardDto({ event: orphan, artifactTypes: [] })).not.toHaveProperty("recurrence");
  });

  test("the lists of the dto are copies of the lists of the event", () => {
    const event = Event.rehydrate({
      id: "event-1", userId, actor: "human", kind: "common", name: "x", startedAt, previousIds: ["p1"], notifyOffsetsMinutes: [5], revision: 1,
    });

    const card = toEventCardDto({ event, artifactTypes: [] });
    card.previousTaskIds.push("p2");
    card.notifyOffsetsMinutes.push(10);

    expect(event.previousIds).toEqual(["p1"]);
    expect(event.notifyOffsetsMinutes).toEqual([5]);
  });
});

describe("toEventDto", () => {
  const linked = Event.rehydrate({
    id: "event-1",
    userId,
    actor: "human",
    kind: "common",
    name: "Reunião",
    startedAt,
    artifactLinks: [
      { artifactId: "b", relation: "uses", fromRecurrence: true },
      { artifactId: "gone", relation: "creates", fromRecurrence: false },
      { artifactId: "a", relation: "creates", fromRecurrence: false },
    ],
    previousIds: ["p1"],
    nextIds: ["s1", "s2"],
    revision: 1,
  });

  test("returns the artifacts in the order of the links, whatever the order they were loaded in", () => {
    const dto = toEventDto(linked, [artifact("a"), artifact("b")]);

    expect(dto.artifacts.map((entry) => [entry.artifact.id, entry.relation, entry.fromRecurrence])).toEqual([
      ["b", "uses", true],
      ["a", "creates", false],
    ]);
    expect(dto.artifactTypes).toEqual(["text", "text"]);
  });

  test("an artifact that was deleted simply does not appear", () => {
    const dto = toEventDto(linked, [artifact("a")]);

    expect(dto.artifacts.map((entry) => entry.artifact.id)).toEqual(["a"]);
    expect(dto.artifactTypes).toEqual(["text"]);
  });

  test("the artifacts inside an event come without the list of events they appear in", () => {
    const [entry] = toEventDto(linked, [artifact("a", "corpo")]).artifacts;

    expect(entry?.artifact).toEqual({
      id: "a",
      name: "Nota a",
      type: "text",
      schemaVersion: 1,
      data: { body: "corpo" },
      global: false,
      derived: false,
      tags: ["casa"],
      revision: 2,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
    });
  });

  test("adds the events that follow it to the card fields", () => {
    const dto = toEventDto(linked);

    expect(dto).toMatchObject({ id: "event-1", name: "Reunião", previousTaskIds: ["p1"], nextTaskIds: ["s1", "s2"], revision: 1 });
    expect(dto.artifacts).toEqual([]);
    expect(dto.artifactTypes).toEqual([]);
    expect(dto).not.toHaveProperty("recurrence");
  });

  test("includes the series when the event is an occurrence", () => {
    const event = Event.create({ userId, name: "Almoço", startedAt, occurrence });

    expect(toEventDto(event, [], series).recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-17", detached: false, rule });
  });
});

describe("toArtifactDto", () => {
  test("lists the events the artifact appears in when they are given, even if none", () => {
    const withEvents = toArtifactDto(artifact("a"), [
      { eventId: "e1", relation: "creates", name: "Reunião", actor: "human", kind: "common", startedAt, estimatedFinishAt: startedAt },
      { eventId: "e2", relation: "uses", name: "Projeto", actor: "human", kind: "common" },
    ]);

    expect(withEvents.tasks).toEqual([
      {
        taskId: "e1",
        relation: "creates",
        name: "Reunião",
        actor: "human",
        kind: "common",
        startedAt: "2026-08-17T15:00:00.000Z",
        estimatedFinishAt: "2026-08-17T15:00:00.000Z",
      },
      { taskId: "e2", relation: "uses", name: "Projeto", actor: "human", kind: "common" },
    ]);
    expect(toArtifactDto(artifact("a"), []).tasks).toEqual([]);
    expect(toArtifactDto(artifact("a"))).not.toHaveProperty("tasks");
  });

  test("marks global artifacts and derived copies", () => {
    const totals = { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 };
    const global = Artifact.create({ type: "food", name: "Banana", data: { description: "banana", items: [], totals } });
    const copy = global.copyForEvent(userId, "1 unidade");

    expect(toArtifactDto(global)).toMatchObject({ global: true, derived: false, type: "food" });
    expect(toArtifactDto(copy)).toMatchObject({ global: false, derived: true, data: { quantity: "1 unidade" } });
  });

  test("a link without dates has no date keys", () => {
    const link = toArtifactEventLinkDto({ eventId: "e1", relation: "updates", name: "Pedido", actor: "agent", kind: "request" });

    expect(link).toEqual({ taskId: "e1", relation: "updates", name: "Pedido", actor: "agent", kind: "request" });
    expect(link).not.toHaveProperty("startedAt");
  });
});
