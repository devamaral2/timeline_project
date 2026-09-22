import { describe, expect, test } from "vitest";
import { validateAgentSql } from "./validate-agent-sql";

/** O escopo normal: o ator e o dono dos dados. */
const OWNER = { includeChat: true };

const REJECTED: Array<[string, string]> = [
  ["delete", "DELETE FROM events"],
  ["update", "UPDATE events SET name = 'x'"],
  ["insert", "INSERT INTO notes (id) VALUES ('x')"],
  ["merge", "MERGE INTO notes n USING events e ON n.id = e.id WHEN MATCHED THEN DELETE"],
  ["explain analyze", "EXPLAIN ANALYZE SELECT 1"],
  ["set", "SET statement_timeout = 0"],
  ["show", "SHOW search_path"],
  ["copy", "COPY events TO STDOUT"],
  ["do", "DO $$ BEGIN END $$"],
  ["call", "CALL some_proc()"],
  ["two statements", "SELECT 1; SELECT 2"],
  ["data-modifying CTE", "WITH x AS (DELETE FROM events RETURNING *) SELECT * FROM x"],
  ["for update", "SELECT * FROM events FOR UPDATE"],
  ["select into", "SELECT * INTO copy_of_events FROM events"],
  ["schema-qualified logical table", "SELECT * FROM public.events"],
  ["catalog table", "SELECT * FROM pg_catalog.pg_class"],
  ["unqualified catalog table", "SELECT * FROM pg_class"],
  ["information_schema", "SELECT * FROM information_schema.tables"],
  ["hidden table recurrences", "SELECT * FROM recurrences"],
  ["hidden table tags", "SELECT * FROM tags"],
  ["hidden table food", "SELECT * FROM food"],
  ["quoted uppercase name", 'SELECT * FROM "Events"'],
  ["CTE from a sibling subquery", "SELECT (WITH tags AS (SELECT 1) SELECT 1), (SELECT count(*) FROM tags)"],
  ["CTE declared after its user", "WITH a AS (SELECT * FROM tags), tags AS (SELECT 1) SELECT * FROM a"],
  ["CTE from the other UNION branch", "(WITH tags AS (SELECT 1 AS x) SELECT x FROM tags) UNION SELECT count(*) FROM tags"],
  ["recursive CTE", "WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r) SELECT * FROM r"],
  ["pg_sleep", "SELECT pg_sleep(10)"],
  ["set_config", "SELECT set_config('app.user_id', 'x', true)"],
  ["current_setting", "SELECT current_setting('search_path')"],
  ["advisory lock", "SELECT pg_advisory_lock(1)"],
  ["dblink", "SELECT * FROM events WHERE dblink('x', 'y') IS NOT NULL"],
  ["lo_import", "SELECT lo_import('/etc/passwd')"],
  ["pg_read_file", "SELECT pg_read_file('/etc/passwd')"],
  ["nextval", "SELECT nextval('x')"],
  ["version", "SELECT version()"],
  ["query_to_xml", "SELECT query_to_xml('select * from tags', true, true, '')"],
  ["txid_current", "SELECT txid_current()"],
  ["current_user", "SELECT current_user"],
  ["session_user", "SELECT session_user"],
  ["explicit pg_catalog call", "SELECT pg_catalog.lower(name) FROM events"],
  ["generate_series in FROM", "SELECT * FROM generate_series(1, 10)"],
  ["ROWS FROM", "SELECT * FROM ROWS FROM (jsonb_array_elements('[]'))"],
  ["JSON_TABLE", "SELECT * FROM JSON_TABLE('[]'::jsonb, '$[*]' COLUMNS (a int PATH '$.a'))"],
  ["XMLTABLE", "SELECT * FROM XMLTABLE('/a' PASSING '<a/>' COLUMNS b text)"],
  ["TABLESAMPLE", "SELECT * FROM events TABLESAMPLE SYSTEM (10)"],
  ["regclass cast", "SELECT 'pg_authid'::regclass"],
  ["qualified reg cast", "SELECT 'now'::pg_catalog.regproc"],
  ["oid cast", "SELECT 1::oid"],
  ["parameter", "SELECT * FROM events WHERE id = $1"],
  ["qualified operator", "SELECT * FROM events WHERE name OPERATOR(pg_catalog.=) 'x'"],
  ["collate", 'SELECT name COLLATE "C" FROM events'],
  ["too long", `SELECT 1 ${"-- padding\n".repeat(500)}`],
  ["syntax error", "SELEC 1"],
];

