import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import type { ScopedSqlScope } from "../../../domain/ports";
import { PostgresScopedSqlQuery } from "../agent-sql/postgres-scoped-sql.query";

/** O escopo normal: o ator e o dono dos dados. */
const OWNER: ScopedSqlScope = { includeChat: true };


describe("PostgresScopedSqlQuery", () => {
  let ctx: PostgresTestContext;
  let query: PostgresScopedSqlQuery;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      query = new PostgresScopedSqlQuery(ctx.pool);
    } else {
      await ctx.reset();
    }
    await seed(ctx.pool);
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  // B entra primeiro, para que uma varredura que ignorasse o escopo encontrasse
  // as linhas dele antes das de A.
  async function seed(pool: Pool): Promise<void> {
    await pool.query(`
      INSERT INTO events (id, user_id, name, started_at) VALUES
        ('B0000000000000000000000001', 'user-b', 'Segredo do B', '2026-09-15T12:00:00Z'),
        ('A0000000000000000000000001', 'user-a', 'Treino', '2026-09-15T12:00:00Z'),
        ('A0000000000000000000000002', 'user-a', 'Apagado', '2026-09-15T13:00:00Z');
      UPDATE events SET deleted_at = now() WHERE id = 'A0000000000000000000000002';
      INSERT INTO tasks (id, user_id, name) VALUES
        ('BT000000000000000000000001', 'user-b', 'Tarefa do B'),
        ('AT000000000000000000000001', 'user-a', 'Tarefa do A');
      INSERT INTO notes (id, user_id, name, type, schema_version, data) VALUES
        ('BN000000000000000000000001', 'user-b', 'Sono do B', 'sleep', 1, '{"trackedSleepTime": 999, "score": 1}'),
        ('BN000000000000000000000002', 'user-b', 'nota do B', 'text', 1, '{"body": "nota do B"}'),
        ('AN000000000000000000000001', 'user-a', 'Sono', 'sleep', 1, '{"trackedSleepTime": 420, "score": 80}'),
        ('AN000000000000000000000002', 'user-a', 'Sono apagado', 'sleep', 1, '{"trackedSleepTime": 60, "score": 10}'),
        ('AN000000000000000000000003', 'user-a', 'nota do A', 'text', 1, '{"body": "nota do A"}');
      INSERT INTO event_notes (event_id, note_id, position) VALUES
        ('B0000000000000000000000001', 'BN000000000000000000000001', 0),
        ('A0000000000000000000000001', 'AN000000000000000000000001', 0),
        ('A0000000000000000000000002', 'AN000000000000000000000002', 0),
        -- A ligacao cruza usuarios (evento de B, nota de A): nao aparece para nenhum dos dois.
        ('B0000000000000000000000001', 'AN000000000000000000000003', 1);
      INSERT INTO task_notes (task_id, note_id, position) VALUES
        ('AT000000000000000000000001', 'AN000000000000000000000003', 0),
        ('BT000000000000000000000001', 'BN000000000000000000000002', 0);
      INSERT INTO event_tasks (event_id, task_id) VALUES
        ('B0000000000000000000000001', 'AT000000000000000000000001');
      INSERT INTO agent_conversations (id, user_id, title) VALUES
        ('C0000000000000000000000001', 'user-b', 'Conversa do B'),
        ('C0000000000000000000000002', 'user-a', 'Conversa do A'),
        ('C0000000000000000000000003', 'user-a', 'Conversa apagada');
      UPDATE agent_conversations SET deleted_at = now() WHERE id = 'C0000000000000000000000003';
      INSERT INTO agent_chat_messages (id, conversation_id, seq, role, content) VALUES
        ('M0000000000000000000000001', 'C0000000000000000000000001', 1, 'user', 'segredo do B'),
        ('M0000000000000000000000002', 'C0000000000000000000000002', 1, 'user', 'corro 10 km por semana'),
        ('M0000000000000000000000003', 'C0000000000000000000000002', 2, 'assistant', 'Anotado.'),
        ('M0000000000000000000000004', 'C0000000000000000000000003', 1, 'user', 'conversa que eu apaguei');
    `);
  }

  async function rows(sql: string, userId = "user-a") {
    const outcome = await query.run({ userId, sql, scope: OWNER });
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome;
  }

  test("sees only the target user's live rows", async () => {
    expect((await rows("SELECT name FROM events ORDER BY name")).rows).toEqual([["Treino"]]);
    // Pelo vinculo, so a note do evento vivo: o evento apagado esconde o vinculo, nao a note.
    expect(
      (await rows("SELECT n.data->>'trackedSleepTime' FROM event_notes en JOIN notes n ON n.id = en.note_id")).rows,
    ).toEqual([["420"]]);
    expect((await rows("SELECT name FROM notes WHERE type = 'text'")).rows).toEqual([["nota do A"]]);
    expect((await rows("SELECT count(*)::int FROM notes")).rows).toEqual([[3]]);
    expect((await rows("SELECT name FROM tasks")).rows).toEqual([["Tarefa do A"]]);
    expect((await rows("SELECT n.name FROM task_notes tn JOIN notes n ON n.id = tn.note_id")).rows).toEqual([["nota do A"]]);
    expect((await rows("SELECT note_id FROM event_notes ORDER BY position")).rows).toEqual([["AN000000000000000000000001"]]);
    expect((await rows("SELECT note_id FROM event_notes", "user-b")).rows).toEqual([["BN000000000000000000000001"]]);
    // A ligacao cruza usuarios (evento de B, tarefa de A): nao aparece para nenhum dos dois.
    expect((await rows("SELECT * FROM event_tasks")).rows).toEqual([]);
    expect((await rows("SELECT * FROM event_tasks", "user-b")).rows).toEqual([]);
  });

  test("recurrences mostra so as series do proprio usuario, sem o template cru", async () => {
    await ctx.pool.query(`
      INSERT INTO recurrences (id, user_id, target_kind, freq, interval_count, byweekday, time_of_day, duration_minutes, starts_on, template) VALUES
        ('RB000000000000000000000001', 'user-b', 'event', 'daily', 1, NULL, '06:00', NULL, '2026-09-01', '{"name": "Segredo do B", "kind": "routine"}'),
        ('RA000000000000000000000001', 'user-a', 'event', 'weekly', 1, 10, '07:00', 60, '2026-09-01', '{"name": "Corrida", "kind": "routine", "notes": [{"data": {"inputText": "so o servidor ve"}}]}');
    `);

    const own = await rows(
      "SELECT name, kind, target_kind, freq, byweekday, time_of_day, duration_minutes FROM recurrences",
    );
    expect(own.rows).toEqual([["Corrida", "routine", "event", "weekly", 10, "07:00", 60]]);
    expect((await rows("SELECT name FROM recurrences", "user-b")).rows).toEqual([["Segredo do B"]]);
    // O jsonb do template nao e uma coluna: so o que o logical-schema escolheu expor.
    expect((await query.run({ userId: "user-a", sql: "SELECT template FROM recurrences", scope: OWNER })).ok).toBe(false);
  });

  test("chat_messages so mostra as conversas vivas do proprio usuario", async () => {
    const outcome = await rows("SELECT seq, role, content FROM chat_messages ORDER BY seq");

    expect(outcome.rows).toEqual([
      [1, "user", "corro 10 km por semana"],
      [2, "assistant", "Anotado."],
    ]);
    // A mensagem nao tem deleted_at: some porque o CTE junta com a conversa, e a
    // conversa apagada nao passa pelo filtro do pai.
    expect(outcome.rows.flat()).not.toContain("conversa que eu apaguei");
    expect(outcome.rows.flat()).not.toContain("segredo do B");
  });

  test("o historico do chat sai do escopo quando o ator nao e o dono", async () => {
    const outcome = await query.run({
      userId: "user-a",
      sql: "SELECT content FROM chat_messages",
      scope: { includeChat: false },
    });

    // Recusado na validacao, antes de tocar o banco: a tabela nao existe nesse escopo.
    expect(outcome).toEqual({ ok: false, error: "Tabela desconhecida: chat_messages." });
  });

  test("a user CTE named like a table still reads the scoped table", async () => {
    const outcome = await rows("WITH events AS (SELECT * FROM events) SELECT count(*)::int FROM events");
    expect(outcome.rows).toEqual([[1]]);
  });

  test("aggregations, joins and date functions run in America/Sao_Paulo", async () => {
    const outcome = await rows(`
      SELECT e.started_on, e.started_at, sum((i.data->>'trackedSleepTime')::int) AS minutes,
             EXTRACT(hour FROM e.started_at) AS local_hour
      FROM events e JOIN event_notes en ON en.event_id = e.id JOIN notes i ON i.id = en.note_id
      WHERE i.type = 'sleep' AND e.started_at > timestamptz '2026-09-01' - interval '1 day'
      GROUP BY e.started_on, e.started_at
    `);

    expect(outcome.columns).toEqual(["started_on", "started_at", "minutes", "local_hour"]);
    expect(outcome.rows).toEqual([["2026-09-15", "2026-09-15 09:00:00-03", "420", "9"]]);
  });

  test("a failing cast only ever sees the target user's values", async () => {
    const outcome = await query.run({ userId: "user-a", sql: "SELECT id FROM events WHERE name::int = 1", scope: OWNER });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("Treino");
    expect(outcome.error).not.toContain("Segredo");
  });

  test("rejects bypass attempts before touching the database", async () => {
    const attempts = [
      "SELECT name FROM public.events",
      "SELECT (WITH tags AS (SELECT 1) SELECT 1), (SELECT count(*) FROM tags)",
      "SELECT name FROM events WHERE user_id = 'user-b' OR true",
      "SELECT set_config('x', 'y', true)",
    ];
    for (const sql of attempts) {
      const outcome = await query.run({ userId: "user-a", sql, scope: OWNER });
      expect(outcome.ok, sql).toBe(false);
    }
  });

  test("caps rows and flags the truncation", async () => {
    const small = new PostgresScopedSqlQuery(ctx.pool, {
      rowCap: 1,
      timeoutMs: 3000,
      maxCellChars: 5,
      maxTotalChars: 20_000,
      maxErrorChars: 300,
    });
    await ctx.pool.query(`INSERT INTO tasks (id, user_id, name) VALUES ('AT000000000000000000000002', 'user-a', 'Outra tarefa longa')`);

    const outcome = await small.run({ userId: "user-a", sql: "SELECT name FROM tasks ORDER BY name", scope: OWNER });

    expect(outcome).toEqual({ ok: true, columns: ["name"], rows: [["Outra…"]], truncated: true });
  });

  test("times out and leaves the pooled connection clean", async () => {
    const pool = new Pool({ connectionString: ctx.connectionString, max: 1 });
    try {
      await pool.query(`
        INSERT INTO events (id, user_id, name, started_at)
        SELECT lpad(n::text, 26, 'Z'), 'user-a', 'massa', now() FROM generate_series(1, 3000) AS n
      `);
      const slow = new PostgresScopedSqlQuery(pool, {
        rowCap: 10,
        timeoutMs: 200,
        maxCellChars: 500,
        maxTotalChars: 20_000,
        maxErrorChars: 300,
      });

      const outcome = await slow.run({
        userId: "user-a",
        sql: "SELECT count(*) FROM events a, events b, events c",
        scope: OWNER,
      });

      expect(outcome).toEqual({ ok: false, error: "canceling statement due to statement timeout" });
      const { rows: settings } = await pool.query("SHOW statement_timeout");
      expect(settings[0].statement_timeout).toBe("0");
      const { rows: readOnly } = await pool.query("SHOW transaction_read_only");
      expect(readOnly[0].transaction_read_only).toBe("off");
    } finally {
      await pool.end();
    }
  });
});
