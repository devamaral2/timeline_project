import { BadRequestException } from "@nestjs/common";
import { expect, test, vi } from "vitest";
import { Event, EventItem, calculateMealTotals } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryDailyOverviewQuery } from "../testing/in-memory-daily-overview.query";
import { InMemoryTimelineEventQuery } from "../testing/in-memory-timeline-event.query";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";
import { StubMealParsingGateway } from "../testing/stub-meal-parsing.gateway";
import { CreateEventUseCase } from "../usecases/create-event.usecase";
import { GetDailyOverviewUseCase } from "../usecases/get-daily-overview.usecase";
import { ListTimelineEventsUseCase } from "../usecases/list-timeline-events.usecase";
import { UpdateEventUseCase } from "../usecases/update-event.usecase";
import { EventsController } from "./events.controller";

const actor: AuthenticatedUser = { userId: "firebase-user-1" };

/**
 * O controller e instanciado direto: a autenticacao agora e responsabilidade do
 * `FirebaseAuthGuard`, entao aqui o ator ja chega resolvido, como o decorator
 * `@CurrentUser()` faria em producao — as rotas ainda sem guard (Task 10) usam
 * o `userId` da query.
 */
function makeController(overrides: { database?: InMemoryEventDatabase } = {}) {
  const database = overrides.database ?? new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const workoutCatalog = new InMemoryWorkoutCatalog();
  const mealParsing = new StubMealParsingGateway();

  const controller = new EventsController(
    new ListTimelineEventsUseCase(new InMemoryTimelineEventQuery(database)),
    new CreateEventUseCase(eventRepository, mealParsing, workoutCatalog),
    new GetDailyOverviewUseCase(new InMemoryDailyOverviewQuery(database)),
    vi.fn() as never,
    vi.fn() as never,
    vi.fn() as never,
    new UpdateEventUseCase(eventRepository, workoutCatalog),
    vi.fn() as never,
  );

  return { controller, database, eventRepository };
}

function makeMealEvent(userId: string, name: string, startedAt: string, kcal: number) {
  const foodItems = [
    {
      id: "01K2R1J5M8S0Y2Z7ABCDFOODMEAL",
      name,
      portion: "1 porção",
      approximateWeightGrams: 100,
      caloriesKcal: kcal,
      macronutrients: { carbohydratesGrams: 0, proteinsGrams: 0, totalFatGrams: 0, fiberGrams: 0 },
      micronutrients: {},
    },
  ];
  return Event.create({
    userId,
    name,
    description: "",
    startedAt: new Date(startedAt),
    tags: ["meal"],
    interruptions: [],
    items: [
      EventItem.create({
        position: 0,
        type: "meal",
        schemaVersion: 1,
        isPrimary: true,
        data: {
          name,
          description: name,
          foodItems,
          totals: calculateMealTotals(foodItems),
        },
      }),
    ],
  });
}

test("POST /api/events ignores forbidden create fields from the client payload", async () => {
  const { controller, eventRepository } = makeController();

  const { eventId } = await controller.create(
    {
      items: [{ type: "sleep" }],
      userId: "attacker-1",
      startedAt: "2020-01-01T00:00:00.000Z",
      finishedAt: "2020-01-01T01:00:00.000Z",
      interruptions: [{ name: "Not allowed" }],
    } as never,
    actor,
  );
  const persistedEvent = await eventRepository.findById(eventId);

  expect(persistedEvent?.items[0].type).toBe("sleep");
  expect(persistedEvent?.userId).toBe("firebase-user-1");
  expect(persistedEvent?.startedAt.toISOString()).not.toBe("2020-01-01T00:00:00.000Z");
  expect(persistedEvent?.finishedAt).toBeUndefined();
  expect(persistedEvent?.name).toBe("Sono");
  expect(persistedEvent?.interruptions).toEqual([]);
});

function anOpenTraining() {
  return Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "firebase-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["gym"],
    interruptions: [],
    items: [
      EventItem.create({ position: 0, type: "training", schemaVersion: 1, isPrimary: true, data: { workouts: [], caloriesBurned: 0 } }),
    ],
  });
}

test("PATCH /api/events/:eventId keeps server-owned fields when they are sent by the client", async () => {
  const event = anOpenTraining();
  const { controller, eventRepository } = makeController({ database: new InMemoryEventDatabase([event]) });

  await controller.update(
    event.id,
    {
      eventId: "different-event-id",
      expectedRevision: 1,
      userId: "attacker-1",
      name: "Updated training",
    } as never,
    actor,
  );

  expect(await eventRepository.findById(event.id)).toMatchObject({
    id: event.id,
    userId: "firebase-user-1",
    name: "Updated training",
  });
  expect((await eventRepository.findById(event.id))?.startedAt.toISOString()).toBe(
    "2026-08-16T18:00:00.000Z",
  );
});

test("PATCH /api/events/:eventId updates startedAt when the client sends it", async () => {
  const event = anOpenTraining();
  const { controller, eventRepository } = makeController({ database: new InMemoryEventDatabase([event]) });

  await controller.update(
    event.id,
    { expectedRevision: 1, startedAt: "2026-08-16T17:00:00.000Z" } as never,
    actor,
  );

  expect((await eventRepository.findById(event.id))?.startedAt.toISOString()).toBe(
    "2026-08-16T17:00:00.000Z",
  );
});

test("rejects an invalid timeline date before touching the repository", async () => {
  const { controller } = makeController();

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
    database: new InMemoryEventDatabase([
      makeMealEvent("user-1", "Breakfast", "2026-08-16T08:00:00-03:00", 320),
      makeMealEvent("user-2", "Lunch", "2026-08-16T12:00:00-03:00", 540),
    ]),
  });

  const page = await controller.list("user-1");

  expect(page.items).toHaveLength(1);
  expect(page.items).toMatchObject([{ name: "Breakfast" }]);
});

test("rejects a daily overview request without a date", async () => {
  const { controller } = makeController();

  await expect(controller.daily(undefined, "user-1")).rejects.toThrow(
    new BadRequestException("date is required"),
  );
});

test("keeps the daily boundary in Sao Paulo", async () => {
  const { controller } = makeController({
    database: new InMemoryEventDatabase([
      makeMealEvent("user-1", "Late meal", "2026-08-15T23:30:00-03:00", 250),
    ]),
  });

  await expect(controller.daily("2026-08-16", "user-1")).resolves.toMatchObject({ caloriesConsumed: 0 });
});

test("PATCH /api/events/:eventId refuses marks that are not ours", async () => {
  const event = anOpenTraining();
  const { controller, eventRepository } = makeController({ database: new InMemoryEventDatabase([event]) });

  await expect(
    controller.update(event.id, { eventId: event.id, expectedRevision: 1, missed: "sim" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);

  await expect(
    controller.update(event.id, { eventId: event.id, expectedRevision: 1, priority: "altissima" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);

  expect((await eventRepository.findById(event.id))?.missed).toBe(false);
});

test("PATCH /api/events/:eventId stores the mark and the priority the client sent", async () => {
  const event = anOpenTraining();
  const { controller, eventRepository } = makeController({ database: new InMemoryEventDatabase([event]) });

  await controller.update(
    event.id,
    { eventId: event.id, expectedRevision: 1, missed: true, priority: "urgent" },
    actor,
  );

  expect(await eventRepository.findById(event.id)).toMatchObject({
    missed: true,
    priority: "urgent",
  });
});
