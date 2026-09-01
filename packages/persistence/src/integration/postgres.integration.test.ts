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
} from "@repo/entities";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";

const RUN_INTEGRATION = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe.runIf(RUN_INTEGRATION)("PostgreSQL schema", () => {
  let ctx: PostgresTestContext;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
    } else {
      await ctx.reset();
    }
  });

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
  });

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
