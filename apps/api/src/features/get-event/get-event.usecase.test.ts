import { expect, test } from "vitest";
import { GetEventUseCase } from "./get-event.usecase";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { InMemoryNoteRepository } from "../../api-core/notes/testing/in-memory-note.repository";
import { databaseOf, eventWith } from "../../api-core/events/testing/event-fixtures";

function useCaseOf(database: InMemoryEventDatabase) {
  return new GetEventUseCase(new InMemoryEventRepository(database), new InMemoryNoteRepository(database.notes));
}

test("returns the aggregate detail with kind, notes and revision for the event owner", async () => {
  const event = eventWith({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "auth-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
  }, [
    { type: "training", data: { workouts: [{ workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }], caloriesBurned: 420 } },
  ]);
  const useCase = useCaseOf(databaseOf([event]));

  const result = await useCase.execute({ eventId: event.event.id }, { userId: "auth-user-1" });

  expect(result).toMatchObject({
    id: event.event.id,
    name: "Treino",
    revision: 1,
    kind: "training",
    notes: [
      {
        id: event.notes[0].id,
        type: "training",
        schemaVersion: 1,
        data: { workouts: [{ workoutCode: "free", calories: 420, duration: 60 }] },
      },
    ],
  });
  expect(result).not.toHaveProperty("items");
  expect(result).not.toHaveProperty("primaryItemId");
});

test("returns null when the event does not exist", async () => {
  const useCase = useCaseOf(new InMemoryEventDatabase([]));

  const result = await useCase.execute({ eventId: "missing" }, { userId: "auth-user-1" });

  expect(result).toBeNull();
});

test("rejects reading an event that belongs to another user", async () => {
  const event = eventWith({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    userId: "auth-user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-16T22:00:00.000Z"),
    tags: [],
    interruptions: [],
  }, [
    { type: "sleep", data: { score: 70, trackedSleepTime: 420 } },
  ]);
  const useCase = useCaseOf(databaseOf([event]));

  await expect(useCase.execute({ eventId: event.event.id }, { userId: "attacker-1" })).rejects.toThrow(
    "Only the event owner can modify it",
  );
});

test("returns the notes in the order of the links, and hides a deleted note", async () => {
  const fixture = eventWith(
    {
      userId: "auth-user-1",
      name: "Reunião",
      description: "",
      startedAt: new Date("2026-08-16T22:00:00.000Z"),
      tags: [],
      interruptions: [],
    },
    [
      { type: "text", data: { body: "primeira" } },
      { type: "text", data: { body: "segunda" } },
      { type: "text", data: { body: "terceira" } },
    ],
  );
  const database = databaseOf([fixture]);
  // O repositorio em memoria nao tem soft delete: tirar a note da lista equivale a ela nao voltar do banco.
  database.notes.splice(1, 1);

  const result = await useCaseOf(database).execute({ eventId: fixture.event.id }, { userId: "auth-user-1" });

  expect(result?.notes.map((note) => (note.data as { body: string }).body)).toEqual(["primeira", "terceira"]);
});
