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

test("deleting the larger event keeps its subtasks, which lose only the relation", async () => {
  const parent = Event.create({ id: "parent", userId: actor.userId, name: "Reforma", longRunning: true, subtaskIds: ["child"] });
  const child = Event.create({ id: "child", userId: actor.userId, name: "Pintar", status: "todo" });
  const { repository, useCase } = setup([parent, child]);

  await useCase.execute({ eventId: "parent" }, actor);

  const remaining = await repository.findById("child");
  expect(remaining?.name).toBe("Pintar");
  expect(remaining?.parentIds).toEqual([]);
  expect(remaining?.revision).toBe(1);
});

test("deleting a subtask removes it from the larger event without revising it", async () => {
  const parent = Event.create({ id: "parent", userId: actor.userId, name: "Reforma", longRunning: true, subtaskIds: ["child"] });
  const child = Event.create({ id: "child", userId: actor.userId, name: "Pintar", status: "todo" });
  const { repository, useCase } = setup([parent, child]);

  await useCase.execute({ eventId: "child" }, actor);

  const remaining = await repository.findById("parent");
  expect(remaining?.subtaskIds).toEqual([]);
  expect(remaining?.revision).toBe(1);
});

test("refuses an event that does not exist or belongs to someone else", async () => {
  const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt: new Date() });
  const { database, useCase } = setup([theirs]);

  await expect(useCase.execute({ eventId: "missing" }, actor)).rejects.toThrow(EventNotFoundError);
  await expect(useCase.execute({ eventId: "theirs" }, actor)).rejects.toThrow(EventOwnershipError);
  expect(database.events).toHaveLength(1);
});
