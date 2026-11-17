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
const MIGRATION = "0007_subtarefa_no_lugar_de_sequencia";

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

describe("migration que troca a sequencia entre tarefas por subtarefas, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  // project -> paint; older e newer -> shared (fica a mais antiga); request -> person.
  const ids = {
    project: ulid(), paint: ulid(), older: ulid(), newer: ulid(), shared: ulid(),
    request: ulid(), person: ulid(), step: ulid(),
    series: ulid(), emptySeries: ulid(), plainSeries: ulid(),
  };

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

    const human = [ids.project, ids.paint, ids.older, ids.newer, ids.shared, ids.person];
    for (const id of human) {
      await pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, 'user-1', 'human', 'common', 'todo', $2)`, [id, `Tarefa ${id}`]);
    }
    await pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, 'user-1', 'agent', 'request', 'queued', 'Pedido')`, [ids.request]);
    await pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, 'user-1', 'agent', 'step', 'queued', 'Passo')`, [ids.step]);
    const relate = (from: string, to: string, relation: string, createdAt: string) =>
      pool.query(
        `INSERT INTO task_task_relation (from_task_id, to_task_id, relation, created_at) VALUES ($1, $2, $3, $4)`,
        [from, to, relation, createdAt],
      );
    await relate(ids.project, ids.paint, "precedes", "2026-11-01T10:00:00Z");
    await relate(ids.newer, ids.shared, "precedes", "2026-11-03T10:00:00Z");
    await relate(ids.older, ids.shared, "precedes", "2026-11-02T10:00:00Z");
    await relate(ids.request, ids.person, "precedes", "2026-11-01T10:00:00Z");
    await relate(ids.request, ids.step, "step", "2026-11-01T10:00:00Z");

    const series = (id: string, template: Record<string, unknown>) =>
      pool.query(
        `INSERT INTO recurrences (id, user_id, freq, time_of_day, starts_on, template) VALUES ($1, 'user-1', 'daily', '18:00', '2026-11-01', $2::jsonb)`,
        [id, JSON.stringify(template)],
      );
    await series(ids.series, { kind: "common", name: "Sessão", tags: [], artifactIds: [], previousTaskIds: [ids.project, ids.older] });
    await series(ids.emptySeries, { kind: "common", name: "Solta", tags: [], artifactIds: [], previousTaskIds: [] });
    await series(ids.plainSeries, { kind: "common", name: "Sem lista", tags: [], artifactIds: [] });

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

  test("o antecessor vira a principal, e de varios antecessores fica o mais antigo", async () => {
    const edges = await rows<{ from_task_id: string; to_task_id: string }>(
      "SELECT from_task_id, to_task_id FROM task_task_relation WHERE relation = 'subtask'",
    );
    expect(edges.map((edge) => `${edge.from_task_id}>${edge.to_task_id}`).sort()).toEqual(
      [`${ids.project}>${ids.paint}`, `${ids.older}>${ids.shared}`, `${ids.request}>${ids.person}`].sort(),
    );
    expect(await rows("SELECT count(*)::int AS n FROM task_task_relation WHERE relation = 'precedes'")).toEqual([{ n: 0 }]);
  });

  test("as outras relacoes entre tarefas ficam como estavam", async () => {
    expect(await rows("SELECT from_task_id, to_task_id FROM task_task_relation WHERE relation = 'step'")).toEqual([
      { from_task_id: ids.request, to_task_id: ids.step },
    ]);
  });

  test("o template da serie troca a lista de antecessores pela principal", async () => {
    const templates = new Map(
      (await rows<{ id: string; template: Record<string, unknown> }>("SELECT id, template FROM recurrences")).map((row) => [row.id, row.template]),
    );

    expect(templates.get(ids.series)).toEqual({ kind: "common", name: "Sessão", tags: [], artifactIds: [], parentTaskId: ids.project });
    expect(templates.get(ids.emptySeries)).toEqual({ kind: "common", name: "Solta", tags: [], artifactIds: [] });
    expect(templates.get(ids.plainSeries)).toEqual({ kind: "common", name: "Sem lista", tags: [], artifactIds: [] });
  });

  test("depois dela o banco recusa precedes e uma segunda principal", async () => {
    await expect(
      pool.query(`INSERT INTO task_task_relation (from_task_id, to_task_id, relation) VALUES ($1, $2, 'precedes')`, [ids.paint, ids.person]),
    ).rejects.toThrow(/task_task_relation_valid/);
    await expect(
      pool.query(`INSERT INTO task_task_relation (from_task_id, to_task_id, relation) VALUES ($1, $2, 'subtask')`, [ids.newer, ids.shared]),
    ).rejects.toThrow(/task_task_subtask_unique/);
  });
});
