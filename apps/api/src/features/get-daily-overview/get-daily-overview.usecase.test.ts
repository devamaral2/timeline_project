import { expect, test } from "vitest";
import { Event } from "../../domain";
import { databaseOf, eventWith } from "../../api-core/events/testing/event-fixtures";
import { InMemoryDailyOverviewQuery } from "../../api-core/events/testing/in-memory-daily-overview.query";
import type { DailyOverviewQueryParams } from "../../domain/ports";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";

const actor = { userId: "user-1" };
const workout = { workoutCode: "free" as const, workoutName: "Livre", calories: 420, duration: 60 };

function food(description: string, kcal: number, protein = 0, carbohydrate = 0, fat = 0) {
  return {
    type: "food",
    data: {
      description,
      items: [],
      totals: {
        totalCaloriesKcal: kcal,
        totalProteinGrams: protein,
        totalCarbohydrateGrams: carbohydrate,
        totalFatGrams: fat,
        totalFiberGrams: 0,
      },
    },
  };
}

function overviewOf(fixtures: Parameters<typeof databaseOf>[0], date = "2026-08-16", user = actor) {
  return new GetDailyOverviewUseCase(new InMemoryDailyOverviewQuery(databaseOf(fixtures))).execute({ date }, user);
}

test("builds the overview of a Sao Paulo day: sleep, what was eaten and the trainings", async () => {
  const overview = await overviewOf([
    eventWith(
      { id: "sleep", userId: "user-1", name: "Night sleep", description: "Manual entry", startedAt: new Date("2026-08-15T23:00:00-03:00") },
      [{ type: "sleep", data: { trackedSleepTime: 390, score: 88 } }],
    ),
    eventWith(
      {
        id: "training",
        userId: "user-1",
        name: "Leg day",
        description: "Gym session",
        startedAt: new Date("2026-08-16T18:00:00-03:00"),
        estimatedFinishAt: new Date("2026-08-16T19:00:00-03:00"),
      },
      [{ type: "training", data: { workouts: [{ ...workout, id: "w1" }], caloriesBurned: 420 } }],
    ),
    eventWith(
      { id: "lunch", userId: "user-1", name: "Lunch", description: "Rice, chicken, and beans", startedAt: new Date("2026-08-16T12:00:00-03:00") },
      [food("arroz, frango e feijao", 560, 32, 58, 12)],
    ),
  ]);

  expect(overview).toEqual({
    date: "2026-08-16",
    sleep: { id: "sleep", trackedSleepTime: 390, score: 88, description: "Manual entry" },
    caloriesConsumed: 560,
    macros: { protein: 32, carbohydrate: 58, fat: 12 },
    mealEvents: [
      {
        id: "lunch",
        name: "Lunch",
        description: "Rice, chicken, and beans",
        startedAt: "2026-08-16T15:00:00.000Z",
        estimatedFinishAt: "2026-08-16T15:20:00.000Z",
        kcal: 560,
        protein: 32,
        carbohydrate: 58,
        fat: 12,
      },
    ],
    trainingEvents: [
      {
        id: "training",
        name: "Leg day",
        description: "Gym session",
        startedAt: "2026-08-16T21:00:00.000Z",
        estimatedFinishAt: "2026-08-16T22:00:00.000Z",
        workouts: [workout],
      },
    ],
  });
});

test("a day without events is an empty overview", async () => {
  expect(await overviewOf([])).toEqual({
    date: "2026-08-16",
    sleep: null,
    caloriesConsumed: 0,
    macros: { protein: 0, carbohydrate: 0, fat: 0 },
    mealEvents: [],
    trainingEvents: [],
  });
});

test("an event with several foods counts once, with the sum of them", async () => {
  const overview = await overviewOf([
    eventWith({ id: "lunch", userId: "user-1", name: "Almoço", startedAt: new Date("2026-08-16T12:00:00-03:00") }, [
      food("arroz", 130, 2, 28, 0),
      { type: "text", data: { body: "estava bom" } },
      food("feijão", 76, 5, 14, 1),
    ]),
    eventWith({ id: "snack", userId: "user-1", name: "Lanche", startedAt: new Date("2026-08-16T16:00:00-03:00") }, [
      food("banana", 89, 1, 23, 0),
    ]),
  ]);

  expect(overview.mealEvents.map((meal) => [meal.id, meal.kcal])).toEqual([
    ["lunch", 206],
    ["snack", 89],
  ]);
  expect(overview.caloriesConsumed).toBe(295);
  expect(overview.macros).toEqual({ protein: 8, carbohydrate: 65, fat: 1 });
});

test("a pending food counts as a meal with no calories yet", async () => {
  const pending = food("arroz e feijão", 0);
  const overview = await overviewOf([
    eventWith({ id: "lunch", userId: "user-1", name: "Almoço", startedAt: new Date("2026-08-16T12:00:00-03:00") }, [
      { ...pending, data: { ...pending.data, generation: { status: "pending" } } },
    ]),
  ]);

  expect(overview.mealEvents).toHaveLength(1);
  expect(overview.caloriesConsumed).toBe(0);
});

test("the day is the civil day in Sao Paulo, bounds included", async () => {
  const at = (id: string, startedAt: string) =>
    eventWith({ id, userId: "user-1", name: id, startedAt: new Date(startedAt), estimatedFinishAt: new Date(startedAt) }, [food(id, 100)]);

  const overview = await overviewOf([
    at("previous-night", "2026-08-15T23:59:59-03:00"),
    at("midnight", "2026-08-16T00:00:00-03:00"),
    at("last-second", "2026-08-16T23:59:59-03:00"),
    at("next-midnight", "2026-08-17T00:00:00-03:00"),
  ]);

  expect(overview.mealEvents.map((meal) => meal.id)).toEqual(["last-second", "midnight"]);
});

