import { expect, test } from "vitest";
import { Event, EventNotFoundError, EventOwnershipError, EventValidationError } from "../../../domain";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { planSequence } from "./event-sequence";

const userId = "auth-user-1";
const none = { previousIds: [], nextIds: [] };

function eventOf(id: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId, name: id, status: "todo", ...overrides });
}

function repositoryOf(...events: Event[]) {
  return new InMemoryEventRepository(new InMemoryEventDatabase(events));
}

test("plans nothing when no list was sent", async () => {
  const plan = await planSequence("target", { previousIds: ["p1"], nextIds: ["n1"] }, {}, repositoryOf(), userId);

  expect(plan).toEqual([]);
});

test("plans nothing when the lists already match, without reading any event", async () => {
  const neverRead = {
    findByIds: async () => {
      throw new Error("nao deveria ler");
    },
  };

  const plan = await planSequence(
    "target",
    { previousIds: ["p1", "p2"], nextIds: ["n1"] },
    { previousIds: ["p2", "p1"], nextIds: ["n1"] },
    neverRead,
    userId,
  );

  expect(plan).toEqual([]);
});

test("adds an edge from each new predecessor to the event", async () => {
  const events = repositoryOf(eventOf("p1"), eventOf("p2"));

  const plan = await planSequence("target", none, { previousIds: ["p1", "p2"] }, events, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "p1", toId: "target" },
    { op: "add", fromId: "p2", toId: "target" },
  ]);
});

test("adds an edge from the event to each new successor", async () => {
  const events = repositoryOf(eventOf("n1"), eventOf("n2"));

  const plan = await planSequence("target", none, { nextIds: ["n1", "n2"] }, events, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "target", toId: "n1" },
    { op: "add", fromId: "target", toId: "n2" },
  ]);
});

test("removes the edges of the predecessors and successors that left the lists", async () => {
  const plan = await planSequence(
    "target",
    { previousIds: ["p1", "p2"], nextIds: ["n1", "n2"] },
    { previousIds: ["p2"], nextIds: [] },
    repositoryOf(),
    userId,
  );

  expect(plan).toEqual([
    { op: "remove", fromId: "p1", toId: "target" },
    { op: "remove", fromId: "target", toId: "n1" },
    { op: "remove", fromId: "target", toId: "n2" },
  ]);
});

test("replacing a predecessor removes the old edge and adds the new one", async () => {
  const events = repositoryOf(eventOf("p2"));

  const plan = await planSequence("target", { previousIds: ["p1"], nextIds: [] }, { previousIds: ["p2"] }, events, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "p2", toId: "target" },
    { op: "remove", fromId: "p1", toId: "target" },
  ]);
});

test("an absent side is left alone while the other one changes", async () => {
  const events = repositoryOf(eventOf("p2"));

  const plan = await planSequence("target", { previousIds: ["p1"], nextIds: ["n1"] }, { previousIds: ["p1", "p2"] }, events, userId);

  expect(plan).toEqual([{ op: "add", fromId: "p2", toId: "target" }]);
});

test("a repeated id in a desired list plans a single edge", async () => {
  const events = repositoryOf(eventOf("p1"));

  const plan = await planSequence("target", none, { previousIds: ["p1", "p1"] }, events, userId);

  expect(plan).toEqual([{ op: "add", fromId: "p1", toId: "target" }]);
});

test("the same event can be predecessor and successor, each as its own edge", async () => {
  const events = repositoryOf(eventOf("o1"));

  const plan = await planSequence("target", none, { previousIds: ["o1"], nextIds: ["o1"] }, events, userId);

  expect(plan).toEqual([
    { op: "add", fromId: "o1", toId: "target" },
    { op: "add", fromId: "target", toId: "o1" },
  ]);
});

test("plans without revising or writing any event", async () => {
  const database = new InMemoryEventDatabase([eventOf("p1"), eventOf("n1")]);

  const plan = await planSequence("target", none, { previousIds: ["p1"], nextIds: ["n1"] }, new InMemoryEventRepository(database), userId);

  expect(plan).toHaveLength(2);
  expect(plan.every((change) => !("event" in change) && !("expectedRevision" in change))).toBe(true);
  expect(database.events.map((event) => [event.id, event.revision])).toEqual([
    ["p1", 1],
    ["n1", 1],
  ]);
  expect(database.edges).toEqual([]);
});

test("an agent event can be on either end of the sequence", async () => {
  const request = Event.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const events = repositoryOf(request);

  const plan = await planSequence("target", none, { previousIds: ["request"] }, events, userId);
  const reverse = await planSequence("target", none, { nextIds: ["request"] }, events, userId);

  expect(plan).toEqual([{ op: "add", fromId: "request", toId: "target" }]);
  expect(reverse).toEqual([{ op: "add", fromId: "target", toId: "request" }]);
});

test("refuses an event that follows itself", async () => {
  const events = repositoryOf();

  await expect(planSequence("target", none, { previousIds: ["target"] }, events, userId)).rejects.toThrow(
    "An event cannot follow itself",
  );
  await expect(planSequence("target", none, { nextIds: ["target"] }, events, userId)).rejects.toThrow(EventValidationError);
});

test("every new end must exist and belong to the user", async () => {
  const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
  const events = repositoryOf(theirs, eventOf("p1"));

  await expect(planSequence("target", none, { previousIds: ["p1", "missing"] }, events, userId)).rejects.toThrow(
    EventNotFoundError,
  );
  await expect(planSequence("target", none, { nextIds: ["missing"] }, events, userId)).rejects.toThrow(EventNotFoundError);
  await expect(planSequence("target", none, { previousIds: ["theirs"] }, events, userId)).rejects.toThrow(
    EventOwnershipError,
  );
  await expect(planSequence("target", none, { nextIds: ["theirs"] }, events, userId)).rejects.toThrow(EventOwnershipError);
});

test("removing an edge to an end that no longer exists is allowed", async () => {
  const plan = await planSequence("target", { previousIds: ["gone"], nextIds: ["vanished"] }, { previousIds: [], nextIds: [] }, repositoryOf(), userId);

  expect(plan).toEqual([
    { op: "remove", fromId: "gone", toId: "target" },
    { op: "remove", fromId: "target", toId: "vanished" },
  ]);
});
