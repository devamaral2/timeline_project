import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { SqliteScopedSqlQuery } from "../agent-sql/sqlite-scoped-sql.query";
import { logicalTables } from "../agent-sql/logical-schema";
import { sql } from "../sqlite/sql";
import { GLOBAL_WORKOUT_ID } from "../testing/fixtures";
import { createSqliteTestContext, type SqliteTestContext } from "../testing/sqlite-test-context";

const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(26 - prefix.length, "0")}`;

// Tarefas de pessoa
const A_TRAINING = id("AE", 1);
const A_DELETED = id("AE", 2);
const A_TRACKED = id("AE", 3);
const B_TASK = id("BE", 1);
const B_TRACKED = id("BE", 2);
// Tarefas de agente do usuario A
const A_REQUEST = id("AG", 1);
const A_STEP = id("AG", 2);
// Artefatos
const A_SLEEP = id("AN", 1);
const A_SLEEP_DELETED = id("AN", 2);
const A_TEXT = id("AN", 3);
const A_SKILL = id("AN", 4);
const B_SLEEP = id("BN", 1);
const B_TEXT = id("BN", 2);

describe("SqliteScopedSqlQuery (SQLite)", () => {
  let ctx: SqliteTestContext;
  let query: SqliteScopedSqlQuery;

  beforeAll(async () => {
    ctx = await createSqliteTestContext();
    query = new SqliteScopedSqlQuery(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
    seed();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  // SQL cru de proposito: o cenario tem relacoes cruzando usuarios, que os repositorios recusam.
  // As linhas de B entram primeiro, para que uma varredura que ignorasse o escopo as encontrasse antes das de A.
  function seed(): void {
    ctx.database.handle.exec(`
      INSERT INTO projects (id, user_id, name, personal) VALUES
        ('${id("PB", 1)}', 'user-b', 'diario', 1),
        ('${id("PA", 1)}', 'user-a', 'diario', 1);
      INSERT INTO tasks (id, project_id, user_id, actor, kind, status, name, started_at) VALUES
        ('${B_TASK}', '${id("PB", 1)}', 'user-b', 'human', 'common', NULL, 'Segredo do B', '2026-09-15T12:00:00.000Z'),
        ('${B_TRACKED}', '${id("PB", 1)}', 'user-b', 'human', 'common', 'todo', 'Tarefa do B', NULL),
        ('${A_TRAINING}', '${id("PA", 1)}', 'user-a', 'human', 'training', NULL, 'Treino', '2026-09-15T12:00:00.000Z'),
        ('${A_DELETED}', '${id("PA", 1)}', 'user-a', 'human', 'common', NULL, 'Apagado', '2026-09-15T13:00:00.000Z'),
        ('${A_TRACKED}', '${id("PA", 1)}', 'user-a', 'human', 'common', 'todo', 'Tarefa do A', NULL),
        ('${A_REQUEST}', '${id("PA", 1)}', 'user-a', 'agent', 'request', 'completed', 'Pedido do A', '2026-09-15T14:00:00.000Z'),
        ('${A_STEP}', '${id("PA", 1)}', 'user-a', 'agent', 'step', 'completed', 'Passo do A', '2026-09-15T14:00:01.000Z');
      UPDATE tasks SET deleted_at = '2026-09-16T00:00:00.000Z' WHERE id = '${A_DELETED}';

      INSERT INTO task_entries (id, task_id, user_id, kind, role, content) VALUES
        ('${id("EN", 1)}', '${A_REQUEST}', 'user-a', 'message', 'user', 'corro 10 km por semana');

      INSERT INTO artifacts (id, user_id, name, type, data) VALUES
        ('${B_SLEEP}', 'user-b', 'Sono do B', 'sleep', '{"trackedSleepTime": 999, "score": 1}'),
        ('${B_TEXT}', 'user-b', 'nota do B', 'text', '{"body": "nota do B"}'),
        ('${A_SLEEP}', 'user-a', 'Sono', 'sleep', '{"trackedSleepTime": 420, "score": 80}'),
        ('${A_SLEEP_DELETED}', 'user-a', 'Sono apagado', 'sleep', '{"trackedSleepTime": 60, "score": 10}'),
        ('${A_TEXT}', 'user-a', 'nota do A', 'text', '{"body": "nota do A"}'),
        ('${A_SKILL}', 'user-a', 'Skill do A', 'skill', '{"path": "hermes/skills/x/SKILL.md", "missing": false}');
      UPDATE artifacts SET deleted_at = '2026-09-16T00:00:00.000Z' WHERE id = '${A_SLEEP_DELETED}';

      INSERT INTO task_artifact_relation (task_id, artifact_id, relation, position) VALUES
        ('${B_TASK}', '${B_SLEEP}', 'uses', 0),
        ('${A_TRAINING}', '${A_SLEEP}', 'uses', 0),
        -- artefato apagado: a relacao some
        ('${A_TRAINING}', '${A_SLEEP_DELETED}', 'uses', 1),
        -- artefato global: aparece
        ('${A_TRAINING}', '${GLOBAL_WORKOUT_ID}', 'uses', 2),
        -- tarefa apagada: a relacao some, o artefato nao
        ('${A_DELETED}', '${A_TEXT}', 'uses', 0),
        -- cruza usuarios (tarefa de B, artefato de A): nao aparece para nenhum dos dois
        ('${B_TASK}', '${A_TEXT}', 'uses', 1),
        -- tarefa de agente e arquivo de agente: fora do esquema logico
        ('${A_REQUEST}', '${A_TEXT}', 'updates', NULL),
        ('${A_TRACKED}', '${A_SKILL}', 'uses', 0);

      INSERT INTO task_task_relation (from_task_id, to_task_id, relation) VALUES
        ('${A_TRACKED}', '${A_TRAINING}', 'subtask'),
        ('${A_TRACKED}', '${A_DELETED}', 'subtask'),
        ('${A_REQUEST}', '${A_STEP}', 'step'),
        ('${A_STEP}', '${A_TRAINING}', 'generates'),
        -- agente nos dois sentidos: fora da hierarquia das pessoas
        ('${A_REQUEST}', '${A_TRACKED}', 'subtask'),
        ('${A_TRAINING}', '${A_STEP}', 'subtask'),
        -- cruza usuarios: nao aparece para nenhum dos dois
        ('${B_TRACKED}', '${A_REQUEST}', 'subtask'),
        ('${A_TRAINING}', '${B_TASK}', 'subtask'),
        ('${B_TASK}', '${B_TRACKED}', 'subtask');

      INSERT INTO tags (id, user_id, name) VALUES
        ('${id("TB", 1)}', 'user-b', 'segredo'),
        ('${id("TA", 1)}', 'user-a', 'saude');
      INSERT INTO task_tags (task_id, tag_id) VALUES
        ('${B_TASK}', '${id("TB", 1)}'),
        ('${A_TRAINING}', '${id("TA", 1)}'),
        ('${A_DELETED}', '${id("TA", 1)}'),
        ('${A_REQUEST}', '${id("TA", 1)}');
      INSERT INTO artifact_tags (artifact_id, tag_id) VALUES
        ('${B_TEXT}', '${id("TB", 1)}'),
        ('${A_TEXT}', '${id("TA", 1)}'),
        ('${A_SLEEP_DELETED}', '${id("TA", 1)}'),
        ('${A_SKILL}', '${id("TA", 1)}');
    `);
  }

  function seedRecurrences(): void {
    ctx.database.handle.exec(`
      INSERT INTO recurrences (id, project_id, user_id, freq, interval_count, byweekday, time_of_day, duration_minutes, starts_on, template) VALUES
        ('${id("RB", 1)}', '${id("PB", 1)}', 'user-b', 'daily', 1, NULL, '06:00:00', NULL, '2026-09-01', '{"name": "Segredo do B", "kind": "common"}'),
        ('${id("RA", 1)}', '${id("PA", 1)}', 'user-a', 'weekly', 1, 10, '07:00:00', 60, '2026-09-01',
          '{"name": "Corrida", "kind": "training", "status": "todo", "artifactIds": ["so o servidor ve"]}');
      UPDATE tasks SET recurrence_id = '${id("RA", 1)}', occurrence_on = '2026-09-15' WHERE id = '${A_TRAINING}';
    `);
  }

  async function rows(sql: string, userId = "user-a") {
    const outcome = await query.run({ userId, sql });
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.rows;
  }

  function count(table: string, where = "1 = 1"): number {
    const row = ctx.database.handle.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number };
    return row.n;
  }

  test("tasks mostra so as tarefas vivas de pessoa do proprio usuario", async () => {
    expect(await rows("SELECT name, kind, status FROM tasks ORDER BY name")).toEqual([
      ["Tarefa do A", "common", "todo"],
      ["Treino", "training", null],
    ]);
    expect(await rows("SELECT name FROM tasks ORDER BY name", "user-b")).toEqual([["Segredo do B"], ["Tarefa do B"]]);
    expect(await rows("SELECT name FROM tasks ORDER BY name", "user-sem-dados")).toEqual([]);
    // Os pedidos e os passos do agente nao sao tarefas para a consulta, nem os do proprio usuario.
    expect(await rows("SELECT count(*) FROM tasks WHERE kind IN ('request', 'step') OR status = 'done'")).toEqual([[0]]);
  });

  test("tasks traz o nome do projeto da tarefa de pessoa, e o projeto de outro usuario nao aparece", async () => {
    ctx.database.handle.exec(`
      INSERT INTO projects (id, user_id, name) VALUES ('${id("PA", 2)}', 'user-a', 'braid'), ('${id("PB", 2)}', 'user-b', 'segredo-do-b');
      UPDATE tasks SET project_id = '${id("PA", 2)}' WHERE id = '${A_TRACKED}';
      UPDATE tasks SET project_id = '${id("PB", 2)}' WHERE id = '${B_TRACKED}';
    `);

    expect(await rows("SELECT name, project FROM tasks ORDER BY name")).toEqual([
      ["Tarefa do A", "braid"],
      ["Treino", "diario"],
    ]);
    expect(await rows("SELECT name FROM tasks WHERE project = 'braid'")).toEqual([["Tarefa do A"]]);
    expect(await rows("SELECT project FROM tasks WHERE project <> 'diario'", "user-b")).toEqual([["segredo-do-b"]]);
    // Os pedidos do agente, que tambem tem projeto, continuam fora.
    expect(await rows("SELECT count(*) FROM tasks WHERE kind IN ('request', 'step')")).toEqual([[0]]);
  });

  test("artifacts mostra os artefatos vivos do usuario e os globais, sem os arquivos de agente", async () => {
    expect(await rows("SELECT name, type FROM artifacts WHERE NOT global ORDER BY name")).toEqual([
      ["Sono", "sleep"],
      ["nota do A", "text"],
    ]);
    expect(await rows("SELECT name FROM artifacts WHERE NOT global ORDER BY name", "user-b")).toEqual([
      ["Sono do B"],
      ["nota do B"],
    ]);
    // Os cinco exercicios da migration, para qualquer usuario.
    expect(await rows("SELECT count(*), min(type) FROM artifacts WHERE global")).toEqual([[5, "workout"]]);
    expect(await rows("SELECT data->>'code' FROM artifacts WHERE global ORDER BY 1", "user-b")).toEqual([
      ["free"],
      ["running"],
      ["treadmill"],
      ["walking"],
      ["weightlifting"],
    ]);
  });

  test("task_artifacts esconde a relacao cuja tarefa ou artefato esta apagado, e de agente ou de outro usuario", async () => {
    expect(await rows("SELECT task_id, artifact_id, relation, position FROM task_artifacts ORDER BY position")).toEqual([
      [A_TRAINING, A_SLEEP, "uses", 0],
      [A_TRAINING, GLOBAL_WORKOUT_ID, "uses", 2],
    ]);
    expect(await rows("SELECT task_id, artifact_id FROM task_artifacts", "user-b")).toEqual([[B_TASK, B_SLEEP]]);
    // A tarefa apagada esconde a relacao, nao o artefato.
    expect(await rows(`SELECT name FROM artifacts WHERE id = '${A_TEXT}'`)).toEqual([["nota do A"]]);
  });

  test("task_subtasks so liga tarefas vivas de pessoa do mesmo usuario, e nao expoe as tabelas antigas", async () => {
    expect(await rows("SELECT parent_task_id, subtask_id FROM task_subtasks")).toEqual([[A_TRACKED, A_TRAINING]]);
    expect(await rows("SELECT parent_task_id, subtask_id FROM task_subtasks", "user-b")).toEqual([[B_TASK, B_TRACKED]]);
    await expect(rows("SELECT * FROM task_sequence")).rejects.toThrow();
    await expect(rows("SELECT * FROM task_blocks")).rejects.toThrow();
  });

  test("task_tags e artifact_tags seguem a visibilidade do dono da tag", async () => {
    expect(await rows("SELECT task_id, tag FROM task_tags")).toEqual([[A_TRAINING, "saude"]]);
    expect(await rows("SELECT artifact_id, tag FROM artifact_tags")).toEqual([[A_TEXT, "saude"]]);
    expect(await rows("SELECT tag FROM task_tags UNION SELECT tag FROM artifact_tags", "user-b")).toEqual([["segredo"]]);
  });

  test("recurrences mostra so as series do proprio usuario, sem o template cru", async () => {
    seedRecurrences();

    expect(
      await rows("SELECT name, kind, status, freq, byweekday, time_of_day, duration_minutes, starts_on, ends_on FROM recurrences"),
    ).toEqual([["Corrida", "training", "todo", "weekly", 10, "07:00", 60, "2026-09-01", null]]);
    expect(await rows("SELECT name FROM recurrences", "user-b")).toEqual([["Segredo do B"]]);
    expect(
      await rows("SELECT r.name, e.occurrence_on FROM tasks e JOIN recurrences r ON r.id = e.recurrence_id"),
    ).toEqual([["Corrida", "2026-09-15"]]);
    // O JSON do template nao e uma coluna: so o que o esquema logico escolheu expor.
    expect((await query.run({ userId: "user-a", sql: "SELECT template FROM recurrences" })).ok).toBe(false);
  });

  test("o SELECT de cada tabela logica devolve exatamente as colunas declaradas", async () => {
    seedRecurrences();
    for (const table of logicalTables()) {
      const found = await ctx.db.all(table.select("user-a"));
      expect(found.length, table.name).toBeGreaterThan(0);
      expect(Object.keys(found[0]), table.name).toEqual(table.columns.map((column) => column.name));
    }
  });

  test("as tabelas do agente e o grafo de relacoes nao existem para a consulta", async () => {
    for (const table of [
      "task_entries",
      "jobs",
      "task_task_relation",
      "task_artifact_relation",
      "artifact_artifact_relation",
      "tags",
      "projects",
      "recurrence_exceptions",
      "idempotency_keys",
      "sqlite_master",
    ]) {
      const outcome = await query.run({ userId: "user-a", sql: `SELECT * FROM ${table}` });
      expect(outcome.ok, table).toBe(false);
      // Mesmo mencionada junto de uma tabela do escopo, ela nao esta no banco em que a consulta roda.
      const joined = await query.run({ userId: "user-a", sql: `SELECT t.id FROM tasks t, ${table} x` });
      expect(joined.ok, table).toBe(false);
    }
    // As colunas de escopo tambem nao: nao ha como pedir as linhas de outro usuario ou as apagadas.
    for (const column of ["user_id", "actor", "deleted_at", "project_id"]) {
      expect((await query.run({ userId: "user-a", sql: `SELECT ${column} FROM tasks` })).ok, column).toBe(false);
    }
  });

  test("a consulta nao alcanca o usuario B por nenhum caminho", async () => {
    // Nada do B aparece em nenhuma tabela, nem varrendo todas, nem por ordem, nem por join sem condicao.
    const everything = await rows(`
      SELECT name FROM tasks UNION ALL SELECT name FROM artifacts WHERE NOT global
      UNION ALL SELECT tag FROM task_tags UNION ALL SELECT tag FROM artifact_tags
      UNION ALL SELECT name FROM recurrences UNION ALL SELECT project FROM tasks
    `);
    const text = JSON.stringify(everything);
    expect(text).not.toMatch(/Segredo|do B|segredo|999/);
    expect(await rows("SELECT count(*) FROM tasks a, tasks b")).toEqual([[4]]);
    expect(await rows("SELECT data->>'trackedSleepTime' FROM artifacts WHERE type = 'sleep'")).toEqual([[420]]);
    expect(await rows("SELECT count(*) FROM artifacts WHERE name LIKE '%B'")).toEqual([[0]]);
  });

  test("cada consulta ve o banco de agora: uma escrita entre duas consultas aparece na seguinte", async () => {
    expect(await rows("SELECT count(*) FROM tasks")).toEqual([[2]]);
    ctx.database.handle.exec(`
      INSERT INTO tasks (id, project_id, user_id, actor, kind, status, name) VALUES
        ('${id("AE", 9)}', '${id("PA", 1)}', 'user-a', 'human', 'common', 'todo', 'Nova')`);
    expect(await rows("SELECT count(*) FROM tasks")).toEqual([[3]]);
  });

  test("um CTE da consulta com o nome de uma tabela do escopo nao abre nada alem dela", async () => {
    const outcome = await query.run({ userId: "user-a", sql: "WITH tasks AS (SELECT * FROM tasks) SELECT count(*) FROM tasks" });
    // Seja qual for a regra do SQLite para o nome repetido, ou recusa ou conta so as tarefas do A.
    if (outcome.ok) expect(outcome.rows).toEqual([[2]]);
  });

  test("agregacoes, joins e datas: o timestamp e texto ISO em UTC e o dia local sai de -3 horas", async () => {
    const outcome = await query.run({
      userId: "user-a",
      sql: `
        SELECT e.started_on, e.started_at, sum(a.data->>'trackedSleepTime') AS minutes,
               CAST(strftime('%H', e.started_at, '-3 hours') AS integer) AS local_hour
        FROM tasks e JOIN task_artifacts ea ON ea.task_id = e.id JOIN artifacts a ON a.id = ea.artifact_id
        WHERE a.type = 'sleep' AND e.started_at > '2026-09-01'
        GROUP BY e.started_on, e.started_at
      `,
    });

    expect(outcome).toEqual({
      ok: true,
      columns: ["started_on", "started_at", "minutes", "local_hour"],
      rows: [["2026-09-15", "2026-09-15T12:00:00.000Z", 420, 9]],
      truncated: false,
    });
  });

  test("tarefa que comeca de madrugada em UTC cai no dia anterior em Sao Paulo", async () => {
    ctx.database.handle.exec(`UPDATE tasks SET started_at = '2026-09-16T01:30:00.000Z' WHERE id = '${A_TRAINING}'`);
    expect(await rows("SELECT started_on, date(started_at) FROM tasks WHERE id = '" + A_TRAINING + "'")).toEqual([["2026-09-15", "2026-09-16"]]);
  });

  test("uma coluna que nao e do esquema falha com a mensagem do SQLite, sem valores de outros usuarios", async () => {
    const outcome = await query.run({ userId: "user-a", sql: "SELECT id FROM tasks WHERE coluna_que_nao_existe = 1" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/no such column/);
    expect(outcome.error).not.toMatch(/Segredo|do B|Pedido|Passo|Apagado/);
  });

  test("recusa tentativas de sair do escopo ou de escrever, e o banco fica como estava", async () => {
    const attempts = [
      "SELECT name FROM main.tasks WHERE user_id = 'user-b'",
      "SELECT name FROM tasks WHERE user_id = 'user-b' OR 1",
      "ATTACH DATABASE '/etc/passwd' AS x",
      "PRAGMA writable_schema = ON",
      "SELECT name FROM tasks; DELETE FROM tasks",
      "DELETE FROM tasks",
      "UPDATE tasks SET name = 'x'",
      "INSERT INTO artifacts (id) VALUES ('x')",
      "WITH gone AS (SELECT id FROM tasks) DELETE FROM tasks WHERE id IN (SELECT id FROM gone)",
      "DROP TABLE tasks",
      "CREATE TABLE copia AS SELECT * FROM tasks",
      "SELECT load_extension('x')",
      "VACUUM INTO '/tmp/agent-sql-vazou.db'",
    ];
    for (const sql of attempts) {
      const outcome = await query.run({ userId: "user-a", sql });
      expect(outcome.ok, sql).toBe(false);
    }

    expect(count("tasks")).toBe(7);
    expect(count("tasks", "name = 'x'")).toBe(0);
    expect(count("artifacts", "id = 'x'")).toBe(0);
  });

  test("a consulta mais longa que o teto de caracteres e recusada antes de tudo", async () => {
    const outcome = await query.run({ userId: "user-a", sql: `SELECT 1 ${"-- padding\n".repeat(500)}` });
    expect(outcome).toEqual({ ok: false, error: "A consulta passa de 4000 caracteres." });
  });

  test("limita as linhas e o tamanho da celula, e avisa que cortou", async () => {
    const small = new SqliteScopedSqlQuery(ctx.db, {
      rowCap: 1,
      timeoutMs: 5000,
      maxCellChars: 5,
      maxTotalChars: 20_000,
      maxErrorChars: 300,
    });

    expect(await small.run({ userId: "user-a", sql: "SELECT name FROM tasks ORDER BY name" })).toEqual({
      ok: true,
      columns: ["name"],
      rows: [["Taref…"]],
      truncated: true,
    });
    expect(await small.run({ userId: "user-a", sql: "SELECT kind FROM tasks WHERE name = 'Treino'" })).toEqual({
      ok: true,
      columns: ["kind"],
      rows: [["train…"]],
      truncated: false,
    });
  });

  test("corta a resposta que passa do total de caracteres", async () => {
    const tight = new SqliteScopedSqlQuery(ctx.db, {
      rowCap: 200,
      timeoutMs: 5000,
      maxCellChars: 500,
      maxTotalChars: 30,
      maxErrorChars: 20,
    });

    expect(await tight.run({ userId: "user-a", sql: "SELECT name FROM tasks ORDER BY name" })).toEqual({
      ok: true,
      columns: ["name"],
      rows: [["Tarefa do A"]],
      truncated: true,
    });
    // A mensagem de erro que volta para o modelo tambem tem teto.
    const failed = await tight.run({ userId: "user-a", sql: "SELECT coluna_que_nao_existe FROM tasks" });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.length).toBeLessThanOrEqual(21);
  });

  test("estoura o tempo, o processo morre e a API segue servindo consultas", async () => {
    ctx.database.handle.exec(`
      INSERT INTO tasks (id, project_id, user_id, actor, kind, name, started_at)
      WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 3000)
      SELECT substr('Z' || printf('%025d', i), 1, 26), '${id("PA", 1)}', 'user-a', 'human', 'common', 'massa', '2026-09-15T12:00:00.000Z' FROM n
    `);
    const slow = new SqliteScopedSqlQuery(ctx.db, {
      rowCap: 10,
      timeoutMs: 400,
      maxCellChars: 500,
      maxTotalChars: 20_000,
      maxErrorChars: 300,
    });

    const started = Date.now();
    const outcome = await slow.run({ userId: "user-a", sql: "SELECT count(*) FROM tasks a, tasks b, tasks c, tasks d" });

    expect(outcome).toEqual({ ok: false, error: "A consulta passou de 400 ms e foi cancelada." });
    expect(Date.now() - started).toBeLessThan(3000);
    // O banco da API nao foi tocado, e a mesma instancia volta a servir consultas.
    expect(count("tasks")).toBe(3007);
    expect(await slow.run({ userId: "user-b", sql: "SELECT count(*) FROM tasks" })).toMatchObject({ ok: true, rows: [[2]] });
    // A leitura da API depois do timeout: o leitor e o escritor seguem de pe.
    expect(await ctx.db.get(sql`SELECT 1 AS n`)).toEqual({ n: 1 });
  });

  test("consultas simultaneas de usuarios diferentes nao se misturam", async () => {
    const outcomes = await Promise.all([
      query.run({ userId: "user-a", sql: "SELECT name FROM tasks ORDER BY name" }),
      query.run({ userId: "user-b", sql: "SELECT name FROM tasks ORDER BY name" }),
      query.run({ userId: "user-sem-dados", sql: "SELECT name FROM tasks ORDER BY name" }),
    ]);

    expect(outcomes).toMatchObject([
      { ok: true, rows: [["Tarefa do A"], ["Treino"]] },
      { ok: true, rows: [["Segredo do B"], ["Tarefa do B"]] },
      { ok: true, rows: [] },
    ]);
  });

  test("a descricao do esquema para o prompt traz o dialeto SQLite e lista so as tabelas do escopo", () => {
    const description = query.describeSchema();

    for (const table of ["tasks", "task_subtasks", "task_artifacts", "task_tags", "recurrences", "artifacts", "artifact_tags"]) {
      expect(description).toContain(`${table}:`);
    }
    expect(description).toContain("SQLite");
    expect(description).toContain("datetime(started_at, '-3 hours')");
    expect(description).not.toMatch(/task_entries|jobs|user_id|task_task_relation|libpq|Postgres|timestamptz/);
  });
});
