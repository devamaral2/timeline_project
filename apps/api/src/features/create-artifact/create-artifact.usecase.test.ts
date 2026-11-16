import { expect, test } from "vitest";
import { Artifact, ArtifactValidationError, Event, EventNotFoundError, EventOwnershipError } from "../../domain";
import { createEventsKit, type EventsKitOptions } from "../../api-core/events/testing/in-memory-events-kit";
import { CreateArtifactUseCase } from "./create-artifact.usecase";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");

function setup(options: EventsKitOptions = {}) {
  const kit = createEventsKit(options);
  const useCase = new CreateArtifactUseCase(kit.artifactBuilder, kit.eventRepository, kit.batchWriter, () => now);
  return { ...kit, useCase };
}

function event(id: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId: actor.userId, name: id, startedAt: now, ...overrides });
}

test("creates a loose text artifact owned by the actor", async () => {
  const { useCase, artifactRepository, batchWriter } = setup();

  const { artifactId } = await useCase.execute({ data: { body: "Ideias\npara o quintal" }, tags: ["Casa"] }, actor);

  expect(await artifactRepository.findById(artifactId)).toMatchObject({
    id: artifactId,
    userId: "auth-user-1",
    type: "text",
    name: "Ideias",
    tags: ["casa"],
    data: { body: "Ideias\npara o quintal" },
    derived: false,
    revision: 1,
  });
  expect(batchWriter.commits).toHaveLength(1);
  expect(batchWriter.commits[0]?.tasks).toEqual([]);
});

test("a food is born pending, named after the meal of the hour", async () => {
  const { useCase, artifactRepository } = setup();

  const { artifactId } = await useCase.execute({ type: "food", data: { inputText: "arroz e feijão" } }, actor);

  const food = await artifactRepository.findById(artifactId);
  expect(food).toMatchObject({ type: "food", name: "Almoço" });
  expect(food?.data).toMatchObject({ description: "arroz e feijão", items: [], generation: { status: "pending" } });
});

test("the artifact is born appearing in the events asked, created by them, in the same batch", async () => {
  const other = { artifactId: "other", relation: "uses" as const, fromRecurrence: false };
  const { useCase, eventRepository, batchWriter } = setup({
    events: [event("e1", { artifactLinks: [other] }), event("e2"), event("untouched")],
    artifacts: [Artifact.create({ id: "other", userId: actor.userId, data: { body: "outra" } })],
  });

  const { artifactId } = await useCase.execute({ data: { body: "ata" }, taskIds: ["e1", "e2", "e1"] }, actor);

  const link = { artifactId, relation: "creates", fromRecurrence: false };
  expect(batchWriter.commits).toHaveLength(1);
  expect(await eventRepository.findById("e1")).toMatchObject({ artifactLinks: [other, link], revision: 2 });
  expect(await eventRepository.findById("e2")).toMatchObject({ artifactLinks: [link], revision: 2 });
  expect((await eventRepository.findById("untouched"))?.revision).toBe(1);
});

test("appearing in an occurrence of a series detaches it", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { useCase, eventRepository } = setup({ events: [event("e1", { occurrence })] });

  await useCase.execute({ data: { body: "so hoje" }, taskIds: ["e1"] }, actor);

  expect((await eventRepository.findById("e1"))?.occurrence?.detached).toBe(true);
});

test("the artifact is not born when an event does not exist or belongs to someone else", async () => {
  const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt: now });
  const { useCase, database, batchWriter } = setup({ events: [event("e1"), theirs] });

  await expect(useCase.execute({ data: { body: "x" }, taskIds: ["e1", "missing"] }, actor)).rejects.toThrow(EventNotFoundError);
  await expect(useCase.execute({ data: { body: "x" }, taskIds: ["theirs"] }, actor)).rejects.toThrow(EventOwnershipError);
  expect(database.artifacts).toEqual([]);
  expect(database.events.every((stored) => stored.revision === 1)).toBe(true);
  expect(batchWriter.commits).toEqual([]);
});

test("refuses invalid content before touching any event", async () => {
  const { useCase, database } = setup({ events: [event("e1")] });

  await expect(useCase.execute({ data: { body: "  " }, taskIds: ["e1"] }, actor)).rejects.toThrow(ArtifactValidationError);
  await expect(useCase.execute({ type: "food", data: { inputText: "" } }, actor)).rejects.toThrow(
    "Food description cannot be empty",
  );
  expect(database.artifacts).toEqual([]);
});
