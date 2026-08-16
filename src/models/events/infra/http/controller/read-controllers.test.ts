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

  const response = await controller.handle(new Request("http://localhost/api/events?from=not-a-date"));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Invalid from date" });
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
