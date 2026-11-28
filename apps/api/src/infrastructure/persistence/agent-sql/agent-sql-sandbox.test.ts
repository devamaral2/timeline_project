import { describe, expect, test } from "vitest";
import { type SandboxOutcome, type SandboxRequest, runInSandbox } from "./agent-sql-sandbox";
import { ALLOWED_FUNCTIONS, ALLOWED_TABLE_FUNCTIONS } from "./sql-policy";

function request(sql: string, overrides: Partial<SandboxRequest> = {}): SandboxRequest {
  return {
    tables: [
      {
        name: "tasks",
        createSql: "CREATE TABLE tasks (id TEXT, name TEXT, data TEXT, started_at TEXT, long_running INTEGER)",
        columns: ["id", "name", "data", "started_at", "long_running"],
        rows: [
          ["a", "Treino", '{"items":[{"n":"x"},{"n":"y"}],"code":"run"}', "2026-09-15T12:00:00.000Z", 0],
          ["b", "Mercado", "{}", "2026-09-16T01:30:00.000Z", 1],
        ],
      },
    ],
    sql,
    rowCap: 200,
    maxCellChars: 500,
    maxTotalChars: 20_000,
    allowedFunctions: [...ALLOWED_FUNCTIONS],
    allowedTableFunctions: [...ALLOWED_TABLE_FUNCTIONS],
    ...overrides,
  };
}

const run = (sql: string, overrides: Partial<SandboxRequest> = {}, timeoutMs = 5000): Promise<SandboxOutcome> =>
  runInSandbox(request(sql, overrides), timeoutMs);

async function rows(sql: string): Promise<unknown[][]> {
  const outcome = await run(sql);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.rows;
}

describe("runInSandbox: o que a consulta pode fazer", () => {
  test("le as linhas da copia, com colunas, agregacao e janela", async () => {
    expect(await run("SELECT id, name FROM tasks ORDER BY id")).toEqual({
      ok: true,
      columns: ["id", "name"],
      rows: [["a", "Treino"], ["b", "Mercado"]],
      truncated: false,
    });
    expect(await rows("SELECT count(*), sum(long_running), max(started_at) FROM tasks")).toEqual([[2, 1, "2026-09-16T01:30:00.000Z"]]);
    expect(await rows("SELECT name, row_number() OVER (ORDER BY started_at DESC) FROM tasks ORDER BY 2")).toEqual([
      ["Mercado", 1],
      ["Treino", 2],
    ]);
  });

  test("datas em texto ISO: hora e dia locais de Sao Paulo pelo modificador de horas", async () => {
    expect(await rows("SELECT date(started_at, '-3 hours'), strftime('%H:%M', started_at, '-3 hours') FROM tasks ORDER BY id")).toEqual([
      ["2026-09-15", "09:00"],
      ["2026-09-15", "22:30"],
    ]);
    expect(await rows("SELECT id FROM tasks WHERE started_at >= '2026-09-16' AND started_at < '2026-09-17'")).toEqual([["b"]]);
  });

  test("json: extract, operadores, json_each e CTE recursiva", async () => {
    expect(await rows("SELECT json_extract(data, '$.code'), data->>'code', data->'items'->0->>'n' FROM tasks WHERE id = 'a'")).toEqual([["run", "run", "x"]]);
    expect(await rows("SELECT j.value ->> 'n' FROM tasks t, json_each(t.data, '$.items') j ORDER BY 1")).toEqual([["x"], ["y"]]);
    expect(await rows("WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT sum(n) FROM r")).toEqual([[15]]);
  });

  test("CTE, subconsulta, join e UNION", async () => {
    expect(await rows("WITH x AS (SELECT id FROM tasks) SELECT id FROM x UNION SELECT id FROM x ORDER BY 1")).toEqual([["a"], ["b"]]);
    expect(await rows("SELECT t.name FROM tasks t JOIN tasks u ON u.id = t.id WHERE t.id IN (SELECT id FROM tasks WHERE long_running)")).toEqual([["Mercado"]]);
  });

  test("count(*) e SELECT 1 sobre tabela, CTE e subconsulta funcionam (so contam linhas)", async () => {
    expect(await rows("SELECT count(*) FROM tasks")).toEqual([[2]]);
    expect(await rows("WITH x AS (SELECT id FROM tasks) SELECT count(*) FROM x")).toEqual([[2]]);
    expect(await rows("SELECT count(*) FROM (SELECT id FROM tasks)")).toEqual([[2]]);
    expect(await rows("SELECT 1 FROM tasks")).toEqual([[1], [1]]);
  });

  test("tolera ponto e virgula e comentarios depois da instrucao", async () => {
    for (const sql of ["SELECT 1;", "SELECT 1;;  ", "SELECT 1; -- fim", "SELECT 1 /* c */ ;\n/* outro */", "-- antes\nSELECT 1"]) {
      expect(await rows(sql), sql).toEqual([[1]]);
    }
  });

  test("devolve todas as colunas, mesmo com nomes repetidos, e converte tipos para JSON", async () => {
    expect(await run("SELECT id, id, NULL, 1.5, CAST('x' AS BLOB) FROM tasks WHERE id = 'a'")).toEqual({
      ok: true,
      columns: ["id", "id", "NULL", "1.5", "CAST('x' AS BLOB)"],
      rows: [["a", "a", null, 1.5, "<blob 1 bytes>"]],
      truncated: false,
    });
  });
});

