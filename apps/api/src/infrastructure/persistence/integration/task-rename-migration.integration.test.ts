import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { inject } from "vitest";

declare module "vitest" {
  interface ProvidedContext { apiPostgresUrl: string }
}

const DRIZZLE_DIR = resolve(__dirname, "../../../../drizzle");
const MIGRATION = "0005_tarefa_no_lugar_de_evento";

async function applyMigration(pool: Pool, tag: string): Promise<void> {
  await pool.query(readFileSync(resolve(DRIZZLE_DIR, `${tag}.sql`), "utf8"));
}

async function applyAllBefore(pool: Pool, last: string): Promise<void> {
  const journal = JSON.parse(readFileSync(resolve(DRIZZLE_DIR, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    if (tag === last) return;
    await applyMigration(pool, tag);
  }
  throw new Error(`Migration ${last} fora do diario`);
}

describe("migration que troca os nomes de evento por tarefa, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  const ids = { first: ulid(), second: ulid(), request: ulid(), step: ulid(), tag: ulid(), artifact: ulid(), series: ulid(), job: ulid() };

  async function rows<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
    return (await pool.query(text, values)).rows as T[];
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await admin.end();
    }
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });

    await applyAllBefore(pool, MIGRATION);

    // Dados gravados com os nomes antigos.
    await pool.query(
      `INSERT INTO events (id, user_id, actor, kind, status, name) VALUES
         ($1, 'user-1', 'human', 'common', NULL, 'Primeira'),
         ($2, 'user-1', 'human', 'common', NULL, 'Segunda'),
         ($3, 'user-1', 'agent', 'request', 'queued', 'Pedido')`,
      [ids.first, ids.second, ids.request],
    );
    await pool.query(
      `INSERT INTO events (id, user_id, actor, kind, status, name, data)
       VALUES ($1, 'user-1', 'agent', 'step', 'queued', 'Passo', $2::jsonb)`,
      [ids.step, JSON.stringify({ agent: "recurring-event-create", expected: "one" })],
    );
    await pool.query(
      `INSERT INTO event_entries (id, event_id, user_id, kind, role, content) VALUES ($1, $2, 'user-1', 'message', 'user', 'oi')`,
      [ulid(), ids.request],
    );
    await pool.query(`INSERT INTO tags (id, user_id, name) VALUES ($1, 'user-1', 'saude')`, [ids.tag]);
    await pool.query(`INSERT INTO event_tags (event_id, tag_id) VALUES ($1, $2)`, [ids.first, ids.tag]);
    await pool.query(`INSERT INTO event_event_relation (from_event_id, to_event_id, relation) VALUES ($1, $2, 'precedes')`, [ids.first, ids.second]);
    await pool.query(`INSERT INTO artifacts (id, user_id, type, name) VALUES ($1, 'user-1', 'text', 'Nota')`, [ids.artifact]);
    await pool.query(
      `INSERT INTO event_artifact_relation (event_id, artifact_id, relation, position) VALUES ($1, $2, 'uses', 0)`,
      [ids.first, ids.artifact],
    );
    await pool.query(
      `INSERT INTO recurrences (id, user_id, freq, time_of_day, starts_on, template) VALUES ($1, 'user-1', 'daily', '18:00', '2026-11-01', $2::jsonb)`,
      [ids.series, JSON.stringify({ kind: "common", name: "Serie", tags: [], previousEventIds: [ids.first], artifactIds: [] })],
    );
    await pool.query(
      `INSERT INTO jobs (id, kind, user_id, actor_id, event_id, payload) VALUES ($1, 'voice-event', 'user-1', 'user-1', $2, $3::jsonb)`,
      [ids.job, ids.request, JSON.stringify({ stepId: ids.step, agent: "event-edit", origin: "voice-event" })],
    );
    await pool.query(
      `INSERT INTO jobs (id, kind, user_id, actor_id, payload) VALUES ($1, 'request-step', 'user-1', 'user-1', $2::jsonb)`,
      [ulid(), JSON.stringify({ agent: "artifact-edit" })],
    );
    await pool.query(
      `INSERT INTO idempotency_keys (user_id, scope, key, request_hash, response) VALUES
         ('user-1', '/api/events', 'k1', $1, '{"id":"x"}'::jsonb),
         ('user-1', '/api/artifacts', 'k2', $1, '{"id":"y"}'::jsonb)`,
      ["a".repeat(64)],
    );

    await applyMigration(pool, MIGRATION);
  }, 60000);

  afterAll(async () => {
    await pool?.end();
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  test("renomeia no lugar as tabelas, sem perder linha", async () => {
    const tables = (await rows<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    )).map((row) => row.table_name);
    for (const name of ["tasks", "task_entries", "task_tags", "task_task_relation", "task_artifact_relation"]) expect(tables).toContain(name);
    for (const name of ["events", "event_entries", "event_tags", "event_event_relation", "event_artifact_relation"]) expect(tables).not.toContain(name);

    expect((await rows<{ id: string }>("SELECT id FROM tasks WHERE actor = 'human' ORDER BY name")).map((row) => row.id)).toEqual([ids.first, ids.second]);
    expect(await rows("SELECT task_id, kind FROM task_entries")).toEqual([{ task_id: ids.request, kind: "message" }]);
    expect(await rows("SELECT task_id, tag_id FROM task_tags")).toEqual([{ task_id: ids.first, tag_id: ids.tag }]);
    expect(await rows("SELECT from_task_id, to_task_id, relation FROM task_task_relation")).toEqual([
      { from_task_id: ids.first, to_task_id: ids.second, relation: "precedes" },
    ]);
    expect(await rows("SELECT task_id, artifact_id, relation, position FROM task_artifact_relation")).toEqual([
      { task_id: ids.first, artifact_id: ids.artifact, relation: "uses", position: 0 },
    ]);
  });

  test("nenhuma coluna, indice, chave ou check guarda o trecho antigo", async () => {
    expect(await rows("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name ILIKE '%event%'")).toEqual([]);
    expect(await rows("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND (indexname ILIKE '%event%' OR tablename ILIKE '%event%')")).toEqual([]);
    expect(await rows(
      "SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND (conname ILIKE '%event%' OR conrelid::regclass::text ILIKE '%event%')",
    )).toEqual([]);
    expect(await rows("SELECT jobs.task_id FROM jobs WHERE id = $1", [ids.job])).toEqual([{ task_id: ids.request }]);
  });

  test("as restricoes continuam valendo com os nomes novos", async () => {
    await expect(pool.query(`INSERT INTO tasks (id, user_id, actor, kind, name) VALUES ($1, 'user-1', 'human', 'request', 'x')`, [ulid()])).rejects.toThrow(/tasks_kind_matches_actor/);
    await expect(pool.query(`INSERT INTO task_task_relation (from_task_id, to_task_id, relation) VALUES ($1, $1, 'precedes')`, [ids.first])).rejects.toThrow(/task_task_not_self/);
    await expect(pool.query(`INSERT INTO task_task_relation (from_task_id, to_task_id, relation) VALUES ($1, $2, 'follow_up'), ($3, $2, 'follow_up')`, [ids.first, ids.second, ids.request])).rejects.toThrow(/task_task_follow_up_unique/);
  });

  test("reescreve as chaves do template da serie", async () => {
    const [series] = await rows<{ template: Record<string, unknown> }>("SELECT template FROM recurrences WHERE id = $1", [ids.series]);
    expect(series.template).toEqual({ kind: "common", name: "Serie", tags: [], previousTaskIds: [ids.first], artifactIds: [] });
  });

  test("reescreve o agente interno do passo e o tipo e o conteudo dos jobs", async () => {
    const [step] = await rows<{ data: Record<string, unknown> }>("SELECT data FROM tasks WHERE id = $1", [ids.step]);
    expect(step.data).toEqual({ agent: "recurring-task-create", expected: "one" });

    const [job] = await rows<{ kind: string; payload: Record<string, unknown> }>("SELECT kind, payload FROM jobs WHERE id = $1", [ids.job]);
    expect(job.kind).toBe("voice-task");
    expect(job.payload).toEqual({ stepId: ids.step, agent: "task-edit", origin: "voice-task" });

    expect((await rows<{ payload: unknown }>("SELECT payload FROM jobs WHERE kind = 'request-step'"))[0]?.payload).toEqual({ agent: "artifact-edit" });
  });

  test("descarta as chaves de idempotencia guardadas para as rotas", async () => {
    expect(await rows("SELECT key FROM idempotency_keys")).toEqual([]);
  });
});