test("the sleep that started the night before and ends in the day is the sleep of the day", async () => {
  const overview = await overviewOf(
    [
      eventWith({ id: "night", userId: "user-1", name: "Sono", description: "da noite", startedAt: new Date("2026-08-16T23:00:00-03:00") }, [
        { type: "sleep", data: { trackedSleepTime: 480, score: 90 } },
      ]),
    ],
    "2026-08-17",
  );

  expect(overview.sleep).toEqual({ id: "night", trackedSleepTime: 480, score: 90, description: "da noite" });
});

test("with more than one sleep touching the day, the one that started last wins", async () => {
  const overview = await overviewOf([
    eventWith({ id: "night", userId: "user-1", name: "Sono", startedAt: new Date("2026-08-15T23:00:00-03:00") }, [
      { type: "sleep", data: { trackedSleepTime: 420, score: 70 } },
    ]),
    eventWith({ id: "nap", userId: "user-1", name: "Cochilo", startedAt: new Date("2026-08-16T14:00:00-03:00"), estimatedFinishAt: new Date("2026-08-16T14:30:00-03:00") }, [
      { type: "sleep", data: { trackedSleepTime: 30, score: 50 } },
    ]),
  ]);

  expect(overview.sleep).toMatchObject({ id: "nap", score: 50 });
});

test("an event that ended before the day began is not part of it", async () => {
  const overview = await overviewOf(
    [
      eventWith(
        {
          id: "dinner",
          userId: "user-1",
          name: "Jantar",
          startedAt: new Date("2026-08-16T21:00:00-03:00"),
          estimatedFinishAt: new Date("2026-08-16T22:00:00-03:00"),
        },
        [food("jantar", 700)],
      ),
      eventWith(
        {
          id: "training",
          userId: "user-1",
          name: "Treino",
          status: "done",
          startedAt: new Date("2026-08-16T20:00:00-03:00"),
          finishedAt: new Date("2026-08-16T21:00:00-03:00"),
        },
        [{ type: "training", data: { workouts: [{ ...workout, id: "w1" }], caloriesBurned: 420 } }],
      ),
    ],
    "2026-08-17",
  );

  expect(overview.mealEvents).toEqual([]);
  expect(overview.trainingEvents).toEqual([]);
});

test("leaves out long-running events, agent events, events without a start and other users' events", async () => {
  const meal = [food("arroz", 100)];
  const noon = new Date("2026-08-16T12:00:00-03:00");
  const fixtures = [
    eventWith({ id: "project", userId: "user-1", name: "Dieta", longRunning: true, startedAt: noon, kind: "meal" }, meal),
    eventWith({ id: "undated", userId: "user-1", name: "Comer melhor", status: "todo", kind: "meal" }, meal),
    eventWith({ id: "theirs", userId: "user-2", name: "Almoço", startedAt: noon }, meal),
    eventWith({ id: "mine", userId: "user-1", name: "Almoço", startedAt: noon }, meal),
  ];
  const request = Event.create({
    id: "request",
    userId: "user-1",
    actor: "agent",
    kind: "build_request",
    status: "done",
    name: "Calcular nutrientes",
    startedAt: noon,
    artifactLinks: [{ artifactId: fixtures[3]?.artifacts[0]?.id as string, relation: "updates", fromRecurrence: false }],
  });

  const overview = await overviewOf([...fixtures, { event: request, artifacts: [] }]);

  expect(overview.mealEvents.map((meal) => meal.id)).toEqual(["mine"]);
  expect(overview.caloriesConsumed).toBe(100);
});

test("a food the event deleted, or that no longer exists, does not count", async () => {
  const lunch = eventWith({ id: "lunch", userId: "user-1", name: "Almoço", startedAt: new Date("2026-08-16T12:00:00-03:00") }, [
    food("arroz", 130),
    food("sobremesa", 300),
  ]);
  const dropped = Event.create({
    id: "cleanup",
    userId: "user-1",
    name: "Limpar despensa",
    startedAt: new Date("2026-08-16T13:00:00-03:00"),
    artifactLinks: [{ artifactId: lunch.artifacts[0]?.id as string, relation: "deletes", fromRecurrence: false }],
  });
  const database = databaseOf([lunch, { event: dropped, artifacts: [] }]);
  database.artifacts.splice(1, 1);

  const overview = await new GetDailyOverviewUseCase(new InMemoryDailyOverviewQuery(database)).execute({ date: "2026-08-16" }, actor);

  expect(overview.mealEvents.map((meal) => [meal.id, meal.kcal])).toEqual([["lunch", 130]]);
});

test("asks for the Sao Paulo day of the actor, after generating the series up to that day", async () => {
  const calls: string[] = [];
  const asked: DailyOverviewQueryParams[] = [];
  const useCase = new GetDailyOverviewUseCase(
    {
      get: async (params) => {
        calls.push("query");
        asked.push(params);
        return { date: params.date, sleep: null, caloriesConsumed: 0, macros: { protein: 0, carbohydrate: 0, fat: 0 }, mealEvents: [], trainingEvents: [] };
      },
    },
    {
      materialize: async (userId, until) => {
        calls.push(`materialize ${userId} ${until?.toISOString()}`);
      },
    },
  );

  await useCase.execute({ date: "2026-12-24" }, actor);

  expect(calls).toEqual(["materialize user-1 2026-12-24T12:00:00.000Z", "query"]);
  expect(asked).toEqual([{ userId: "user-1", date: "2026-12-24", timeZone: "America/Sao_Paulo" }]);
});
