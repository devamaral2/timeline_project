import { expect, test, vi } from "vitest";

vi.mock("@/lib/auth/verify-firebase-token", () => ({
  verifyFirebaseToken: async () => ({ userId: "firebase-user-1" }),
}));

import { CreateEventUseCase } from "../../../application/usecases/create-event.usecase";
import { InMemoryEventRepository } from "../../../application/usecases/test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "../../../application/usecases/test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "../../../application/usecases/test-doubles/stub-food-parsing.gateway";
import { SleepEvent } from "../../../domain/entities/sleep-event.entity";
import { CreateEventController } from "./create-event.controller";

test("POST /api/events ignores forbidden create fields from the client payload", async () => {
  const eventRepository = new InMemoryEventRepository();
  const controller = new CreateEventController(
    new CreateEventUseCase(eventRepository, new InMemoryTagRepository(), new StubFoodParsingGateway()),
  );
  const request = new Request("http://localhost/api/events", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify({
      type: "sleep",
      userId: "attacker-1",
      name: "Hack",
      startedAt: "2020-01-01T00:00:00.000Z",
      finishedAt: "2020-01-01T01:00:00.000Z",
      interruptions: [{ name: "Not allowed" }],
    }),
  });

  const response = await controller.handle(request);
  const { eventId } = await response.json();
  const persistedEvent = await eventRepository.findById(eventId);

  expect(response.status).toBe(201);
  expect(persistedEvent).toBeInstanceOf(SleepEvent);
  expect(persistedEvent?.userId).toBe("firebase-user-1");
  expect(persistedEvent?.startedAt.toISOString()).not.toBe("2020-01-01T00:00:00.000Z");
  expect(persistedEvent?.finishedAt).toBeUndefined();
  expect(persistedEvent?.name).toBe("Sono");
  expect(persistedEvent?.interruptions).toEqual([]);
});
