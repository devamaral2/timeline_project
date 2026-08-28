import { BadRequestException } from "@nestjs/common";
import { expect, test, vi } from "vitest";
import type { EventRepository } from "@repo/entities/ports";
import { FoodEvent, SleepEvent, TrainingEvent } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryTagRepository } from "../testing/in-memory-tag.repository";
import { StubFoodParsingGateway } from "../testing/stub-food-parsing.gateway";
import { CreateEventUseCase } from "../usecases/create-event.usecase";
import { GetDailyOverviewUseCase } from "../usecases/get-daily-overview.usecase";
import { ListTimelineEventsUseCase } from "../usecases/list-timeline-events.usecase";
import { UpdateEventUseCase } from "../usecases/update-event.usecase";
import { EventsController } from "./events.controller";

const actor: AuthenticatedUser = { userId: "firebase-user-1" };

/**
 * O controller e instanciado direto: a autenticacao agora e responsabilidade do
 * `FirebaseAuthGuard`, entao aqui o ator ja chega resolvido, como o decorator
 * `@CurrentUser()` faria em producao.
 */
function makeController(overrides: Partial<Record<string, unknown>> = {}) {
  const eventRepository =
    (overrides.eventRepository as InMemoryEventRepository) ?? new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const foodParsing = new StubFoodParsingGateway();

  const controller = new EventsController(
    new ListTimelineEventsUseCase(
      (overrides.listRepository as EventRepository) ?? eventRepository,
    ),
    new CreateEventUseCase(eventRepository, tagRepository, foodParsing),
    new GetDailyOverviewUseCase(eventRepository),
    vi.fn() as never,
    vi.fn() as never,
    vi.fn() as never,
    new UpdateEventUseCase(eventRepository, tagRepository, foodParsing),
    vi.fn() as never,
  );

  return { controller, eventRepository };
}

function makeFoodEvent(userId: string, name: string, startedAt: string, kcal: number) {
  return FoodEvent.create({
    userId,
    name,
    description: "",
    startedAt: new Date(startedAt),
    tags: ["meal"],
    interruptions: [],
    data: {
      inputText: name,
      items: [],
      totals: {
        totalCaloriesKcal: kcal,
        totalProteinGrams: 0,
        totalCarbohydrateGrams: 0,
        totalFatGrams: 0,
        totalFiberGrams: 0,
        totalMicronutrients: {},
      },
      modelProvider: "stub",
      modelName: "stub-model",
      parsedAt: new Date(startedAt),
    },
  });
}

test("POST /api/events ignores forbidden create fields from the client payload", async () => {
  const { controller, eventRepository } = makeController();

  const { eventId } = await controller.create(
    {
      type: "sleep",
      userId: "attacker-1",
      name: "Hack",
      startedAt: "2020-01-01T00:00:00.000Z",
      finishedAt: "2020-01-01T01:00:00.000Z",
      interruptions: [{ name: "Not allowed" }],
    } as never,
    actor,
  );
  const persistedEvent = await eventRepository.findById(eventId);

  expect(persistedEvent).toBeInstanceOf(SleepEvent);
  expect(persistedEvent?.userId).toBe("firebase-user-1");
  expect(persistedEvent?.startedAt.toISOString()).not.toBe("2020-01-01T00:00:00.000Z");
  expect(persistedEvent?.finishedAt).toBeUndefined();
  expect(persistedEvent?.name).toBe("Sono");
  expect(persistedEvent?.interruptions).toEqual([]);
});

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
  const { controller, eventRepository } = makeController({
    eventRepository: new InMemoryEventRepository([event]),
  });

  await controller.update(
    event.id,
    {
      eventId: "different-event-id",
      type: "sleep",
      userId: "attacker-1",
      name: "Updated training",
    } as never,
    actor,
  );

  expect(await eventRepository.findById(event.id)).toMatchObject({
    id: event.id,
    type: "training",
    userId: "firebase-user-1",
    name: "Updated training",
  });
  expect((await eventRepository.findById(event.id))?.startedAt.toISOString()).toBe(
    "2026-08-16T18:00:00.000Z",
  );
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
  const { controller, eventRepository } = makeController({
    eventRepository: new InMemoryEventRepository([event]),
  });

  await controller.update(event.id, { startedAt: "2026-08-16T17:00:00.000Z" } as never, actor);

  expect((await eventRepository.findById(event.id))?.startedAt.toISOString()).toBe(
    "2026-08-16T17:00:00.000Z",
  );
});

test("rejects an invalid timeline date before touching the repository", async () => {
  const listRepository = {
    listTimeline: async () => {
      throw new Error("repository must not be reached");
    },
  } as unknown as EventRepository;
  const { controller } = makeController({ listRepository });

  await expect(controller.list("user-1", "not-a-date")).rejects.toThrow(
    new BadRequestException("Invalid from date"),
  );
});

test("rejects a timeline request without userId", async () => {
  const { controller } = makeController();

  await expect(controller.list(undefined)).rejects.toThrow(
    new BadRequestException("Missing userId"),
  );
});

test("returns only timeline events for the requested userId", async () => {
  const { controller } = makeController({
    eventRepository: new InMemoryEventRepository([
      makeFoodEvent("user-1", "Breakfast", "2026-08-16T08:00:00-03:00", 320),
      makeFoodEvent("user-2", "Lunch", "2026-08-16T12:00:00-03:00", 540),
    ]),
  });

  const events = await controller.list("user-1");

  expect(events).toHaveLength(1);
  expect(events).toMatchObject([{ name: "Breakfast" }]);
});

test("rejects a daily overview request without a date", async () => {
  const { controller } = makeController();

  await expect(controller.daily()).rejects.toThrow(new BadRequestException("date is required"));
});

test("keeps the daily boundary in Sao Paulo", async () => {
  const { controller } = makeController({
    eventRepository: new InMemoryEventRepository([
      makeFoodEvent("user-1", "Late meal", "2026-08-15T23:30:00-03:00", 250),
    ]),
  });

  await expect(controller.daily("2026-08-16")).resolves.toMatchObject({ caloriesConsumed: 0 });
});

/** Um treino aberto, e sem anotacao nenhuma — que e como toda entidade nasce. */
function anOpenTraining() {
  return TrainingEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
    data: { workouts: [] },
  });
}


test("PATCH /api/events/:eventId refuses marks that are not ours", async () => {
  const event = anOpenTraining();
  const { controller, eventRepository } = makeController({
    eventRepository: new InMemoryEventRepository([event]),
  });

  await expect(
    controller.update(event.id, { eventId: event.id, missed: "sim" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);

  // O ciclo de vida da versao anterior ainda e lido dos documentos, mas nao se
  // escreve mais: quem mandar um `status` esta em outra versao do produto, e o
  // campo nem existe no corpo que este controller aceita.
  await expect(
    controller.update(event.id, { eventId: event.id, priority: "altissima" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);

  expect((await eventRepository.findById(event.id))?.missed).toBe(false);
});

test("PATCH /api/events/:eventId stores the mark and the priority the client sent", async () => {
  const event = anOpenTraining();
  const { controller, eventRepository } = makeController({
    eventRepository: new InMemoryEventRepository([event]),
  });

  await controller.update(event.id, { eventId: event.id, missed: true, priority: "urgent" }, actor);

  expect(await eventRepository.findById(event.id)).toMatchObject({
    missed: true,
    priority: "urgent",
  });
});
