import { describe, expect, test } from "vitest";
import { validateAgentSql } from "./validate-agent-sql";

const REJECTED: Array<[string, string]> = [
  ["delete", "DELETE FROM tasks"],
  ["update", "UPDATE tasks SET name = 'x'"],
  ["insert", "INSERT INTO artifacts (id) VALUES ('x')"],
  ["merge", "MERGE INTO artifacts n USING tasks e ON n.id = e.id WHEN MATCHED THEN DELETE"],
  ["explain analyze", "EXPLAIN ANALYZE SELECT 1"],
  ["set", "SET statement_timeout = 0"],
  ["show", "SHOW search_path"],
  ["copy", "COPY tasks TO STDOUT"],
  ["do", "DO $$ BEGIN END $$"],
  ["call", "CALL some_proc()"],
  ["two statements", "SELECT 1; SELECT 2"],
  ["data-modifying CTE", "WITH x AS (DELETE FROM tasks RETURNING *) SELECT * FROM x"],
  ["for update", "SELECT * FROM tasks FOR UPDATE"],
  ["select into", "SELECT * INTO copy_of_tasks FROM tasks"],
  ["schema-qualified logical table", "SELECT * FROM public.tasks"],
  ["catalog table", "SELECT * FROM pg_catalog.pg_class"],
  ["unqualified catalog table", "SELECT * FROM pg_class"],
  ["information_schema", "SELECT * FROM information_schema.tables"],
  // `recurrences` e visivel (so as colunas do logical-schema); a de excecoes nao.
  ["hidden table recurrence_exceptions", "SELECT * FROM recurrence_exceptions"],
  ["hidden table tags", "SELECT * FROM tags"],
  ["hidden table jobs", "SELECT * FROM jobs"],
  ["hidden table task_entries", "SELECT * FROM task_entries"],
  ["hidden relation graph", "SELECT * FROM task_task_relation"],
  ["quoted uppercase name", 'SELECT * FROM "Tasks"'],
  ["CTE from a sibling subquery", "SELECT (WITH tags AS (SELECT 1) SELECT 1), (SELECT count(*) FROM tags)"],
  ["CTE declared after its user", "WITH a AS (SELECT * FROM tags), tags AS (SELECT 1) SELECT * FROM a"],
  ["CTE from the other UNION branch", "(WITH tags AS (SELECT 1 AS x) SELECT x FROM tags) UNION SELECT count(*) FROM tags"],
  ["recursive CTE", "WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r) SELECT * FROM r"],
  ["pg_sleep", "SELECT pg_sleep(10)"],
  ["set_config", "SELECT set_config('app.user_id', 'x', true)"],
  ["current_setting", "SELECT current_setting('search_path')"],
  ["advisory lock", "SELECT pg_advisory_lock(1)"],
  ["dblink", "SELECT * FROM tasks WHERE dblink('x', 'y') IS NOT NULL"],
  ["lo_import", "SELECT lo_import('/etc/passwd')"],
  ["pg_read_file", "SELECT pg_read_file('/etc/passwd')"],
  ["nextval", "SELECT nextval('x')"],
  ["version", "SELECT version()"],
  ["query_to_xml", "SELECT query_to_xml('select * from tags', true, true, '')"],
  ["txid_current", "SELECT txid_current()"],
  ["current_user", "SELECT current_user"],
  ["session_user", "SELECT session_user"],
  ["explicit pg_catalog call", "SELECT pg_catalog.lower(name) FROM tasks"],
  ["generate_series in FROM", "SELECT * FROM generate_series(1, 10)"],
  ["ROWS FROM", "SELECT * FROM ROWS FROM (jsonb_array_elements('[]'))"],
  ["JSON_TABLE", "SELECT * FROM JSON_TABLE('[]'::jsonb, '$[*]' COLUMNS (a int PATH '$.a'))"],
  ["XMLTABLE", "SELECT * FROM XMLTABLE('/a' PASSING '<a/>' COLUMNS b text)"],
  ["TABLESAMPLE", "SELECT * FROM tasks TABLESAMPLE SYSTEM (10)"],
  ["regclass cast", "SELECT 'pg_authid'::regclass"],
  ["qualified reg cast", "SELECT 'now'::pg_catalog.regproc"],
  ["oid cast", "SELECT 1::oid"],
  ["parameter", "SELECT * FROM tasks WHERE id = $1"],
  ["qualified operator", "SELECT * FROM tasks WHERE name OPERATOR(pg_catalog.=) 'x'"],
  ["collate", 'SELECT name COLLATE "C" FROM tasks'],
  ["too long", `SELECT 1 ${"-- padding\n".repeat(500)}`],
  ["syntax error", "SELEC 1"],
];

