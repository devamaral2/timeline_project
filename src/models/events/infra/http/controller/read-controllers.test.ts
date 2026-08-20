import { expect, test } from "vitest";
import type { EventRepository } from "../../../application/contracts/event-repository";
import { GetDailyOverviewUseCase } from "../../../application/usecases/get-daily-overview.usecase";
import { ListTimelineEventsUseCase } from "../../../application/usecases/list-timeline-events.usecase";
import { InMemoryEventRepository } from "../../../application/usecases/test-doubles/in-memory-event.repository";
import { FoodEvent } from "../../../domain/entities/food-event.entity";
import { GetDailyOverviewController } from "./get-daily-overview.controller";
import { ListTimelineEventsController } from "./list-timeline-events.controller";

test("returns a validation response for an invalid timeline date", async () => {
  const repository = {
    listTimeline: async (params: { from?: Date }) => {
      params.from?.toISOString();
      return [];
    },
  } as unknown as EventRepository;
  const controller = new ListTimelineEventsController(new ListTimelineEventsUseCase(repository));

  const response = await controller.handle(
    new Request("http://localhost/api/events?userId=user-1&from=not-a-date"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Invalid from date" });
});

test("returns a validation response when timeline userId is missing", async () => {
  const repository = {
    listTimeline: async () => [],
  } as unknown as EventRepository;
  const controller = new ListTimelineEventsController(new ListTimelineEventsUseCase(repository));

  const response = await controller.handle(new Request("http://localhost/api/events"));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Missing userId" });
});

test("returns only timeline events for the requested userId", async () => {
  const repository = new InMemoryEventRepository([
    FoodEvent.create({
      userId: "user-1",
      name: "Breakfast",
      description: "Visible event",
      startedAt: new Date("2026-08-16T08:00:00-03:00"),
      tags: ["meal"],
      interruptions: [],
      data: {
        inputText: "coffee and toast",
        items: [],
        totals: {
          totalCaloriesKcal: 320,
          totalProteinGrams: 12,
          totalCarbohydrateGrams: 40,
          totalFatGrams: 10,
          totalFiberGrams: 4,
          totalMicronutrients: {},
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-16T08:00:00-03:00"),
      },
    }),
    FoodEvent.create({
      userId: "user-2",
      name: "Lunch",
      description: "Hidden event",
      startedAt: new Date("2026-08-16T12:00:00-03:00"),
      tags: ["meal"],
      interruptions: [],
      data: {
        inputText: "rice and beans",
        items: [],
        totals: {
          totalCaloriesKcal: 540,
          totalProteinGrams: 22,
          totalCarbohydrateGrams: 60,
          totalFatGrams: 14,
          totalFiberGrams: 8,
          totalMicronutrients: {},
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-16T12:00:00-03:00"),
      },
    }),
  ]);
  const controller = new ListTimelineEventsController(new ListTimelineEventsUseCase(repository));

  const response = await controller.handle(new Request("http://localhost/api/events?userId=user-1"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toHaveLength(1);
  expect(body).toMatchObject([{ name: "Breakfast" }]);
});

test("keeps the daily boundary in Sao Paulo when a timezone query is supplied", async () => {
  const repository = new InMemoryEventRepository([
    FoodEvent.create({
      userId: "user-1",
      name: "Late meal",
      description: "Should belong to August 15 in Sao Paulo",
      startedAt: new Date("2026-08-15T23:30:00-03:00"),
      tags: [],
      interruptions: [],
      data: {
        inputText: "lanche",
        items: [],
        totals: {
          totalCaloriesKcal: 250,
          totalProteinGrams: 10,
          totalCarbohydrateGrams: 20,
          totalFatGrams: 8,
          totalFiberGrams: 3,
          totalMicronutrients: {},
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-15T23:30:00-03:00"),
      },
    }),
  ]);
  const controller = new GetDailyOverviewController(new GetDailyOverviewUseCase(repository));

  const response = await controller.handle(
    new Request("http://localhost/api/events/daily?date=2026-08-16&timeZone=UTC"),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ caloriesConsumed: 0 });
});
