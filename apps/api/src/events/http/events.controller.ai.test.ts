import { expect, test, vi } from "vitest";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { EventAgentUndecidedError, LlmUnavailableError } from "../errors/event-agent.errors";
import type { EventAgentGateway } from "../gateways/event-agent.gateway";
import type { EventCommandParsingGateway } from "../gateways/event-command-parsing.gateway";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";
import {
  ScriptedEventAgentGateway,
  type ScriptedAgentCall,
} from "../testing/scripted-event-agent.gateway";
import { statusOfThrown } from "../testing/status-of";
import { StubEventCommandParsingGateway } from "../testing/stub-event-command-parsing.gateway";
import { StubMealParsingGateway } from "../testing/stub-meal-parsing.gateway";
import { CreateEventFromTextUseCase } from "../usecases/create-event-from-text.usecase";
import { CreateEventFromTranscriptUseCase } from "../usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "../usecases/create-event.usecase";
import { EventsController } from "./events.controller";

const actor: AuthenticatedUser = { userId: "firebase-user-1" };

function buildController(options: {
  rounds?: ScriptedAgentCall[][];
  agentGateway?: EventAgentGateway;
  parsingGateway?: EventCommandParsingGateway;
}) {
  const eventRepository = new InMemoryEventRepository(new InMemoryEventDatabase());
  const createEvent = new CreateEventUseCase(
    eventRepository,
    new StubMealParsingGateway(),
    new InMemoryWorkoutCatalog(),
  );

  const controller = new EventsController(
    vi.fn() as never,
    createEvent,
    vi.fn() as never,
    new CreateEventFromTextUseCase(
      options.agentGateway ?? new ScriptedEventAgentGateway(options.rounds ?? []),
      createEvent,
    ),
    new CreateEventFromTranscriptUseCase(
      options.parsingGateway ?? new StubEventCommandParsingGateway(),
      createEvent,
    ),
    vi.fn() as never,
    vi.fn() as never,
    vi.fn() as never,
  );

  return { controller, eventRepository };
}

test("POST /api/events/ai creates the event and returns the ids and skills used", async () => {
  const { controller, eventRepository } = buildController({
    rounds: [
      [
        {
          name: "create_training_event",
          args: {
            workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }],
          },
        },
      ],
    ],
  });

  const body = (await controller.fromText(
    { text: "Corri 5 km, por uma hora e meia e queimei 300 calorias" },
    actor,
  )) as { eventIds: string[]; skillsUsed: string[] };

  expect(body.skillsUsed).toEqual(["create_training_event"]);
  expect(body.eventIds).toHaveLength(1);

  const savedEvent = await eventRepository.findById(body.eventIds[0]);
  expect(savedEvent?.items[0].type).toBe("training");
  expect(savedEvent?.userId).toBe("firebase-user-1");
});

test("POST /api/events/ai answers 400 when text is missing or is not a string", async () => {
  const { controller } = buildController({});

  for (const body of [{}, { text: 42 }, { text: null }]) {
    expect(await statusOfThrown(() => controller.fromText(body, actor))).toBe(400);
  }
});

test("POST /api/events/ai answers 422 when the agent could not identify an event", async () => {
  const { controller } = buildController({});

  await expect(controller.fromText({ text: "asdfghjkl" }, actor)).rejects.toThrow(
    new EventAgentUndecidedError().message,
  );
  expect(await statusOfThrown(() => controller.fromText({ text: "asdfghjkl" }, actor))).toBe(422);
});

test("POST /api/events/ai answers 502 when the model provider is unavailable", async () => {
  const { controller } = buildController({
    agentGateway: {
      run: async () => {
        throw new LlmUnavailableError("Falha ao consultar o modelo");
      },
    },
  });

  expect(await statusOfThrown(() => controller.fromText({ text: "Corri 5 km" }, actor))).toBe(502);
});

test("POST /api/events/voice creates the event and returns its id and type", async () => {
  const { controller, eventRepository } = buildController({});

  const body = await controller.fromTranscript({ transcript: "comecei a estudar" }, actor);

  expect(body.primaryItemType).toBe("routine");
  expect((await eventRepository.findById(body.eventId))?.userId).toBe("firebase-user-1");
});

test("POST /api/events/voice answers 400 when the transcript is empty", async () => {
  const { controller } = buildController({});

  expect(await statusOfThrown(() => controller.fromTranscript({ transcript: "   " }, actor))).toBe(
    400,
  );
});

test("POST /api/events/voice answers 502 when the parsing agent fails", async () => {
  const { controller } = buildController({
    parsingGateway: {
      parseCommand: async () => {
        throw new Error("OpenRouter request failed with status 500");
      },
    },
  });

  expect(
    await statusOfThrown(() =>
      controller.fromTranscript({ transcript: "comecei a estudar" }, actor),
    ),
  ).toBe(502);
});
