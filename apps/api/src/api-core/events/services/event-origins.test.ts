import { expect, test } from "vitest";
import { Event, EventNotFoundError, EventOwnershipError, EventValidationError } from "../../../domain";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { planIncomingRelations } from "./event-origins";

const userId = "auth-user-1";
const none = { parentIds: [], blockedByIds: [] };

function origin(id: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId, name: id, status: "todo", ...overrides });
}

function repositoryOf(...events: Event[]) {
  // O evento de destino existe, para que as relacoes que apontam para ele sejam lidas de volta.
  const target = Event.create({ id: "target", userId, name: "Destino", status: "todo" });
  return new InMemoryEventRepository(new InMemoryEventDatabase([target, ...events]));
}

test("plans nothing when no list was sent", async () => {
  const events = repositoryOf(origin("p1", { subtaskIds: ["target"] }));

  const plan = await planIncomingRelations("target", { parentIds: ["p1"], blockedByIds: [] }, {}, events, userId);

  expect(plan).toEqual([]);
});

test("plans nothing when the lists already match, without reading any event", async () => {
  const neverRead = {
    findByIds: async () => {
      throw new Error("nao deveria ler");
    },
  };

  const plan = await planIncomingRelations(
    "target",
    { parentIds: ["p1", "p2"], blockedByIds: ["b1"] },
    { parentIds: ["p2", "p1"], blockedByIds: ["b1"] },
    neverRead,
    userId,
  );

  expect(plan).toEqual([]);
});

test("adds the event at the end of the subtasks and of the blocked events of each new origin", async () => {
  const events = repositoryOf(origin("other"), origin("p1", { subtaskIds: ["other"] }), origin("b1", { blocksIds: ["other"] }));

  const plan = await planIncomingRelations("target", none, { parentIds: ["p1"], blockedByIds: ["b1"] }, events, userId);

  expect(plan.map(({ event, expectedRevision }) => [event.id, event.subtaskIds, event.blocksIds, event.revision, expectedRevision])).toEqual([
    ["p1", ["other", "target"], [], 2, 1],
    ["b1", [], ["other", "target"], 2, 1],
  ]);
});

test("removes the event from the origins that left the lists, keeping their other relations", async () => {
  const events = repositoryOf(
    origin("other"),
    origin("p1", { subtaskIds: ["target", "other"], blocksIds: ["other"] }),
    origin("b1", { blocksIds: ["target"] }),
  );

  const plan = await planIncomingRelations(
    "target",
    { parentIds: ["p1"], blockedByIds: ["b1"] },
    { parentIds: [], blockedByIds: [] },
    events,
    userId,
  );

  expect(plan.map(({ event }) => [event.id, event.subtaskIds, event.blocksIds])).toEqual([
    ["p1", ["other"], ["other"]],
    ["b1", [], []],
  ]);
});

test("leaves alone the origins that stay in the lists", async () => {
  const events = repositoryOf(origin("p1", { subtaskIds: ["target"] }), origin("p2"));

  const plan = await planIncomingRelations(
    "target",
    { parentIds: ["p1"], blockedByIds: [] },
    { parentIds: ["p1", "p2"] },
    events,
    userId,
  );

  expect(plan.map(({ event }) => event.id)).toEqual(["p2"]);
});

test("an origin that changes in both relations is revised once", async () => {
  const events = repositoryOf(origin("o1", { blocksIds: ["target"] }));

  const plan = await planIncomingRelations(
    "target",
    { parentIds: [], blockedByIds: ["o1"] },
    { parentIds: ["o1"], blockedByIds: [] },
    events,
    userId,
  );

  expect(plan).toHaveLength(1);
  expect(plan[0]?.event).toMatchObject({ id: "o1", subtaskIds: ["target"], blocksIds: [], revision: 2 });
  expect(plan[0]?.expectedRevision).toBe(1);
});

test("the expected revision is the one the origin was read at", async () => {
  const stored = Event.rehydrate({ id: "p1", userId, actor: "human", kind: "routine", status: "todo", name: "p1", revision: 7 });
  const events = repositoryOf(stored);

  const [update] = await planIncomingRelations("target", none, { parentIds: ["p1"] }, events, userId);

  expect(update?.expectedRevision).toBe(7);
  expect(update?.event.revision).toBe(8);
});

test("touching an origin counts as editing it: an occurrence is detached from its series", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const events = repositoryOf(origin("p1", { startedAt: new Date("2026-08-17T15:00:00.000Z"), occurrence }));

  const [update] = await planIncomingRelations("target", none, { parentIds: ["p1"] }, events, userId);

  expect(update?.event.occurrence).toEqual({ ...occurrence, detached: true });
});

test("plans without writing anything", async () => {
  const database = new InMemoryEventDatabase([origin("p1")]);

  await planIncomingRelations("target", none, { parentIds: ["p1"] }, new InMemoryEventRepository(database), userId);

  expect(database.events[0]?.revision).toBe(1);
  expect(database.events[0]?.subtaskIds).toEqual([]);
});

test("refuses an event related to itself", async () => {
  const events = repositoryOf();

  await expect(planIncomingRelations("target", none, { parentIds: ["target"] }, events, userId)).rejects.toThrow(
    "An event cannot be related to itself",
  );
  await expect(planIncomingRelations("target", none, { blockedByIds: ["target"] }, events, userId)).rejects.toThrow(
    EventValidationError,
  );
});

test("every origin must exist, belong to the user and be a human event", async () => {
  const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
  const request = Event.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const events = repositoryOf(theirs, request, origin("p1"));

  await expect(planIncomingRelations("target", none, { parentIds: ["p1", "missing"] }, events, userId)).rejects.toThrow(
    EventNotFoundError,
  );
  await expect(planIncomingRelations("target", none, { blockedByIds: ["theirs"] }, events, userId)).rejects.toThrow(
    EventOwnershipError,
  );
  await expect(planIncomingRelations("target", none, { parentIds: ["request"] }, events, userId)).rejects.toThrow(
    "An agent event cannot be edited",
  );
});

test("removing the event from an origin that no longer exists is refused too", async () => {
  const events = repositoryOf();

  await expect(
    planIncomingRelations("target", { parentIds: ["gone"], blockedByIds: [] }, { parentIds: [] }, events, userId),
  ).rejects.toThrow("Event not found: gone");
});