describe("runInSandbox: o que a consulta nao pode fazer", () => {
  const REFUSED: Array<[string, string]> = [
    ["delete", "DELETE FROM tasks"],
    ["update", "UPDATE tasks SET name = 'x'"],
    ["insert", "INSERT INTO tasks (id) VALUES ('x')"],
    ["replace", "REPLACE INTO tasks (id) VALUES ('x')"],
    ["delete via CTE", "WITH gone AS (SELECT id FROM tasks) DELETE FROM tasks WHERE id IN (SELECT id FROM gone)"],
    ["create table", "CREATE TABLE copia AS SELECT * FROM tasks"],
    ["create temp table", "CREATE TEMP TABLE copia (a)"],
    ["create view", "CREATE VIEW v AS SELECT * FROM tasks"],
    ["create trigger", "CREATE TRIGGER g AFTER INSERT ON tasks BEGIN SELECT 1; END"],
    ["alter", "ALTER TABLE tasks ADD COLUMN x"],
    ["drop", "DROP TABLE tasks"],
    ["attach", "ATTACH DATABASE ':memory:' AS outro"],
    ["attach arquivo", "ATTACH DATABASE '/etc/passwd' AS outro"],
    ["detach", "DETACH DATABASE main"],
    ["vacuum into", "VACUUM INTO '/tmp/agent-sql-copia.db'"],
    ["pragma", "PRAGMA query_only = OFF"],
    ["pragma de leitura", "PRAGMA table_info(tasks)"],
    ["pragma como tabela", "SELECT * FROM pragma_table_info('tasks')"],
    ["pragma database_list", "SELECT file FROM pragma_database_list"],
    ["pragma function_list", "SELECT * FROM pragma_function_list"],
    ["begin", "BEGIN"],
    ["savepoint", "SAVEPOINT a"],
    ["analyze", "ANALYZE"],
    ["reindex", "REINDEX"],
    ["load_extension", "SELECT load_extension('/tmp/x.so')"],
    ["sqlite_version", "SELECT sqlite_version()"],
    ["compileoption", "SELECT sqlite_compileoption_get(0)"],
    ["zeroblob", "SELECT zeroblob(1000000000)"],
    ["randomblob", "SELECT randomblob(10)"],
    ["random", "SELECT random()"],
    ["readfile", "SELECT readfile('/etc/passwd')"],
    ["writefile", "SELECT writefile('/tmp/x', 'y')"],
    ["fts/vtab", "SELECT * FROM generate_series(1, 10)"],
    ["create virtual table", "CREATE VIRTUAL TABLE v USING fts5(a)"],
    ["sqlite_master", "SELECT * FROM sqlite_master"],
    ["sqlite_schema", "SELECT sql FROM sqlite_schema"],
    ["sqlite_temp_master", "SELECT * FROM temp.sqlite_temp_master"],
    ["main.sqlite_master", "SELECT * FROM main.sqlite_master"],
    ["contar o catalogo", "SELECT count(*) FROM sqlite_master"],
    ["contar uma pragma", "SELECT 1 FROM pragma_database_list"],
    ["catalogo ligado a uma tabela", "SELECT t.id FROM tasks t, sqlite_master x"],
    ["schema inexistente", "SELECT * FROM outro.tasks"],
    ["tabela do banco da API", "SELECT * FROM users"],
    ["tabela fora do esquema logico", "SELECT * FROM task_entries"],
    ["tabela nao copiada", "SELECT * FROM jobs"],
    ["explain", "EXPLAIN DELETE FROM tasks"],
    ["duas instrucoes", "SELECT 1; SELECT 2"],
    ["instrucao de escrita depois do select", "SELECT name FROM tasks; DELETE FROM tasks"],
    ["escrita depois de comentario", "SELECT 1; -- ok\nDROP TABLE tasks"],
    ["so ponto e virgula", ";"],
    ["vazio", "   "],
    ["so comentario", "-- nada"],
    ["erro de sintaxe", "SELEC 1"],
  ];

  test.each(REFUSED)("recusa %s", async (_label, sql) => {
    const outcome = await run(sql);
    expect(outcome.ok).toBe(false);
  });

  test("diz o que foi recusado", async () => {
    expect(await run("SELECT load_extension('x')")).toEqual({ ok: false, error: "Função não permitida: load_extension." });
    expect(await run("SELECT * FROM sqlite_master")).toEqual({ ok: false, error: "Tabela desconhecida: sqlite_master." });
    expect(await run("SELECT * FROM jobs")).toMatchObject({ ok: false, error: expect.stringMatching(/no such table: jobs/) });
    expect(await run("DELETE FROM tasks")).toEqual({ ok: false, error: "Só consultas SELECT são permitidas." });
    expect(await run("SELECT 1; SELECT 2")).toEqual({ ok: false, error: "Envie exatamente uma instrução SELECT." });
  });

  test("a copia continua intacta depois de uma tentativa de escrita (cada consulta ve a copia nova)", async () => {
    expect((await run("DELETE FROM tasks")).ok).toBe(false);
    expect(await rows("SELECT count(*) FROM tasks")).toEqual([[2]]);
  });

  test("as funcoes saem so da lista passada na requisicao", async () => {
    expect(await run("SELECT upper(name) FROM tasks", { allowedFunctions: ["lower"] })).toEqual({
      ok: false,
      error: "Função não permitida: upper.",
    });
    expect(await run("SELECT json_each.value FROM json_each('[1]')", { allowedTableFunctions: [] })).toMatchObject({ ok: false });
  });

  test("o processo do sandbox nao ve o ambiente da API nem o disco", async () => {
    // Sem fs nem env na query; o que da para checar daqui e que o ambiente do pai nao vaza para o SQL.
    process.env.AGENT_SQL_TEST_SECRET = "segredo";
    try {
      expect((await run("SELECT getenv('AGENT_SQL_TEST_SECRET')")).ok).toBe(false);
    } finally {
      delete process.env.AGENT_SQL_TEST_SECRET;
    }
  });
});

