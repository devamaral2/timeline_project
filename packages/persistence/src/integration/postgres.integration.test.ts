import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createPostgresTestContext,
  type PostgresTestContext,
} from "../testing/postgres-test-context";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";

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
