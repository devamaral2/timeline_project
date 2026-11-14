import { expect, test } from "vitest";
import { Artifact, Event, EventNotFoundError, EventOwnershipError } from "../../domain";
import { InMemoryEventCardQuery } from "../../api-core/events/testing/in-memory-event-card.query";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListSubtasksUseCase } from "./list-subtasks.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

function useCaseOf(events: Event[], artifacts: Artifact[] = []) {
  const database = new InMemoryEventDatabase(events, artifacts);
  return new ListSubtasksUseCase(new InMemoryEventRepository(database), new InMemoryEventCardQuery(database));
}

function event(id: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId: "user-1", name: id, status: "todo", ...overrides });
}

test("lists only the direct subtasks of the event, in the order of the relation", async () => {
  const useCase = useCaseOf([
    event("parent", { longRunning: true, subtaskIds: ["b", "a"] }),
    event("a", { subtaskIds: ["grandchild"] }),
    event("b"),
    event("grandchild"),
    event("unrelated"),
  ]);

  const subtasks = await useCase.execute({ eventId: "parent" }, actor);

  expect(subtasks.map((card) => card.id)).toEqual(["b", "a"]);
  expect(subtasks[0]).toMatchObject({ status: "todo", parentEventIds: ["parent"], revision: 1 });
});

test("returns cards: the artifact types, but neither the artifacts nor the outgoing relations", async () => {
  const note = Artifact.create({ id: "note-1", userId: "user-1", data: { body: "tinta azul" } });
  const useCase = useCaseOf(
    [
      event("parent", { subtaskIds: ["child"] }),
      event("child", { artifactLinks: [{ artifactId: "note-1", relation: "creates", fromRecurrence: false }] }),
    ],
    [note],
  );

  const [card] = await useCase.execute({ eventId: "parent" }, actor);

  expect(card?.artifactTypes).toEqual(["text"]);
  expect(card).not.toHaveProperty("artifacts");
  expect(card).not.toHaveProperty("subtaskEventIds");
});

test("a reference event with a time can be a subtask too", async () => {
  const session = Event.create({ id: "session", userId: "user-1", name: "Sessão", startedAt: new Date("2026-08-17T15:00:00.000Z") });
  const useCase = useCaseOf([event("parent", { longRunning: true, subtaskIds: ["session"] }), session]);

  const [card] = await useCase.execute({ eventId: "parent" }, actor);

  expect(card).toMatchObject({ id: "session", startedAt: "2026-08-17T15:00:00.000Z" });
  expect(card).not.toHaveProperty("status");
});

test("an event without subtasks has an empty list", async () => {
  expect(await useCaseOf([event("parent")]).execute({ eventId: "parent" }, actor)).toEqual([]);
});

test("rejects listing the subtasks of an event that does not exist", async () => {
  await expect(useCaseOf([]).execute({ eventId: "missing" }, actor)).rejects.toBeInstanceOf(EventNotFoundError);
});

test("rejects listing the subtasks of an event owned by another user", async () => {
  const theirs = Event.create({ id: "theirs", userId: "user-2", name: "Reforma", status: "todo", subtaskIds: ["child"] });
  const useCase = useCaseOf([theirs, Event.create({ id: "child", userId: "user-2", name: "Pintar", status: "todo" })]);

  await expect(useCase.execute({ eventId: "theirs" }, actor)).rejects.toBeInstanceOf(EventOwnershipError);
});
