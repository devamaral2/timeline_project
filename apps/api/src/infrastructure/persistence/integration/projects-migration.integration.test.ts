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
const MIGRATION = "0010_projeto_em_toda_tarefa";

interface JournalEntry { tag: string; when: number }

function journal(): JournalEntry[] {
  return (JSON.parse(readFileSync(resolve(DRIZZLE_DIR, "meta/_journal.json"), "utf8")) as { entries: JournalEntry[] }).entries;
}

async function applyMigration(pool: Pool, tag: string): Promise<void> {
  await pool.query(readFileSync(resolve(DRIZZLE_DIR, `${tag}.sql`), "utf8"));
}

async function applyAllBefore(pool: Pool, last: string): Promise<void> {
  for (const { tag } of journal()) {
    if (tag === last) return;
    await applyMigration(pool, tag);
  }
  throw new Error(`Migration ${last} fora do diario`);
}

test("a migration dos projetos esta no diario", () => {
  expect(journal().map((entry) => entry.tag)).toContain(MIGRATION);
});

describe("migration que da um projeto a toda tarefa e serie, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  const ids = {
    humanA: ulid(), requestA: ulid(), stepA: ulid(), humanB: ulid(), savedA: ulid(), seriesB: ulid(), onlySeries: ulid(), occurrenceB: ulid(),
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

    const task = (id: string, userId: string, actor: string, kind: string, status: string) =>
      pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, $2, $3, $4, $5, 'Tarefa')`, [id, userId, actor, kind, status]);
    await task(ids.humanA, "user-a", "human", "common", "todo");
    await task(ids.requestA, "user-a", "agent", "request", "done");
    await task(ids.stepA, "user-a", "agent", "step", "done");
    await task(ids.humanB, "user-b", "human", "common", "doing");
    // O conteudo guardado (migration 0009) tambem e tarefa de agente e ganha o personal do dono.
    await task(ids.savedA, "user-a", "agent", "save_content_with_transcription", "awaiting_transcription");

    const series = (id: string, userId: string) =>
      pool.query(
        `INSERT INTO recurrences (id, user_id, freq, time_of_day, starts_on, template) VALUES ($1, $2, 'daily', '18:00', '2026-11-01', '{"name": "Serie"}'::jsonb)`,
        [id, userId],
      );
    await series(ids.seriesB, "user-b");
    // Quem so tem serie, sem nenhuma tarefa, tambem ganha o personal.
    await series(ids.onlySeries, "user-c");
    await pool.query(
      `INSERT INTO tasks (id, user_id, actor, kind, status, name, recurrence_id, occurrence_on) VALUES ($1, 'user-b', 'human', 'common', 'todo', 'Ocorrencia', $2, '2026-11-01')`,
      [ids.occurrenceB, ids.seriesB],
    );
    // Quem nao tem nada (user-d) nao entra: o personal dele nasce na primeira necessidade.

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

  test("cada usuario com tarefa ou serie ganha um personal, e so ele", async () => {
    const projects = await rows<{ user_id: string; name: string; personal: boolean }>(
      "SELECT user_id, name, personal FROM projects ORDER BY user_id",
    );

    expect(projects).toEqual([
      { user_id: "user-a", name: "personal", personal: true },
      { user_id: "user-b", name: "personal", personal: true },
      { user_id: "user-c", name: "personal", personal: true },
    ]);
  });

  test("toda tarefa, de pessoa ou de agente, e toda serie ficam no personal do dono", async () => {
    const taskProjects = await rows<{ id: string; owner: string; project_owner: string; personal: boolean }>(
      `SELECT t.id, t.user_id AS owner, p.user_id AS project_owner, p.personal
       FROM tasks t JOIN projects p ON p.id = t.project_id`,
    );
    expect(taskProjects).toHaveLength(6);
    for (const row of taskProjects) {
      expect(row.project_owner, row.id).toBe(row.owner);
      expect(row.personal, row.id).toBe(true);
    }

    const seriesProjects = await rows<{ id: string; owner: string; project_owner: string }>(
      "SELECT r.id, r.user_id AS owner, p.user_id AS project_owner FROM recurrences r JOIN projects p ON p.id = r.project_id",
    );
    expect(seriesProjects).toHaveLength(2);
    for (const row of seriesProjects) expect(row.project_owner, row.id).toBe(row.owner);
  });

  test("as ocorrencias e a serie dividem o projeto do usuario", async () => {
    const [occurrence] = await rows<{ project_id: string }>("SELECT project_id FROM tasks WHERE id = $1", [ids.occurrenceB]);
    const [series] = await rows<{ project_id: string }>("SELECT project_id FROM recurrences WHERE id = $1", [ids.seriesB]);

    expect(occurrence?.project_id).toBe(series?.project_id);
  });

  test("as colunas ficam obrigatorias e o id do projeto cabe no formato dos outros", async () => {
    const columns = await rows<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE column_name = 'project_id' AND table_name IN ('tasks', 'recurrences') ORDER BY table_name`,
    );
    expect(columns).toEqual([
      { table_name: "recurrences", is_nullable: "NO" },
      { table_name: "tasks", is_nullable: "NO" },
    ]);
    for (const { id } of await rows<{ id: string }>("SELECT id FROM projects")) expect(id).toMatch(/^[0-9A-F]{26}$/);
  });
});
