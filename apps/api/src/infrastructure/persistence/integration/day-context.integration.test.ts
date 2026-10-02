import { afterAll, beforeAll, expect, test } from "vitest";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresDayContextQuery } from "../agent-sql/postgres-day-context.query";

let ctx: PostgresTestContext;
beforeAll(async () => { ctx = await createPostgresTestContext(); }, 30_000);
afterAll(async () => { if (ctx) await ctx.stop(); });

test("daily context returns crossing events and linked data for only the requested owner", async () => {
  const eventId = "01J00000000000000000000001";
  const foreignId = "01J00000000000000000000002";
  const taskId = "01J00000000000000000000003";
  const noteId = "01J00000000000000000000004";
  await ctx.pool.query(
    "INSERT INTO events (id, user_id, name, started_at, finished_at) VALUES ($1, 'user-1', 'Trabalho', '2026-09-15T23:00:00-03:00', '2026-09-16T02:00:00-03:00'), ($2, 'user-2', 'Privado', '2026-09-16T10:00:00-03:00', '2026-09-16T11:00:00-03:00')",
    [eventId, foreignId],
  );
  await ctx.pool.query(
    "INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data) VALUES ('01J00000000000000000000005', $1, 0, 'routine', 1, true, '{}'::jsonb)",
    [eventId],
  );
  await ctx.pool.query("INSERT INTO tasks (id, user_id, name) VALUES ($1, 'user-1', 'Entregar')", [taskId]);
  await ctx.pool.query("INSERT INTO event_tasks (event_id, task_id) VALUES ($1, $2)", [eventId, taskId]);
  await ctx.pool.query(
    "INSERT INTO notes (id, user_id, name, content, event_id) VALUES ($1, 'user-1', 'Resultado', 'Concluído', $2)",
    [noteId, eventId],
  );

  const result = await new PostgresDayContextQuery(ctx.pool).get({ userId: "user-1", date: "2026-09-16" });
  expect(result.events.map((event) => event.id)).toEqual([eventId]);
  expect(result.events[0].items).toMatchObject([{ type: "routine", is_primary: true }]);
  expect(result.tasks.map((task) => task.id)).toEqual([taskId]);
  expect(result.notes.map((note) => note.id)).toEqual([noteId]);
});
