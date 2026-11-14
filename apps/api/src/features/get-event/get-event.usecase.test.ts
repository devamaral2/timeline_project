import { expect, test } from "vitest";
import { Event, EventOwnershipError, Recurrence } from "../../domain";
import { databaseOf, eventWith } from "../../api-core/events/testing/event-fixtures";
import { InMemoryArtifactRepository } from "../../api-core/artifacts/testing/in-memory-artifact.repository";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { GetEventUseCase } from "./get-event.usecase";

const actor = { userId: "auth-user-1" };
const startedAt = new Date("2026-08-16T18:00:00.000Z");

function setup(database: InMemoryEventDatabase) {
  const recurrences = new InMemoryRecurrenceRepository(database);
  const useCase = new GetEventUseCase(
    new InMemoryEventRepository(database),
    new InMemoryArtifactRepository(database.artifacts),
    recurrences,
  );
  return { useCase, recurrences };
}

test("returns the event with its kind, artifacts and revision for the owner", async () => {
  const fixture = eventWith(
    { id: "event-1", userId: actor.userId, name: "Treino", description: "Gym session", startedAt, tags: ["gym"] },
    [{ id: "training-1", type: "training", data: { workouts: [{ workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }], caloriesBurned: 420 } }],
  );
  const { useCase } = setup(databaseOf([fixture]));

  const result = await useCase.execute({ eventId: "event-1" }, actor);

  expect(result).toMatchObject({
    id: "event-1",
    actor: "human",
    kind: "training",
    name: "Treino",
    description: "Gym session",
    tags: ["gym"],
    startedAt: "2026-08-16T18:00:00.000Z",
    estimatedFinishAt: "2026-08-16T19:30:00.000Z",
    longRunning: false,
    revision: 1,
    artifactTypes: ["training"],
    artifacts: [
      {
        relation: "creates",
        fromRecurrence: false,
        artifact: {
          id: "training-1",
          type: "training",
          schemaVersion: 1,
          data: { workouts: [{ workoutCode: "free", calories: 420, duration: 60 }], caloriesBurned: 420 },
        },
      },
    ],
    subtaskEventIds: [],
    blocksEventIds: [],
    parentEventIds: [],
    blockedByEventIds: [],
  });
  expect(result).not.toHaveProperty("status");
  expect(result).not.toHaveProperty("notes");
  expect(result?.artifacts[0]?.artifact).not.toHaveProperty("events");
});

test("returns null when the event does not exist", async () => {
  const { useCase } = setup(new InMemoryEventDatabase());

  expect(await useCase.execute({ eventId: "missing" }, actor)).toBeNull();
});

test("rejects reading an event that belongs to another user", async () => {
  const fixture = eventWith({ id: "event-1", userId: actor.userId, name: "Sono", startedAt }, [
    { type: "sleep", data: { score: 70, trackedSleepTime: 420 } },
  ]);
  const { useCase } = setup(databaseOf([fixture]));

  await expect(useCase.execute({ eventId: "event-1" }, { userId: "attacker-1" })).rejects.toThrow(EventOwnershipError);
});

test("returns the artifacts in the order of the links, and hides a deleted one", async () => {
  const fixture = eventWith({ id: "event-1", userId: actor.userId, name: "Reunião", startedAt }, [
    { type: "text", data: { body: "primeira" } },
    { type: "text", data: { body: "segunda" } },
    { type: "text", data: { body: "terceira" } },
  ]);
  const database = databaseOf([fixture]);
  // O repositorio em memoria nao tem soft delete: tirar o artefato da lista equivale a ele nao voltar do banco.
  database.artifacts.splice(1, 1);

  const result = await setup(database).useCase.execute({ eventId: "event-1" }, actor);

  expect(result?.artifacts.map((entry) => (entry.artifact.data as { body: string }).body)).toEqual(["primeira", "terceira"]);
  expect(result?.artifactTypes).toEqual(["text", "text"]);
});

test("returns the relations in both directions: the ones the event owns and the ones that arrive at it", async () => {
  const child = Event.create({ id: "child", userId: actor.userId, name: "Pintar", status: "todo", blocksIds: ["later"] });
  const later = Event.create({ id: "later", userId: actor.userId, name: "Mobiliar", status: "todo" });
  const parent = Event.create({ id: "parent", userId: actor.userId, name: "Reforma", longRunning: true, subtaskIds: ["child"] });
  const { useCase } = setup(new InMemoryEventDatabase([child, later, parent]));

  const detail = await useCase.execute({ eventId: "child" }, actor);
  const blocked = await useCase.execute({ eventId: "later" }, actor);
  const project = await useCase.execute({ eventId: "parent" }, actor);

  expect(detail).toMatchObject({ status: "todo", parentEventIds: ["parent"], blocksEventIds: ["later"], subtaskEventIds: [] });
  expect(blocked?.blockedByEventIds).toEqual(["child"]);
  expect(project).toMatchObject({ longRunning: true, status: "todo", subtaskEventIds: ["child"], parentEventIds: [] });
  expect(project?.startedAt).toBeUndefined();
});

test("an occurrence comes with the rule of its series", async () => {
  const rule = { frequency: "daily" as const, interval: 1, timeOfDay: "15:00", timeZone: "America/Sao_Paulo", startsOn: "2026-08-01" };
  const series = Recurrence.create({ id: "rec-1", userId: actor.userId, rule, template: { name: "Correr" } });
  const occurrence = Event.create({
    id: "event-1",
    userId: actor.userId,
    name: "Correr",
    startedAt,
    occurrence: { recurrenceId: "rec-1", occurrenceOn: "2026-08-16", detached: false },
  });
  const { useCase, recurrences } = setup(new InMemoryEventDatabase([occurrence]));
  await recurrences.save(series);

  const result = await useCase.execute({ eventId: "event-1" }, actor);

  expect(result?.recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-16", detached: false, rule });
});

test("an occurrence whose series is gone comes without it", async () => {
  const occurrence = Event.create({
    id: "event-1",
    userId: actor.userId,
    name: "Correr",
    startedAt,
    occurrence: { recurrenceId: "rec-gone", occurrenceOn: "2026-08-16", detached: true },
  });
  const { useCase } = setup(new InMemoryEventDatabase([occurrence]));

  expect(await useCase.execute({ eventId: "event-1" }, actor)).not.toHaveProperty("recurrence");
});
