import { expect, test, vi } from "vitest";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import type { EventCommandParsingGateway } from "../gateways/event-command-parsing.gateway";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";
import { statusOfThrown } from "../testing/status-of";
import { StubEventCommandParsingGateway } from "../testing/stub-event-command-parsing.gateway";
import { StubMealParsingGateway } from "../testing/stub-meal-parsing.gateway";
import { CreateEventFromTranscriptUseCase } from "../usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "../usecases/create-event.usecase";
import { EventsController } from "./events.controller";

const actor: AuthenticatedUser = { userId: "auth-user-1" };

function buildController(options: { parsingGateway?: EventCommandParsingGateway } = {}) {
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

test("POST /api/events/voice creates the event and returns its id and type", async () => {
  const { controller, eventRepository } = buildController();

  const body = await controller.fromTranscript({ transcript: "comecei a estudar" }, actor);

  expect(body.primaryItemType).toBe("routine");
  expect((await eventRepository.findById(body.eventId))?.userId).toBe("auth-user-1");
});

test("POST /api/events/voice answers 400 when the transcript is empty", async () => {
  const { controller } = buildController();

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