const ACCEPTED: Array<[string, string]> = [
  ["plain select", "SELECT id, name FROM events"],
  ["date functions", "SELECT date_trunc('week', now()), started_on FROM events WHERE started_at > now() - interval '7 days'"],
  ["extract at time zone", "SELECT EXTRACT(dow FROM started_at AT TIME ZONE 'America/Sao_Paulo') FROM events"],
  ["cast", "SELECT CAST(position AS integer), position::text, started_at::date FROM event_items, events"],
  ["conditional expressions", "SELECT COALESCE(description, ''), NULLIF(name, ''), GREATEST(1, 2), CASE WHEN missed THEN 1 ELSE 0 END FROM events"],
  ["jsonb", "SELECT data->>'trackedSleepTime', (data->'totals'->>'totalCaloriesKcal')::numeric FROM event_items WHERE type = 'sleep'"],
  ["set-returning function in select list", "SELECT jsonb_array_elements(data->'foodItems')->>'name' FROM event_items"],
  ["window function", "SELECT name, row_number() OVER (PARTITION BY started_on ORDER BY started_at DESC) FROM events"],
  ["aggregate with filter", "SELECT started_on, count(*) FILTER (WHERE missed) FROM events GROUP BY started_on ORDER BY 1"],
  ["join and exists", "SELECT t.name FROM tasks t JOIN task_tags tt ON tt.task_id = t.id WHERE EXISTS (SELECT 1 FROM notes n WHERE n.task_id = t.id)"],
  ["user CTE shadowing a table", "WITH events AS (SELECT * FROM events WHERE missed) SELECT count(*) FROM events"],
  ["nested WITH", "SELECT * FROM (WITH x AS (SELECT id FROM tasks) SELECT * FROM x) q"],
  ["CTE used by both union branches", "WITH x AS (SELECT id FROM tasks) SELECT id FROM x UNION SELECT id FROM x"],
  ["TABLE shorthand", "TABLE events"],
  ["like escape", "SELECT * FROM notes WHERE content LIKE '%50!%%' ESCAPE '!'"],
  ["current_date", "SELECT * FROM events WHERE started_on = CURRENT_DATE"],
  ["trailing semicolon", "SELECT 1;"],
];

describe("validateAgentSql", () => {
  test.each(REJECTED)("rejects %s", async (_label, sql) => {
    const result = await validateAgentSql(sql, OWNER);
    expect(result.ok).toBe(false);
  });

  test.each(ACCEPTED)("accepts %s", async (_label, sql) => {
    const result = await validateAgentSql(sql, OWNER);
    expect(result).toMatchObject({ ok: true });
  });

  test("explains what was refused", async () => {
    expect(await validateAgentSql("SELECT pg_sleep(1)", OWNER)).toEqual({
      ok: false,
      error: "Função não permitida: pg_sleep.",
    });
    expect(await validateAgentSql("SELECT * FROM tags", OWNER)).toEqual({
      ok: false,
      error: "Tabela desconhecida: tags.",
    });
  });
});

test("chat_messages existe ou nao conforme o escopo", async () => {
  const sql = "SELECT content FROM chat_messages";

  expect(await validateAgentSql(sql, OWNER)).toMatchObject({ ok: true });
  // Sem o chat no escopo a tabela nao e "proibida": ela nao existe, e o erro e o
  // mesmo de qualquer nome desconhecido. Nada no texto conta ao modelo do admin
  // que ha um historico de conversa que ele nao esta vendo.
  expect(await validateAgentSql(sql, { includeChat: false })).toEqual({
    ok: false,
    error: "Tabela desconhecida: chat_messages.",
  });
});