describe("runInSandbox: limites", () => {
  test("corta nas linhas e avisa", async () => {
    expect(await run("SELECT id FROM tasks ORDER BY id", { rowCap: 1 })).toEqual({
      ok: true,
      columns: ["id"],
      rows: [["a"]],
      truncated: true,
    });
    expect(await run("SELECT id FROM tasks WHERE id = 'a'", { rowCap: 1 })).toMatchObject({ truncated: false });
  });

  test("corta o tamanho da celula e o total de caracteres", async () => {
    expect(await run("SELECT name FROM tasks WHERE id = 'a'", { maxCellChars: 5 })).toMatchObject({ rows: [["Trein…"]] });
    expect(await run("SELECT name FROM tasks ORDER BY id", { maxTotalChars: 20 })).toEqual({
      ok: true,
      columns: ["name"],
      rows: [["Treino"]],
      truncated: true,
    });
  });

  test("a CTE recursiva sem fim e interrompida pelo corte de linhas, sem esperar o prazo", async () => {
    const started = Date.now();
    const outcome = await run("WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT n FROM r", { rowCap: 3 });
    expect(outcome).toEqual({ ok: true, columns: ["n"], rows: [[1], [2], [3]], truncated: true });
    expect(Date.now() - started).toBeLessThan(4000);
  });

  test("estoura o tempo numa chamada nativa que o JS nao consegue parar, e o processo morre", async () => {
    const started = Date.now();
    // Uma unica chamada nativa: sem progress handler no node:sqlite, so matar o processo corta.
    const outcome = await run(
      "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r",
      {},
      300,
    );
    expect(outcome).toEqual({ ok: false, error: "A consulta passou de 300 ms e foi cancelada." });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("o produto cartesiano grande tambem estoura o tempo", async () => {
    const big = Array.from({ length: 3000 }, (_, n) => [`id${n}`, "massa", "{}", "2026-09-15T12:00:00.000Z", 0]);
    const tables = request("").tables;
    tables[0].rows = big;
    const outcome = await run("SELECT count(*) FROM tasks a, tasks b, tasks c, tasks d", { tables }, 400);
    expect(outcome).toEqual({ ok: false, error: "A consulta passou de 400 ms e foi cancelada." });
  });

  test("a consulta que aloca sem fim falha sem derrubar quem chamou", async () => {
    const outcome = await run(
      "WITH RECURSIVE r(n, s) AS (SELECT 1, 'x' UNION ALL SELECT n + 1, s || s FROM r WHERE n < 40) SELECT max(length(s)) FROM r",
      {},
      4000,
    );
    expect(outcome.ok).toBe(false);
  });

  test("o ordenador que cresce sem fim bate no teto de memoria ou no prazo", async () => {
    const outcome = await run(
      "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 100000000) SELECT n FROM r ORDER BY n DESC",
      {},
      1500,
    );
    expect(outcome.ok).toBe(false);
  });

  test("um texto maior que o teto de celula nao existe: erro de tamanho", async () => {
    expect(await run("SELECT length(printf('%2000000c', 'x'))")).toMatchObject({ ok: false });
  });

  test("uma consulta que usa muitos argumentos ou expressoes fundas e recusada", async () => {
    const deep = `SELECT ${"abs(".repeat(200)}1${")".repeat(200)}`;
    expect((await run(deep)).ok).toBe(false);
  });
});
