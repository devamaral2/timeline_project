import { expect, test } from "vitest";
import { TrainingEvent } from "../../../domain/entities/training-event.entity";
import { FirestoreEventDao } from "../daos/firestore-event.dao";
import { EventDocumentMapper } from "./mappers/event-document.mapper";
import { FirestoreEventRepository } from "./firestore-event.repository";

test("finds the most recently started open event for a user", async () => {
  const previousOpenEvent = TrainingEvent.create({
    id: "01K2TESTOPENPREVIOUS1234567",
    userId: "user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-17T08:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: { workouts: [] },
  });
  const latestOpenEvent = TrainingEvent.create({
    id: "01K2TESTOPENLATEST12345678",
    userId: "user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-17T09:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: { workouts: [] },
  });
  const repository = new FirestoreEventRepository({
    list: async () => [EventDocumentMapper.toPersistence(previousOpenEvent), EventDocumentMapper.toPersistence(latestOpenEvent)],
  } as unknown as FirestoreEventDao);

  await expect(repository.findLatestOpenByUserId("user-1")).resolves.toMatchObject({
    id: latestOpenEvent.id,
  });
});

test("rejects an update from someone other than the event owner", async () => {
  const event = TrainingEvent.create({
    userId: "owner-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });
  const repository = new FirestoreEventRepository({
    findById: async () => EventDocumentMapper.toPersistence(event),
  } as unknown as FirestoreEventDao);

  await expect(repository.update(event, "other-user")).rejects.toThrow(
    "Only the event owner can modify it",
  );
});

test("rejects an update when the submitted event forges the actor as its owner", async () => {
  const storedEvent = TrainingEvent.create({
    userId: "owner-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });
  const repository = new FirestoreEventRepository({
    findById: async () => EventDocumentMapper.toPersistence(storedEvent),
    update: async () => undefined,
  } as unknown as FirestoreEventDao);
  const forgedEvent = TrainingEvent.create({
    id: storedEvent.id,
    userId: "attacker-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });

  await expect(repository.update(forgedEvent, "attacker-1")).rejects.toThrow(
    "Only the event owner can modify it",
  );
});

test("rejects a deletion from someone other than the event owner", async () => {
  const repository = new FirestoreEventRepository({
    findById: async () => ({ userId: "owner-1" }),
  } as unknown as FirestoreEventDao);

  await expect(repository.delete("event-1", "other-user")).rejects.toThrow(
    "Only the event owner can modify it",
  );
});
