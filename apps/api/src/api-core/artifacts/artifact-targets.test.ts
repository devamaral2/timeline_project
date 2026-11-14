import { expect, test } from "vitest";
import { Artifact, Event, EventNotFoundError, EventOwnershipError } from "../../domain";
import { InMemoryEventDatabase } from "../events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../events/testing/in-memory-event.repository";
import { planArtifactLinks, uniqueIds } from "./artifact-targets";

const userId = "auth-user-1";
const startedAt = new Date("2026-08-17T15:00:00.000Z");

function setup(events: Event[]) {
  const artifacts = ["artifact-1", "other"].map((id) => Artifact.create({ id, userId, data: { body: id } }));
  const database = new InMemoryEventDatabase(events, artifacts);
  return { database, events: new InMemoryEventRepository(database) };
}

function event(id: string, artifactIds: string[] = [], overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({
    id,
    userId,
    name: id,
    startedAt,
    artifactLinks: artifactIds.map((artifactId) => ({ artifactId, relation: "creates" as const, fromRecurrence: false })),
    ...overrides,
  });
}

test("plans nothing when the artifact already appears exactly where it should, without reading any event", async () => {
  const neverRead = {
    findByIds: async () => {
      throw new Error("nao deveria ler");
    },
  };

  expect(await planArtifactLinks("artifact-1", ["e1", "e2"], ["e2", "e1"], neverRead, userId)).toEqual([]);
  expect(await planArtifactLinks("artifact-1", [], [], neverRead, userId)).toEqual([]);
});

test("the events that gain the artifact receive it at the end of their list, as used by default", async () => {
  const { events } = setup([event("e1", ["other"]), event("e2")]);

  const changes = await planArtifactLinks("artifact-1", [], ["e1", "e2"], events, userId);

  expect(changes).toHaveLength(2);
  expect(changes[0]).toMatchObject({
    op: "update",
    expectedRevision: 1,
    entity: {
      id: "e1",
      revision: 2,
      artifactLinks: [
        { artifactId: "other", relation: "creates", fromRecurrence: false },
        { artifactId: "artifact-1", relation: "uses", fromRecurrence: false },
      ],
    },
  });
  expect(changes[1]).toMatchObject({
    entity: { id: "e2", artifactLinks: [{ artifactId: "artifact-1", relation: "uses", fromRecurrence: false }] },
  });
});

test("the relation of the new links can be chosen", async () => {
  const { events } = setup([event("e1")]);

  const [change] = await planArtifactLinks("artifact-1", [], ["e1"], events, userId, "creates");

  expect(change).toMatchObject({ entity: { artifactLinks: [{ artifactId: "artifact-1", relation: "creates" }] } });
});

test("the events that leave the list lose the relation and keep their other artifacts", async () => {
  const { events } = setup([event("e1", ["other", "artifact-1"]), event("e2", ["artifact-1"])]);

  const changes = await planArtifactLinks("artifact-1", ["e1", "e2"], ["e2"], events, userId);

  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    op: "update",
    expectedRevision: 1,
    entity: { id: "e1", revision: 2, artifactLinks: [{ artifactId: "other", relation: "creates" }] },
  });
});

test("adds and removes in the same plan, added events first", async () => {
  const { events } = setup([event("e1", ["artifact-1"]), event("e2")]);

  const changes = await planArtifactLinks("artifact-1", ["e1"], ["e2"], events, userId);

  expect(changes.map((change) => (change.op === "update" ? [change.entity.id, change.entity.artifactLinks.length] : []))).toEqual([
    ["e2", 1],
    ["e1", 0],
  ]);
});

test("an occurrence of a series that gains or loses the artifact is detached from the series", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { events } = setup([event("e1", [], { occurrence })]);

  const [change] = await planArtifactLinks("artifact-1", [], ["e1"], events, userId);

  expect(change).toMatchObject({ entity: { occurrence: { ...occurrence, detached: true } } });
});

test("plans without writing anything", async () => {
  const { database, events } = setup([event("e1")]);

  await planArtifactLinks("artifact-1", [], ["e1"], events, userId);

  expect(database.events[0]?.artifactLinks).toEqual([]);
  expect(database.events[0]?.revision).toBe(1);
});

test("every touched event must exist and belong to the user", async () => {
  const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt });
  const { events } = setup([theirs, event("e1")]);

  await expect(planArtifactLinks("artifact-1", [], ["e1", "missing"], events, userId)).rejects.toThrow(EventNotFoundError);
  await expect(planArtifactLinks("artifact-1", [], ["theirs"], events, userId)).rejects.toThrow(EventOwnershipError);
  await expect(planArtifactLinks("artifact-1", ["missing"], [], events, userId)).rejects.toThrow("Event not found: missing");
});

test("an agent event cannot gain an artifact by hand", async () => {
  const request = Event.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { events } = setup([request]);

  await expect(planArtifactLinks("artifact-1", [], ["request"], events, userId)).rejects.toThrow(
    "An agent event cannot be edited",
  );
});

test("uniqueIds removes repeats, keeps the order and treats a missing list as empty", () => {
  expect(uniqueIds(["b", "a", "b"])).toEqual(["b", "a"]);
  expect(uniqueIds(undefined)).toEqual([]);
});
