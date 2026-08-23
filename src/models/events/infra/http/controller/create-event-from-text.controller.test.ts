import { expect, test, vi } from "vitest";

const verifyFirebaseToken = vi.hoisted(() =>
  vi.fn(async () => ({ userId: "firebase-user-1" })),
);

vi.mock("@/lib/auth/verify-firebase-token", () => ({ verifyFirebaseToken }));

import {
  EventAgentUndecidedError,
  LlmUnavailableError,
} from "../../../application/errors/event-agent.errors";
import { CreateEventFromTextUseCase } from "../../../application/usecases/create-event-from-text.usecase";
import { CreateEventUseCase } from "../../../application/usecases/create-event.usecase";
import { InMemoryEventRepository } from "../../../application/usecases/test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "../../../application/usecases/test-doubles/in-memory-tag.repository";
import { ScriptedEventAgentGateway } from "../../../application/usecases/test-doubles/scripted-event-agent.gateway";
import { StubFoodParsingGateway } from "../../../application/usecases/test-doubles/stub-food-parsing.gateway";
import { TrainingEvent } from "../../../domain/entities/training-event.entity";
import { CreateEventFromTextController } from "./create-event-from-text.controller";
import type { ScriptedAgentCall } from "../../../application/usecases/test-doubles/scripted-event-agent.gateway";

function buildController(rounds: ScriptedAgentCall[][]) {
  const eventRepository = new InMemoryEventRepository();
  const controller = new CreateEventFromTextController(
    new CreateEventFromTextUseCase(
      new ScriptedEventAgentGateway(rounds),
      new CreateEventUseCase(
        eventRepository,
        new InMemoryTagRepository(),
        new StubFoodParsingGateway(),
      ),
    ),
  );
  return { controller, eventRepository };
}

function postText(body: unknown) {
  return new Request("http://localhost/api/events/ai", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

test("creates the event and answers 201 with the ids and skills used", async () => {
  const { controller, eventRepository } = buildController([
    [
      {
        name: "create_training_event",
        args: { workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }] },
      },
    ],
  ]);

  const response = await controller.handle(
    postText({ text: "Corri 5 km, por uma hora e meia e queimei 300 calorias" }),
  );
  const body = await response.json();

  expect(response.status).toBe(201);
  expect(body.skillsUsed).toEqual(["create_training_event"]);
  expect(body.eventIds).toHaveLength(1);

  const savedEvent = await eventRepository.findById(body.eventIds[0]);
  expect(savedEvent).toBeInstanceOf(TrainingEvent);
  expect(savedEvent?.userId).toBe("firebase-user-1");
});

test("answers 400 when text is missing or is not a string", async () => {
  const { controller } = buildController([]);

  for (const body of [{}, { text: 42 }, { text: null }]) {
    expect((await controller.handle(postText(body))).status).toBe(400);
  }
});

test("answers 422 when the agent could not identify an event", async () => {
  const { controller } = buildController([]);

  const response = await controller.handle(postText({ text: "asdfghjkl" }));

  expect(response.status).toBe(422);
  expect((await response.json()).error).toBe(
    new EventAgentUndecidedError().message,
  );
});

test("answers 502 when the model provider is unavailable", async () => {
  const failingGateway = {
    run: async () => {
      throw new LlmUnavailableError("Falha ao consultar o modelo");
    },
  };
  const controller = new CreateEventFromTextController(
    new CreateEventFromTextUseCase(
      failingGateway,
      new CreateEventUseCase(
        new InMemoryEventRepository(),
        new InMemoryTagRepository(),
        new StubFoodParsingGateway(),
      ),
    ),
  );

  const response = await controller.handle(postText({ text: "Corri 5 km" }));

  expect(response.status).toBe(502);
});

test("answers 401 when the token is rejected", async () => {
  verifyFirebaseToken.mockRejectedValueOnce(new Error("Firebase ID token has expired"));
  const { controller } = buildController([]);

  const response = await controller.handle(postText({ text: "Corri 5 km" }));

  expect(response.status).toBe(401);
});
