import { expect, test } from "vitest";
import { Event, EventNotFoundError, EventOwnershipError } from "../../domain";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { DeleteEventUseCase } from "./delete-event.usecase";

const actor = { userId: "auth-user-1" };

function setup(events: Event[]) {
  const database = new InMemoryEventDatabase(events);
  const repository = new InMemoryEventRepository(database);
  return { database, repository, useCase: new DeleteEventUseCase(repository) };
}

test("deletes the event of its owner", async () => {
  const event = Event.create({ id: "event-1", userId: actor.userId, name: "Reunião", startedAt: new Date() });
  const { database, useCase } = setup([event]);

  await useCase.execute({ eventId: "event-1" }, actor);

  expect(database.events).toEqual([]);
});

test("deleting an event that others follow keeps them, which lose only the sequence edge", async () => {
  const first = Event.create({ id: "first", userId: actor.userId, name: "Reforma", status: "todo" });
  const second = Event.create({ id: "second", userId: actor.userId, name: "Pintar", status: "todo" });
  const { database, repository, useCase } = setup([first, second]);
  database.edges.push({ fromId: "first", toId: "second" });

  await useCase.execute({ eventId: "first" }, actor);

  const remaining = await repository.findById("second");
  expect(remaining?.name).toBe("Pintar");
  expect(remaining?.previousIds).toEqual([]);
  expect(remaining?.revision).toBe(1);
});

test("deleting an event that follows another leaves the first without revising it", async () => {
  const first = Event.create({ id: "first", userId: actor.userId, name: "Reforma", status: "todo" });
  const second = Event.create({ id: "second", userId: actor.userId, name: "Pintar", status: "todo" });
  const { database, repository, useCase } = setup([first, second]);
  database.edges.push({ fromId: "first", toId: "second" });

  await useCase.execute({ eventId: "second" }, actor);

  const remaining = await repository.findById("first");
  expect(remaining?.nextIds).toEqual([]);
  expect(remaining?.revision).toBe(1);
});

test("deleting an event in the middle of a sequence keeps both ends, neither revised", async () => {
  const events = ["a", "b", "c"].map((id) => Event.create({ id, userId: actor.userId, name: id, status: "todo" }));
  const { database, repository, useCase } = setup(events);
  database.edges.push({ fromId: "a", toId: "b" }, { fromId: "b", toId: "c" });

  await useCase.execute({ eventId: "b" }, actor);

  expect(await repository.findById("a")).toMatchObject({ nextIds: [], revision: 1 });
  expect(await repository.findById("c")).toMatchObject({ previousIds: [], revision: 1 });
});

test("refuses an event that does not exist or belongs to someone else", async () => {
  const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt: new Date() });
  const { database, useCase } = setup([theirs]);

  await expect(useCase.execute({ eventId: "missing" }, actor)).rejects.toThrow(EventNotFoundError);
  await expect(useCase.execute({ eventId: "theirs" }, actor)).rejects.toThrow(EventOwnershipError);
  expect(database.events).toHaveLength(1);
});
