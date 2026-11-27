import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { PostgresScopedSqlQuery } from "../agent-sql/postgres-scoped-sql.query";
import { GLOBAL_WORKOUT_ID } from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

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

describe("PostgresScopedSqlQuery", () => {
  let ctx: PostgresTestContext;
  let query: PostgresScopedSqlQuery;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    query = new PostgresScopedSqlQuery(ctx.pool);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
    await seed(ctx.pool);
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  // SQL cru de proposito: o cenario tem relacoes cruzando usuarios, que os repositorios recusam.
  // As linhas de B entram primeiro, para que uma varredura que ignorasse o escopo as encontrasse antes das de A.
  async function seed(pool: Pool): Promise<void> {
    await pool.query(`
      INSERT INTO projects (id, user_id, name, personal) VALUES
        ('${id("PB", 1)}', 'user-b', 'personal', true),
        ('${id("PA", 1)}', 'user-a', 'personal', true);
      INSERT INTO tasks (id, project_id, user_id, actor, kind, status, name, started_at) VALUES
        ('${B_TASK}', '${id("PB", 1)}', 'user-b', 'human', 'common', NULL, 'Segredo do B', '2026-09-15T12:00:00Z'),
        ('${B_TRACKED}', '${id("PB", 1)}', 'user-b', 'human', 'common', 'todo', 'Tarefa do B', NULL),
        ('${A_TRAINING}', '${id("PA", 1)}', 'user-a', 'human', 'training', NULL, 'Treino', '2026-09-15T12:00:00Z'),
        ('${A_DELETED}', '${id("PA", 1)}', 'user-a', 'human', 'common', NULL, 'Apagado', '2026-09-15T13:00:00Z'),
        ('${A_TRACKED}', '${id("PA", 1)}', 'user-a', 'human', 'common', 'todo', 'Tarefa do A', NULL),
        ('${A_REQUEST}', '${id("PA", 1)}', 'user-a', 'agent', 'request', 'completed', 'Pedido do A', '2026-09-15T14:00:00Z'),
        ('${A_STEP}', '${id("PA", 1)}', 'user-a', 'agent', 'step', 'completed', 'Passo do A', '2026-09-15T14:00:01Z');
      UPDATE tasks SET deleted_at = now() WHERE id = '${A_DELETED}';

      INSERT INTO task_entries (id, task_id, user_id, kind, role, content) VALUES
        ('${id("EN", 1)}', '${A_REQUEST}', 'user-a', 'message', 'user', 'corro 10 km por semana');

      INSERT INTO artifacts (id, user_id, name, type, data) VALUES
        ('${B_SLEEP}', 'user-b', 'Sono do B', 'sleep', '{"trackedSleepTime": 999, "score": 1}'),
        ('${B_TEXT}', 'user-b', 'nota do B', 'text', '{"body": "nota do B"}'),
        ('${A_SLEEP}', 'user-a', 'Sono', 'sleep', '{"trackedSleepTime": 420, "score": 80}'),
        ('${A_SLEEP_DELETED}', 'user-a', 'Sono apagado', 'sleep', '{"trackedSleepTime": 60, "score": 10}'),
        ('${A_TEXT}', 'user-a', 'nota do A', 'text', '{"body": "nota do A"}'),
        ('${A_SKILL}', 'user-a', 'Skill do A', 'skill', '{"path": "hermes/skills/x/SKILL.md", "missing": false}');
      UPDATE artifacts SET deleted_at = now() WHERE id = '${A_SLEEP_DELETED}';

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

  async function rows(sql: string, userId = "user-a") {
    const outcome = await query.run({ userId, sql });
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.rows;
  }

  test("tasks mostra so as tarefas vivas de pessoa do proprio usuario", async () => {
    expect(await rows("SELECT name, kind, status FROM tasks ORDER BY name")).toEqual([
      ["Tarefa do A", "common", "todo"],
      ["Treino", "training", null],
    ]);
    expect(await rows("SELECT name FROM tasks ORDER BY name", "user-b")).toEqual([["Segredo do B"], ["Tarefa do B"]]);
    expect(await rows("SELECT name FROM tasks ORDER BY name", "user-sem-dados")).toEqual([]);
    // Os pedidos e os passos do agente nao sao tarefas para a consulta, nem os do proprio usuario.
    expect(await rows("SELECT count(*)::int FROM tasks WHERE kind IN ('request', 'step') OR status = 'done'")).toEqual([[0]]);
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
    expect(await rows("SELECT count(*)::int, min(type) FROM artifacts WHERE global")).toEqual([[5, "workout"]]);
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
    await ctx.pool.query(`
      INSERT INTO recurrences (id, project_id, user_id, freq, interval_count, byweekday, time_of_day, duration_minutes, starts_on, template) VALUES
        ('${id("RB", 1)}', '${id("PB", 1)}', 'user-b', 'daily', 1, NULL, '06:00', NULL, '2026-09-01', '{"name": "Segredo do B", "kind": "common"}'),
        ('${id("RA", 1)}', '${id("PA", 1)}', 'user-a', 'weekly', 1, 10, '07:00', 60, '2026-09-01',
          '{"name": "Corrida", "kind": "training", "status": "todo", "artifactIds": ["so o servidor ve"]}');
      UPDATE tasks SET recurrence_id = '${id("RA", 1)}', occurrence_on = '2026-09-15' WHERE id = '${A_TRAINING}';
    `);

    expect(
      await rows("SELECT name, kind, status, freq, byweekday, time_of_day, duration_minutes, starts_on, ends_on FROM recurrences"),
    ).toEqual([["Corrida", "training", "todo", "weekly", 10, "07:00", 60, "2026-09-01", null]]);
    expect(await rows("SELECT name FROM recurrences", "user-b")).toEqual([["Segredo do B"]]);
    expect(
      await rows("SELECT r.name, e.occurrence_on FROM tasks e JOIN recurrences r ON r.id = e.recurrence_id"),
    ).toEqual([["Corrida", "2026-09-15"]]);
    // O jsonb do template nao e uma coluna: so o que o esquema logico escolheu expor.
    expect((await query.run({ userId: "user-a", sql: "SELECT template FROM recurrences" })).ok).toBe(false);
  });

  test("as tabelas do agente e o grafo de relacoes nao existem para a consulta", async () => {
    for (const table of [
      "task_entries",
      "jobs",
      "task_task_relation",
      "task_artifact_relation",
      "artifact_artifact_relation",
      "tags",
      "recurrence_exceptions",
      "idempotency_keys",
    ]) {
      // Recusado na validacao, antes de tocar o banco.
      expect(await query.run({ userId: "user-a", sql: `SELECT * FROM ${table}` })).toEqual({
        ok: false,
        error: `Tabela desconhecida: ${table}.`,
      });
    }
    // As colunas de escopo tambem nao: nao ha como pedir as linhas de outro usuario ou as apagadas.
    for (const column of ["user_id", "actor", "deleted_at", "data"]) {
      expect((await query.run({ userId: "user-a", sql: `SELECT ${column} FROM tasks` })).ok, column).toBe(false);
    }
  });

  test("um CTE da consulta com nome de tabela ainda le a tabela do escopo", async () => {
    expect(await rows("WITH tasks AS (SELECT * FROM tasks) SELECT count(*)::int FROM tasks")).toEqual([[2]]);
  });

  test("agregacoes, joins e funcoes de data rodam em America/Sao_Paulo", async () => {
    const outcome = await query.run({
      userId: "user-a",
      sql: `
        SELECT e.started_on, e.started_at, sum((a.data->>'trackedSleepTime')::int) AS minutes,
               EXTRACT(hour FROM e.started_at) AS local_hour
        FROM tasks e JOIN task_artifacts ea ON ea.task_id = e.id JOIN artifacts a ON a.id = ea.artifact_id
        WHERE a.type = 'sleep' AND e.started_at > timestamptz '2026-09-01' - interval '1 day'
        GROUP BY e.started_on, e.started_at
      `,
    });

    expect(outcome).toEqual({
      ok: true,
      columns: ["started_on", "started_at", "minutes", "local_hour"],
      rows: [["2026-09-15", "2026-09-15 09:00:00-03", "420", "9"]],
      truncated: false,
    });
  });

  test("um cast que falha so chega a ver valores do proprio usuario", async () => {
    const outcome = await query.run({ userId: "user-a", sql: "SELECT id FROM tasks WHERE name::int = 1" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/Treino|Tarefa do A/);
    expect(outcome.error).not.toMatch(/Segredo|do B|Pedido|Passo|Apagado/);
  });

  test("recusa tentativas de sair do escopo ou de escrever, e o banco fica como estava", async () => {
    const attempts = [
      "SELECT name FROM public.tasks",
      "SELECT (WITH tags AS (SELECT 1) SELECT 1), (SELECT count(*) FROM tags)",
      "SELECT name FROM tasks WHERE user_id = 'user-b' OR true",
      "SELECT set_config('x', 'y', true)",
      "SELECT name FROM tasks; DELETE FROM tasks",
      "DELETE FROM tasks",
      "UPDATE tasks SET name = 'x'",
      "INSERT INTO artifacts (id) VALUES ('x')",
      "WITH gone AS (DELETE FROM tasks RETURNING id) SELECT * FROM gone",
      "SELECT * FROM tasks FOR UPDATE",
      "SELECT * INTO copia FROM tasks",
    ];
    for (const sql of attempts) {
      const outcome = await query.run({ userId: "user-a", sql });
      expect(outcome.ok, sql).toBe(false);
    }

    const { rows: counts } = await ctx.pool.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE name = 'x')::int AS renamed FROM tasks");
    expect(counts[0]).toEqual({ n: 7, renamed: 0 });
  });

  test("limita as linhas e o tamanho da celula, e avisa que cortou", async () => {
    const small = new PostgresScopedSqlQuery(ctx.pool, {
      rowCap: 1,
      timeoutMs: 3000,
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
    const tight = new PostgresScopedSqlQuery(ctx.pool, {
      rowCap: 200,
      timeoutMs: 3000,
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

  test("estoura o tempo e devolve a conexao limpa, fora da transacao so de leitura", async () => {
    const pool = new Pool({ connectionString: ctx.connectionString, max: 1 });
    try {
      await pool.query(`
        INSERT INTO tasks (id, project_id, user_id, actor, kind, name, started_at)
        SELECT lpad(n::text, 26, 'Z'), '${id("PA", 1)}', 'user-a', 'human', 'common', 'massa', now() FROM generate_series(1, 3000) AS n
      `);
      const slow = new PostgresScopedSqlQuery(pool, {
        rowCap: 10,
        timeoutMs: 200,
        maxCellChars: 500,
        maxTotalChars: 20_000,
        maxErrorChars: 300,
      });

      const outcome = await slow.run({ userId: "user-a", sql: "SELECT count(*) FROM tasks a, tasks b, tasks c" });

      expect(outcome).toEqual({ ok: false, error: "canceling statement due to statement timeout" });
      const { rows: settings } = await pool.query("SHOW statement_timeout");
      expect(settings[0].statement_timeout).toBe("0");
      const { rows: readOnly } = await pool.query("SHOW transaction_read_only");
      expect(readOnly[0].transaction_read_only).toBe("off");
      // A mesma conexao volta a servir consultas.
      expect(await slow.run({ userId: "user-b", sql: "SELECT count(*)::int FROM tasks" })).toMatchObject({ ok: true, rows: [[2]] });
    } finally {
      await pool.end();
    }
  });

  test("a descricao do esquema para o prompt lista so as tabelas do escopo", () => {
    const description = query.describeSchema();

    for (const table of ["tasks", "task_subtasks", "task_artifacts", "task_tags", "recurrences", "artifacts", "artifact_tags"]) {
      expect(description).toContain(`${table}:`);
    }
    expect(description).not.toMatch(/task_entries|jobs|user_id|task_task_relation/);
  });
});
