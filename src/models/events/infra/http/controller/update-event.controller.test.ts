import { expect, test, vi } from "vitest";

vi.mock("@/lib/auth/verify-firebase-token", () => ({
  verifyFirebaseToken: async () => ({ userId: "firebase-user-1" }),
}));

import { UpdateEventUseCase } from "../../../application/usecases/update-event.usecase";
import { InMemoryEventRepository } from "../../../application/usecases/test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "../../../application/usecases/test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "../../../application/usecases/test-doubles/stub-food-parsing.gateway";
import { TrainingEvent } from "../../../domain/entities/training-event.entity";
import { UpdateEventController } from "./update-event.controller";

test("PATCH /api/events/:eventId keeps server-owned fields when they are sent by the client", async () => {
  const event = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
    data: { workouts: [] },
  });
  const eventRepository = new InMemoryEventRepository([event]);
  const controller = new UpdateEventController(
    new UpdateEventUseCase(eventRepository, new InMemoryTagRepository(), new StubFoodParsingGateway()),
  );
  const request = new Request(`http://localhost/api/events/${event.id}`, {
    method: "PATCH",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify({
      eventId: "different-event-id",
      type: "sleep",
      userId: "attacker-1",
      name: "Updated training",
    }),
  });

  const response = await controller.handle(request, { params: Promise.resolve({ eventId: event.id }) });
  const persistedEvent = await eventRepository.findById(event.id);

  expect(response.status).toBe(204);
  expect(persistedEvent).toMatchObject({
    id: event.id,
    type: "training",
    userId: "firebase-user-1",
    name: "Updated training",
  });
  expect(persistedEvent?.startedAt.toISOString()).toBe("2026-08-16T18:00:00.000Z");
});

test("PATCH /api/events/:eventId updates startedAt when the client sends it", async () => {
  const event = TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
    data: { workouts: [] },
  });
  const eventRepository = new InMemoryEventRepository([event]);
  const controller = new UpdateEventController(
    new UpdateEventUseCase(eventRepository, new InMemoryTagRepository(), new StubFoodParsingGateway()),
  );
  const request = new Request(`http://localhost/api/events/${event.id}`, {
    method: "PATCH",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify({ startedAt: "2026-08-16T17:00:00.000Z" }),
  });

  const response = await controller.handle(request, { params: Promise.resolve({ eventId: event.id }) });
  const persistedEvent = await eventRepository.findById(event.id);

  expect(response.status).toBe(204);
  expect(persistedEvent?.startedAt.toISOString()).toBe("2026-08-16T17:00:00.000Z");
});
