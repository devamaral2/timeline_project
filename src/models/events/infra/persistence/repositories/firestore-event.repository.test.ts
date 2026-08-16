import { expect, test } from "vitest";
import { TrainingEvent } from "../../../domain/entities/training-event.entity";
import { FirestoreEventDao } from "../daos/firestore-event.dao";
import { FirestoreEventRepository } from "./firestore-event.repository";

test("rejects an update from someone other than the event owner", async () => {
  const repository = new FirestoreEventRepository({} as FirestoreEventDao);
  const event = TrainingEvent.create({
    userId: "owner-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: { caloriesBurned: 420 },
  });

  await expect(repository.update(event, "other-user")).rejects.toThrow(
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