const ACCEPTED: Array<[string, string]> = [
  ["plain select", "SELECT id, name FROM tasks"],
  ["date functions", "SELECT date_trunc('week', now()), started_on FROM tasks WHERE started_at > now() - interval '7 days'"],
  ["extract at time zone", "SELECT EXTRACT(dow FROM started_at AT TIME ZONE 'America/Sao_Paulo') FROM tasks"],
  ["cast", "SELECT CAST(position AS integer), position::text, started_at::date FROM task_artifacts, tasks"],
  ["conditional expressions", "SELECT COALESCE(description, ''), NULLIF(name, ''), GREATEST(1, 2), CASE WHEN missed THEN 1 ELSE 0 END FROM tasks"],
  ["jsonb", "SELECT data->>'trackedSleepTime', (data->'totals'->>'totalCaloriesKcal')::numeric FROM artifacts WHERE type = 'sleep'"],
  ["set-returning function in select list", "SELECT jsonb_array_elements(data->'items')->>'name' FROM artifacts"],
  ["window function", "SELECT name, row_number() OVER (PARTITION BY started_on ORDER BY started_at DESC) FROM tasks"],
  ["aggregate with filter", "SELECT started_on, count(*) FILTER (WHERE missed) FROM tasks GROUP BY started_on ORDER BY 1"],
  ["join and exists", "SELECT t.name FROM tasks t JOIN task_tags tt ON tt.task_id = t.id WHERE EXISTS (SELECT 1 FROM task_artifacts tn WHERE tn.task_id = t.id)"],
  ["user CTE shadowing a table", "WITH tasks AS (SELECT * FROM tasks WHERE missed) SELECT count(*) FROM tasks"],
  ["nested WITH", "SELECT * FROM (WITH x AS (SELECT id FROM tasks) SELECT * FROM x) q"],
  ["CTE used by both union branches", "WITH x AS (SELECT id FROM tasks) SELECT id FROM x UNION SELECT id FROM x"],
  ["TABLE shorthand", "TABLE tasks"],
  ["like escape", "SELECT * FROM artifacts WHERE name LIKE '%50!%%' ESCAPE '!'"],
  ["current_date", "SELECT * FROM tasks WHERE started_on = CURRENT_DATE"],
  ["trailing semicolon", "SELECT 1;"],
];

describe("validateAgentSql", () => {
  test.each(REJECTED)("rejects %s", async (_label, sql) => {
    const result = await validateAgentSql(sql);
    expect(result.ok).toBe(false);
  });

  test.each(ACCEPTED)("accepts %s", async (_label, sql) => {
    const result = await validateAgentSql(sql);
    expect(result).toMatchObject({ ok: true });
  });

  test("explains what was refused", async () => {
    expect(await validateAgentSql("SELECT pg_sleep(1)")).toEqual({
      ok: false,
      error: "Função não permitida: pg_sleep.",
    });
    expect(await validateAgentSql("SELECT * FROM tags")).toEqual({
      ok: false,
      error: "Tabela desconhecida: tags.",
    });
  });
});
