import { expect, test, vi } from "vitest";

vi.mock("@/lib/auth/verify-firebase-token", () => ({
  verifyFirebaseToken: async (token: string) => {
    if (token !== "test-token") throw new Error("Invalid token");
    return { userId: "firebase-user-1" };
  },
}));

import { CreateEventFromTranscriptUseCase } from "../../../application/usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "../../../application/usecases/create-event.usecase";
import { InMemoryEventRepository } from "../../../application/usecases/test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "../../../application/usecases/test-doubles/in-memory-tag.repository";
import { StubEventCommandParsingGateway } from "../../../application/usecases/test-doubles/stub-event-command-parsing.gateway";
import { StubFoodParsingGateway } from "../../../application/usecases/test-doubles/stub-food-parsing.gateway";
import type { EventCommandParsingGateway } from "../../../application/contracts/event-command-parsing.gateway";
import { CreateEventFromTranscriptController } from "./create-event-from-transcript.controller";

function makeController(
  parsingGateway: EventCommandParsingGateway = new StubEventCommandParsingGateway(),
): { controller: CreateEventFromTranscriptController; eventRepository: InMemoryEventRepository } {
  const eventRepository = new InMemoryEventRepository();
  const controller = new CreateEventFromTranscriptController(
    new CreateEventFromTranscriptUseCase(
      parsingGateway,
      new CreateEventUseCase(
        eventRepository,
        new InMemoryTagRepository(),
        new StubFoodParsingGateway(),
      ),
    ),
  );
  return { controller, eventRepository };
}

function aRequest(body: unknown, token = "test-token"): Request {
  return new Request("http://localhost/api/events/voice", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

test("creates the event and answers with its id and type", async () => {
  const { controller, eventRepository } = makeController();

  const response = await controller.handle(aRequest({ transcript: "comecei a estudar" }));
  const body = await response.json();
  const persistedEvent = await eventRepository.findById(body.eventId);

  expect(response.status).toBe(201);
  expect(body.type).toBe("routine");
  expect(persistedEvent?.userId).toBe("firebase-user-1");
});

test("answers 400 when the transcript is empty", async () => {
  const { controller } = makeController();

  const response = await controller.handle(aRequest({ transcript: "   " }));

  expect(response.status).toBe(400);
});

test("answers 401 without a bearer token", async () => {
  const { controller } = makeController();
  const request = new Request("http://localhost/api/events/voice", {
    method: "POST",
    body: JSON.stringify({ transcript: "comecei a estudar" }),
  });

  const response = await controller.handle(request);

  expect(response.status).toBe(401);
});

test("answers 502 when the parsing agent fails", async () => {
  const failingGateway: EventCommandParsingGateway = {
    parseCommand: async () => {
      throw new Error("OpenRouter request failed with status 500");
    },
  };
  const { controller } = makeController(failingGateway);

  const response = await controller.handle(aRequest({ transcript: "comecei a estudar" }));

  expect(response.status).toBe(502);
});
