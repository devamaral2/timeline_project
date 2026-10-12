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
  const taskNoteId = "01J00000000000000000000006";
  const looseNoteId = "01J00000000000000000000007";
  const foreignNoteId = "01J00000000000000000000008";
  await ctx.pool.query(
    "INSERT INTO events (id, user_id, name, started_at, finished_at) VALUES ($1, 'user-1', 'Trabalho', '2026-09-15T23:00:00-03:00', '2026-09-16T02:00:00-03:00'), ($2, 'user-2', 'Privado', '2026-09-16T10:00:00-03:00', '2026-09-16T11:00:00-03:00')",
    [eventId, foreignId],
  );
  await ctx.pool.query("INSERT INTO tasks (id, user_id, name) VALUES ($1, 'user-1', 'Entregar')", [taskId]);
  await ctx.pool.query("INSERT INTO event_tasks (event_id, task_id) VALUES ($1, $2)", [eventId, taskId]);
  await ctx.pool.query(
    `INSERT INTO notes (id, user_id, name, type, schema_version, data) VALUES
       ($1, 'user-1', 'Resultado', 'text', 1, '{"body":"Concluído"}'::jsonb),
       ($2, 'user-1', 'Da tarefa', 'text', 1, '{"body":"Só na tarefa"}'::jsonb),
       ($3, 'user-1', 'Solta', 'text', 1, '{"body":"Sem vínculo"}'::jsonb),
       ($4, 'user-2', 'De outro', 'text', 1, '{"body":"Privada"}'::jsonb)`,
    [noteId, taskNoteId, looseNoteId, foreignNoteId],
  );
  await ctx.pool.query("INSERT INTO event_notes (event_id, note_id, position) VALUES ($1, $2, 0)", [eventId, noteId]);
  await ctx.pool.query("INSERT INTO task_notes (task_id, note_id, position) VALUES ($1, $2, 0)", [taskId, taskNoteId]);
  // Um evento de outro usuario, no mesmo dia, com a note dele.
  await ctx.pool.query("INSERT INTO event_notes (event_id, note_id, position) VALUES ($1, $2, 0)", [foreignId, foreignNoteId]);

  const result = await new PostgresDayContextQuery(ctx.pool).get({ userId: "user-1", date: "2026-09-16" });
  expect(result.events.map((event) => event.id)).toEqual([eventId]);
  expect(result.events[0]).toMatchObject({ kind: "routine", noteIds: [noteId] });
  expect(result.events[0]).not.toHaveProperty("items");
  expect(result.tasks.map((task) => task.id)).toEqual([taskId]);
  expect(result.tasks[0]).toMatchObject({ noteIds: [taskNoteId] });
  // Entram as notes ligadas aos eventos do dia e as das tarefas deles; a solta e a de outro usuario nao.
  expect(result.notes.map((note) => note.id).sort()).toEqual([noteId, taskNoteId].sort());
  expect(result.notes.find((note) => note.id === noteId)).toMatchObject({ type: "text", data: { body: "Concluído" } });
});
