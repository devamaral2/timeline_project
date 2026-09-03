import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createPostgresTestContext,
  type PostgresTestContext,
} from "../testing/postgres-test-context";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import {
  Event,
  EventItem,
  EventOwnershipError,
  EventRevisionConflictError,
  Food,
  Meal,
  CatalogRevisionConflictError,
} from "@repo/entities";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresFoodRepository } from "../catalog/repositories/postgres-food.repository";
import { PostgresMealRepository } from "../catalog/repositories/postgres-meal.repository";
import { PostgresTimelineEventQuery } from "../events/queries/postgres-timeline-event.query";
import { PostgresDailyOverviewQuery } from "../events/queries/postgres-daily-overview.query";
import { PostgresTagRepository } from "../events/repositories/postgres-tag.repository";
import { PostgresWorkoutCatalog } from "../catalog/postgres-workout.catalog";

const RUN_INTEGRATION = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe.runIf(RUN_INTEGRATION)("PostgreSQL schema", () => {
  let ctx: PostgresTestContext;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  test("applying the migration twice does not duplicate anything", async () => {
    await migrate(ctx.db, { migrationsFolder: resolve(__dirname, "../../drizzle") });

    const { rows } = await ctx.pool.query(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
    );
    expect(rows[0].count).toBe(1);
  });

  test("seeds the fixed workout catalog", async () => {
    const { rows } = await ctx.pool.query("SELECT code, category FROM workout ORDER BY code");
    expect(rows).toEqual([
      { code: "free", category: "free" },
      { code: "running", category: "cardio" },
      { code: "treadmill", category: "cardio" },
      { code: "weightlifting", category: "strength" },
    ]);
  });

  async function insertEvent(
    overrides: Partial<{ startedAt: string; finishedAt: string | null }> = {},
  ) {
    const id = "01EVENT00000000000000000A";
    await ctx.pool.query(
      `INSERT INTO events (id, user_id, name, started_at, finished_at)
       VALUES ($1, 'user-1', 'Evento', $2, $3)`,
      [id, overrides.startedAt ?? "2026-08-31T12:00:00Z", overrides.finishedAt ?? null],
    );
    return id;
  }

  test("rejects a finished_at earlier than started_at", async () => {
    await expect(
      ctx.pool.query(
        `INSERT INTO events (id, user_id, name, started_at, finished_at)
         VALUES ('01EVENT00000000000000000B', 'user-1', 'Evento', '2026-08-31T12:00:00Z', '2026-08-31T11:00:00Z')`,
      ),
    ).rejects.toThrow();
  });

  test("requires event_items.data to be a JSON object", async () => {
    const eventId = await insertEvent();
    await expect(
      ctx.pool.query(
        `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
         VALUES ('01ITEM0000000000000000000', $1, 0, 'routine', 1, true, '[1,2,3]'::jsonb)`,
        [eventId],
      ),
    ).rejects.toThrow();
  });

  test("rejects a negative position and requires uniqueness per event", async () => {
    const eventId = await insertEvent();
    await expect(
      ctx.pool.query(
        `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
         VALUES ('01ITEM0000000000000000001', $1, -1, 'routine', 1, true, '{}'::jsonb)`,
        [eventId],
      ),
    ).rejects.toThrow();

    await ctx.pool.query(
      `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
       VALUES ('01ITEM0000000000000000002', $1, 0, 'routine', 1, true, '{}'::jsonb)`,
      [eventId],
    );
    await expect(
      ctx.pool.query(
        `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
         VALUES ('01ITEM0000000000000000003', $1, 0, 'routine', 1, false, '{}'::jsonb)`,
        [eventId],
      ),
    ).rejects.toThrow();
  });

  test("allows at most one primary item per event", async () => {
    const eventId = await insertEvent();
    await ctx.pool.query(
      `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
       VALUES ('01ITEM0000000000000000004', $1, 0, 'routine', 1, true, '{}'::jsonb)`,
      [eventId],
    );
    await expect(
      ctx.pool.query(
        `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
         VALUES ('01ITEM0000000000000000005', $1, 1, 'routine', 1, true, '{}'::jsonb)`,
        [eventId],
      ),
    ).rejects.toThrow();
  });

  test("requires valid scope/owner combinations in food and meal", async () => {
    await expect(
      ctx.pool.query(
        `INSERT INTO food (id, scope, owner_user_id, name, reference_portion, reference_weight_grams, calories_kcal, carbohydrates_grams, proteins_grams, total_fat_grams, fiber_grams)
         VALUES ('01FOOD0000000000000000001', 'global', 'user-1', 'Arroz', '100 g', 100, 130, 28, 2.7, 0.3, 0.4)`,
      ),
    ).rejects.toThrow();

    await expect(
      ctx.pool.query(
        `INSERT INTO meal (id, scope, owner_user_id, name)
         VALUES ('01MEAL0000000000000000001', 'user', NULL, 'Almoço')`,
      ),
    ).rejects.toThrow();
  });

  test("requires food.micronutrients to be an object and meal.food_items to be an array", async () => {
    await expect(
      ctx.pool.query(
        `INSERT INTO food (id, scope, owner_user_id, name, reference_portion, reference_weight_grams, calories_kcal, carbohydrates_grams, proteins_grams, total_fat_grams, fiber_grams, micronutrients)
         VALUES ('01FOOD0000000000000000002', 'user', 'user-1', 'Arroz', '100 g', 100, 130, 28, 2.7, 0.3, 0.4, '[]'::jsonb)`,
      ),
    ).rejects.toThrow();

    await expect(
      ctx.pool.query(
        `INSERT INTO meal (id, scope, owner_user_id, name, food_items)
         VALUES ('01MEAL0000000000000000002', 'user', 'user-1', 'Almoço', '{}'::jsonb)`,
      ),
    ).rejects.toThrow();
  });

  test("rejects negative nutrition values", async () => {
    await expect(
      ctx.pool.query(
        `INSERT INTO food (id, scope, owner_user_id, name, reference_portion, reference_weight_grams, calories_kcal, carbohydrates_grams, proteins_grams, total_fat_grams, fiber_grams)
         VALUES ('01FOOD0000000000000000003', 'user', 'user-1', 'Arroz', '100 g', 100, -1, 28, 2.7, 0.3, 0.4)`,
      ),
    ).rejects.toThrow();
  });

  test("does not enforce a foreign key on catalog ids stored inside jsonb", async () => {
    await ctx.pool.query(
      `INSERT INTO food (id, scope, owner_user_id, name, reference_portion, reference_weight_grams, calories_kcal, carbohydrates_grams, proteins_grams, total_fat_grams, fiber_grams)
       VALUES ('01FOOD0000000000000000004', 'user', 'user-1', 'Arroz', '100 g', 100, 130, 28, 2.7, 0.3, 0.4)`,
    );
    const eventId = await insertEvent();
    await ctx.pool.query(
      `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
       VALUES ('01ITEM0000000000000000006', $1, 0, 'meal', 1, true, $2::jsonb)`,
      [
        eventId,
        JSON.stringify({
          name: "Almoço",
          description: "",
          foodItems: [{ sourceFoodId: "01FOOD0000000000000000004" }],
          totals: {},
        }),
      ],
    );

    await ctx.pool.query("DELETE FROM food WHERE id = '01FOOD0000000000000000004'");

    const { rows } = await ctx.pool.query(
      "SELECT data FROM event_items WHERE id = '01ITEM0000000000000000006'",
    );
    expect(rows[0].data.foodItems[0].sourceFoodId).toBe("01FOOD0000000000000000004");
  });

  test("does not create a generic GIN index over event_items.data", async () => {
    const { rows } = await ctx.pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'event_items'`,
    );
    const ginOnData = rows.filter(
      (row: { indexdef: string }) =>
        row.indexdef.includes("gin") && row.indexdef.includes("data"),
    );
    expect(ginOnData).toHaveLength(0);
  });
});

describe.runIf(RUN_INTEGRATION)("PostgresEventRepository", () => {
  let ctx: PostgresTestContext;
  let repository: PostgresEventRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      repository = new PostgresEventRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  function routine(overrides: Partial<Parameters<typeof EventItem.create>[0]> = {}) {
    return EventItem.create({
      position: 0,
      type: "routine",
      schemaVersion: 1,
      isPrimary: true,
      data: {},
      ...overrides,
    });
  }

  function newEvent(overrides: Partial<Parameters<typeof Event.create>[0]> = {}) {
    return Event.create({
      userId: "user-1",
      name: "Planejamento",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: ["trabalho"],
      interruptions: [],
      items: [routine()],
      ...overrides,
    });
  }

  test("saves and reads back an aggregate", async () => {
    const event = newEvent();
    await repository.save(event);

    const found = await repository.findById(event.id);
    expect(found?.id).toBe(event.id);
    expect(found?.tags).toEqual(["trabalho"]);
    expect(found?.items[0].id).toBe(event.items[0].id);
  });

  test("rejects an update with a stale expected revision", async () => {
    const event = newEvent();
    await repository.save(event);
    const changed = event.revise({ name: "Novo nome" });

    await expect(
      repository.update(changed, "user-1", event.revision + 1),
    ).rejects.toBeInstanceOf(EventRevisionConflictError);
  });

  test("rejects an update from a different owner", async () => {
    const event = newEvent();
    await repository.save(event);
    const changed = event.revise({ name: "Novo nome" });

    await expect(
      repository.update(changed, "user-2", event.revision),
    ).rejects.toBeInstanceOf(EventOwnershipError);
  });

  test("rolls back the parent insert when a child insert fails", async () => {
    const shared = routine();
    const first = newEvent({ items: [shared] });
    await repository.save(first);

    const collidingItem = routine({ id: shared.id, position: 0 });
    const second = newEvent({ items: [collidingItem] });

    await expect(repository.save(second)).rejects.toThrow();
    expect(await repository.findById(second.id)).toBeNull();
  });

  test("cascades deletes to items, interruptions and tag links", async () => {
    const event = newEvent();
    await repository.save(event);

    await repository.delete(event.id, "user-1");

    expect(await repository.findById(event.id)).toBeNull();
    const { rows } = await ctx.pool.query("SELECT 1 FROM event_items WHERE event_id = $1", [
      event.id,
    ]);
    expect(rows).toHaveLength(0);
  });

  test("replaces items on update while incrementing the revision exactly once", async () => {
    const original = routine();
    const event = newEvent({ items: [original] });
    await repository.save(event);

    const replacement = routine({ position: 0, id: undefined });
    const changed = event.revise({ items: [replacement] });
    await repository.update(changed, "user-1", event.revision);

    const found = await repository.findById(event.id);
    expect(found?.revision).toBe(event.revision + 1);
    expect(found?.items.map((item) => item.id)).toEqual([replacement.id]);
  });

  test("does not duplicate a tag saved twice and keeps its original created_at", async () => {
    const first = newEvent({ tags: ["treino"] });
    await repository.save(first);
    const [{ id: firstTagId, created_at: createdAt }] = (
      await ctx.pool.query("SELECT id, created_at FROM tags WHERE user_id = 'user-1'")
    ).rows;

    const second = newEvent({ id: undefined, tags: ["treino"] });
    await repository.save(second);

    const tagRows = (await ctx.pool.query("SELECT id, created_at FROM tags WHERE user_id = 'user-1'"))
      .rows;
    expect(tagRows).toHaveLength(1);
    expect(tagRows[0].id).toBe(firstTagId);
    expect(new Date(tagRows[0].created_at)).toEqual(new Date(createdAt));
  });

  test("lets two different users share the same tag name", async () => {
    await repository.save(newEvent({ tags: ["treino"] }));
    await repository.save(newEvent({ userId: "user-2", tags: ["treino"] }));

    const { rows } = await ctx.pool.query("SELECT DISTINCT user_id FROM tags WHERE name = 'treino'");
    expect(rows).toHaveLength(2);
  });

  test("closes the previous open event when saving a new one", async () => {
    const opened = newEvent({ startedAt: new Date("2026-08-31T09:00:00.000Z") });
    await repository.save(opened);

    const next = newEvent({ startedAt: new Date("2026-08-31T10:00:00.000Z") });
    await repository.saveClosingLatestOpen(next, new Date("2026-08-31T09:30:00.000Z"));

    const closed = await repository.findById(opened.id);
    expect(closed?.finishedAt).toEqual(new Date("2026-08-31T09:30:00.000Z"));
    expect(closed?.revision).toBe(opened.revision + 1);
  });

  test("leaves the previous event open when closing it would finish before it started", async () => {
    const opened = newEvent({ startedAt: new Date("2026-08-31T09:00:00.000Z") });
    await repository.save(opened);

    const next = newEvent({ startedAt: new Date("2026-08-31T10:00:00.000Z") });
    await repository.saveClosingLatestOpen(next, new Date("2026-08-31T08:00:00.000Z"));

    const stillOpen = await repository.findById(opened.id);
    expect(stillOpen?.finishedAt).toBeUndefined();
  });

  test("findLatestOpenByUserId ignores an older open event behind a more recent closed one", async () => {
    const olderOpen = newEvent({ startedAt: new Date("2026-08-31T08:00:00.000Z") });
    await repository.save(olderOpen);

    const recentClosed = newEvent({
      startedAt: new Date("2026-08-31T09:00:00.000Z"),
      finishedAt: new Date("2026-08-31T09:30:00.000Z"),
    });
    await repository.save(recentClosed);

    expect(await repository.findLatestOpenByUserId("user-1")).toBeNull();
  });
});

describe.runIf(RUN_INTEGRATION)("PostgresFoodRepository and PostgresMealRepository", () => {
  let ctx: PostgresTestContext;
  let foods: PostgresFoodRepository;
  let meals: PostgresMealRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      foods = new PostgresFoodRepository(ctx.db);
      meals = new PostgresMealRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  function newFood(overrides: Partial<Parameters<typeof Food.create>[0]> = {}) {
    return Food.create({
      scope: "user",
      ownerUserId: "user-a",
      name: "Arroz",
      referencePortion: "100 g",
      referenceWeightGrams: 100,
      caloriesKcal: 130,
      macronutrients: {
        carbohydratesGrams: 28,
        proteinsGrams: 2.7,
        totalFatGrams: 0.3,
        fiberGrams: 0.4,
      },
      micronutrients: { ironMilligrams: 1.5 },
      ...overrides,
    });
  }

  async function insertGlobalFood(): Promise<string> {
    const id = "01GFOOD0000000000000000A1";
    await ctx.pool.query(
      `INSERT INTO food (id, scope, owner_user_id, name, reference_portion, reference_weight_grams, calories_kcal, carbohydrates_grams, proteins_grams, total_fat_grams, fiber_grams)
       VALUES ($1, 'global', NULL, 'Banana', '1 unidade', 100, 89, 22.8, 1.1, 0.3, 2.6)`,
      [id],
    );
    return id;
  }

  test("food visibility: global is visible to everyone, private only to its owner", async () => {
    const globalFoodId = await insertGlobalFood();
    const privateFood = newFood({ ownerUserId: "user-a" });
    await foods.save(privateFood, "user-a");

    expect(await foods.findVisibleById(globalFoodId, "user-a")).not.toBeNull();
    expect(await foods.findVisibleById(globalFoodId, "user-b")).not.toBeNull();
    expect(await foods.findVisibleById(privateFood.id, "user-a")).not.toBeNull();
    expect(await foods.findVisibleById(privateFood.id, "user-b")).toBeNull();
  });

  test("meal visibility follows the same global/private matrix", async () => {
    const privateMeal = Meal.create({
      scope: "user",
      ownerUserId: "user-a",
      name: "Almoço",
      description: "",
      foodItems: [],
    });
    await meals.save(privateMeal, "user-a");

    expect(await meals.findVisibleById(privateMeal.id, "user-a")).not.toBeNull();
    expect(await meals.findVisibleById(privateMeal.id, "user-b")).toBeNull();
  });

  test("preserves snapshot isolation across Food, Meal and Event updates", async () => {
    const food = newFood({ ownerUserId: "user-a" });
    await foods.save(food, "user-a");

    const snapshot = food.toFoodItem({ portion: "150 g", approximateWeightGrams: 150 });
    const meal = Meal.create({
      scope: "user",
      ownerUserId: "user-a",
      name: "Almoço",
      description: "",
      foodItems: [snapshot],
    });
    await meals.save(meal, "user-a");

    const mealSnapshot = meal.toMealItem();
    const eventRepository = new PostgresEventRepository(ctx.db);
    const item = EventItem.create({
      position: 0,
      type: "meal",
      schemaVersion: 1,
      isPrimary: true,
      data: mealSnapshot,
    });
    const event = Event.create({
      userId: "user-a",
      name: "Almoço",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [item],
    });
    await eventRepository.save(event);

    const changedFood = food.revise({ caloriesKcal: 999 });
    await foods.update(changedFood, "user-a", food.revision);

    const mealAfterFoodChange = await meals.findVisibleById(meal.id, "user-a");
    expect(mealAfterFoodChange?.foodItems[0].caloriesKcal).toBe(snapshot.caloriesKcal);

    const changedMeal = meal.revise({ name: "Nova receita" });
    await meals.update(changedMeal, "user-a", meal.revision);

    const eventAfterMealChange = await eventRepository.findById(event.id);
    const persistedItemData = eventAfterMealChange?.items[0].data as { name: string };
    expect(persistedItemData.name).toBe(mealSnapshot.name);
  });

  test("update succeeds with the matching revision and conflicts otherwise", async () => {
    const food = newFood({ ownerUserId: "user-a" });
    await foods.save(food, "user-a");

    const changed = food.revise({ caloriesKcal: 140 });
    await foods.update(changed, "user-a", food.revision);
    expect((await foods.findVisibleById(food.id, "user-a"))?.caloriesKcal).toBe(140);

    const staleChange = food.revise({ caloriesKcal: 200 });
    await expect(foods.update(staleChange, "user-a", food.revision)).rejects.toBeInstanceOf(
      CatalogRevisionConflictError,
    );
  });
});

describe.runIf(RUN_INTEGRATION)("PostgresTimelineEventQuery and PostgresDailyOverviewQuery", () => {
  let ctx: PostgresTestContext;
  let eventRepository: PostgresEventRepository;
  let timelineQuery: PostgresTimelineEventQuery;
  let dailyOverviewQuery: PostgresDailyOverviewQuery;
  let tagRepository: PostgresTagRepository;
  let workoutCatalog: PostgresWorkoutCatalog;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      eventRepository = new PostgresEventRepository(ctx.db);
      timelineQuery = new PostgresTimelineEventQuery(ctx.db);
      dailyOverviewQuery = new PostgresDailyOverviewQuery(ctx.db);
      tagRepository = new PostgresTagRepository(ctx.db);
      workoutCatalog = new PostgresWorkoutCatalog(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  function routineEvent(overrides: Partial<Parameters<typeof Event.create>[0]> = {}) {
    const item = EventItem.create({
      position: 0,
      type: "routine",
      schemaVersion: 1,
      isPrimary: true,
      data: {},
    });
    return Event.create({
      userId: "user-1",
      name: "Bloco",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [item],
      ...overrides,
    });
  }

  test("timeline: filters by window, orders desc and paginates without gaps or repeats", async () => {
    const inside = routineEvent({ startedAt: new Date("2026-08-31T10:00:00.000Z") });
    const before = routineEvent({ startedAt: new Date("2026-08-30T10:00:00.000Z") });
    await eventRepository.save(inside);
    await eventRepository.save(before);

    const firstPage = await timelineQuery.list({
      userId: "user-1",
      from: new Date("2026-08-31T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.000Z"),
      limit: 10,
    });
    expect(firstPage.items.map((item) => item.id)).toEqual([inside.id]);
  });

  test("timeline: paginates two pages without repetition or gaps", async () => {
    const events = [
      routineEvent({ startedAt: new Date("2026-08-31T08:00:00.000Z") }),
      routineEvent({ startedAt: new Date("2026-08-31T09:00:00.000Z") }),
      routineEvent({ startedAt: new Date("2026-08-31T10:00:00.000Z") }),
    ];
    for (const event of events) await eventRepository.save(event);

    const firstPage = await timelineQuery.list({ userId: "user-1", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await timelineQuery.list({
      userId: "user-1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    const allIds = [...firstPage.items, ...secondPage.items].map((item) => item.id);
    expect(new Set(allIds).size).toBe(3);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  test("timeline: reports primaryItemId, itemTypes in position order and per-user tag isolation", async () => {
    const routine = EventItem.create({
      position: 0,
      type: "routine",
      schemaVersion: 1,
      isPrimary: false,
      data: {},
    });
    const sleep = EventItem.create({
      position: 1,
      type: "sleep",
      schemaVersion: 1,
      isPrimary: true,
      data: { trackedSleepTime: 480, score: 80 },
    });
    const event = Event.create({
      userId: "user-1",
      name: "Combo",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: ["saude"],
      interruptions: [],
      items: [routine, sleep],
    });
    await eventRepository.save(event);
    await eventRepository.save(routineEvent({ userId: "user-2", tags: ["saude"] }));

    const page = await timelineQuery.list({ userId: "user-1", limit: 10, tag: "saude" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].primaryItemId).toBe(sleep.id);
    expect(page.items[0].primaryItemType).toBe("sleep");
    expect(page.items[0].itemTypes).toEqual(["routine", "sleep"]);
    expect(page.items[0].tags).toEqual(["saude"]);
  });

  test("timeline: type filter finds a non-primary item", async () => {
    const routine = EventItem.create({
      position: 0,
      type: "routine",
      schemaVersion: 1,
      isPrimary: true,
      data: {},
    });
    const sleep = EventItem.create({
      position: 1,
      type: "sleep",
      schemaVersion: 1,
      isPrimary: false,
      data: { trackedSleepTime: 420, score: 70 },
    });
    const event = Event.create({
      userId: "user-1",
      name: "Combo",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [routine, sleep],
    });
    await eventRepository.save(event);

    const page = await timelineQuery.list({ userId: "user-1", limit: 10, type: "sleep" });
    expect(page.items.map((item) => item.id)).toEqual([event.id]);
  });

  test("daily overview: isolates by user and aggregates meal/sleep/training", async () => {
    const mealFoodItem = {
      id: "01FOOD00000000000000000A1",
      name: "Arroz",
      portion: "100 g",
      approximateWeightGrams: 100,
      caloriesKcal: 130,
      macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2.7, totalFatGrams: 0.3, fiberGrams: 0.4 },
      micronutrients: { ironMilligrams: 2.1 },
    };
    const mealItem = EventItem.create({
      position: 0,
      type: "meal",
      schemaVersion: 1,
      isPrimary: true,
      data: {
        name: "Almoço",
        description: "",
        foodItems: [mealFoodItem],
        totals: {
          totalCaloriesKcal: 130,
          totalProteinGrams: 2.7,
          totalCarbohydrateGrams: 28,
          totalFatGrams: 0.3,
          totalFiberGrams: 0.4,
        },
      },
    });
    const mealEvent = Event.create({
      userId: "user-1",
      name: "Almoço",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [mealItem],
    });
    await eventRepository.save(mealEvent);

    const sleepItem = EventItem.create({
      position: 0,
      type: "sleep",
      schemaVersion: 1,
      isPrimary: true,
      data: { trackedSleepTime: 480, score: 88 },
    });
    const sleepEvent = Event.create({
      userId: "user-1",
      name: "Sono",
      description: "",
      startedAt: new Date("2026-08-31T09:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [sleepItem],
    });
    await eventRepository.save(sleepEvent);

    const trainingItem = EventItem.create({
      position: 0,
      type: "training",
      schemaVersion: 1,
      isPrimary: true,
      data: {
        workouts: [
          {
            workoutCode: "running",
            workoutName: "Corrida",
            calories: 300,
            duration: 30,
            pace: 5,
            distance: 5,
          },
        ],
        caloriesBurned: 300,
      },
    });
    const trainingEvent = Event.create({
      userId: "user-1",
      name: "Corrida",
      description: "",
      startedAt: new Date("2026-08-31T18:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [trainingItem],
    });
    await eventRepository.save(trainingEvent);

    await eventRepository.save(
      routineEvent({ userId: "user-2", startedAt: new Date("2026-08-31T12:00:00.000Z") }),
    );

    const overview = await dailyOverviewQuery.get({
      userId: "user-1",
      date: "2026-08-31",
      timeZone: "America/Sao_Paulo",
    });

    expect(overview.mealEvents).toHaveLength(1);
    expect(overview.mealEvents[0].kcal).toBe(130);
    expect(overview.micronutrients).toEqual({ ironMilligrams: 2.1 });
    expect(overview.sleep?.trackedSleepTime).toBe(480);
    expect(overview.trainingEvents[0].workouts[0]).toMatchObject({
      workoutCode: "running",
      workoutName: "Corrida",
    });
  });

  test("tag suggestions do an escaped prefix search scoped to the user", async () => {
    await eventRepository.save(routineEvent({ tags: ["treino_forca"] }));
    await eventRepository.save(routineEvent({ userId: "user-2", tags: ["treino_extra"] }));

    const suggestions = await tagRepository.suggest({ userId: "user-1", query: "treino_", limit: 10 });
    expect(suggestions.map((s) => s.name)).toEqual(["treino_forca"]);
  });

  test("workout catalog returns active definitions preserving requested order", async () => {
    const definitions = await workoutCatalog.findActiveByCodes(["running", "treadmill"]);
    expect(definitions.map((d) => d.code)).toEqual(["running", "treadmill"]);

    await expect(workoutCatalog.findActiveByCodes(["unknown" as never])).rejects.toThrow();
  });
});
