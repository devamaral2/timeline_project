import { expect, test, vi } from "vitest";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventCommandParsingGateway } from "../../api-core/events/gateways/event-command-parsing.gateway";
import { createEventsKit } from "../../api-core/events/testing/in-memory-events-kit";
import { statusOfThrown } from "../../api-core/events/testing/status-of";
import { StubEventCommandParsingGateway } from "../../api-core/events/testing/stub-event-command-parsing.gateway";
import { CreateEventFromTranscriptUseCase } from "./create-event-from-transcript.usecase";
import { EventsController } from "../list-timeline-events/test-events-controller";

const actor: AuthenticatedUser = { userId: "auth-user-1" };

function buildController(options: { parsingGateway?: EventCommandParsingGateway } = {}) {
  const { eventRepository, createEvent } = createEventsKit();

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

test("POST /api/events/voice creates the event and returns its id and kind", async () => {
  const { controller, eventRepository } = buildController();

  const body = await controller.fromTranscript({ transcript: "comecei a estudar" }, actor);

  expect(body.kind).toBe("routine");
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
