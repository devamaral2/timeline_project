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
const MIGRATION = "0008_local_opcional";

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

// O migrador do drizzle so aplica a migration cujo `when` passa o da ultima aplicada: fora de ordem, ela e pulada.
test("o diario de migrations anda sempre para frente", () => {
  const entries = journal();
  for (const [index, entry] of entries.entries()) {
    if (index > 0) expect(entry.when, entry.tag).toBeGreaterThan((entries[index - 1] as JournalEntry).when);
  }
});

describe("migration que torna o local da tarefa opcional, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  const ids = { located: ulid(), empty: ulid(), blank: ulid(), agent: ulid(), placed: ulid(), unplaced: ulid(), blankSeries: ulid() };

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

    const task = (id: string, actor: string, kind: string, location?: string) =>
      location === undefined
        ? pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, 'user-1', $2, $3, 'todo', 'Tarefa')`, [id, actor, kind])
        : pool.query(
            `INSERT INTO tasks (id, user_id, actor, kind, status, name, location) VALUES ($1, 'user-1', $2, $3, 'todo', 'Tarefa', $4)`,
            [id, actor, kind, location],
          );
    await task(ids.located, "human", "common", "Parque Ibirapuera, São Paulo");
    await task(ids.empty, "human", "common");
    await task(ids.blank, "human", "common", "   ");
    await pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, 'user-1', 'agent', 'request', 'queued', 'Pedido')`, [ids.agent]);

    const series = (id: string, template: Record<string, unknown>) =>
      pool.query(
        `INSERT INTO recurrences (id, user_id, freq, time_of_day, starts_on, template) VALUES ($1, 'user-1', 'daily', '18:00', '2026-11-01', $2::jsonb)`,
        [id, JSON.stringify(template)],
      );
    await series(ids.placed, { kind: "common", name: "Terapia", location: "Clínica, Rua Um 10" });
    await series(ids.unplaced, { kind: "common", name: "Correr", location: "" });
    await series(ids.blankSeries, { kind: "common", name: "Ler", location: "  " });

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

  test("o texto vazio vira nulo e o local informado fica", async () => {
    const locations = new Map(
      (await rows<{ id: string; location: string | null }>("SELECT id, location FROM tasks")).map((row) => [row.id, row.location]),
    );

    expect(locations.get(ids.located)).toBe("Parque Ibirapuera, São Paulo");
    expect(locations.get(ids.empty)).toBeNull();
    expect(locations.get(ids.blank)).toBeNull();
    expect(locations.get(ids.agent)).toBeNull();
  });

  test("o template da serie sem local perde a chave; com local, a mantem", async () => {
    const templates = new Map(
      (await rows<{ id: string; template: Record<string, unknown> }>("SELECT id, template FROM recurrences")).map((row) => [row.id, row.template]),
    );

    expect(templates.get(ids.placed)).toEqual({ kind: "common", name: "Terapia", location: "Clínica, Rua Um 10" });
    expect(templates.get(ids.unplaced)).toEqual({ kind: "common", name: "Correr" });
    expect(templates.get(ids.blankSeries)).toEqual({ kind: "common", name: "Ler" });
  });

  test("uma tarefa nova nasce sem local, e o banco recusa local vazio e local em tarefa de agente", async () => {
    const fresh = ulid();
    await pool.query(`INSERT INTO tasks (id, user_id, actor, kind, status, name) VALUES ($1, 'user-1', 'human', 'common', 'todo', 'Nova')`, [fresh]);
    expect(await rows("SELECT location FROM tasks WHERE id = $1", [fresh])).toEqual([{ location: null }]);

    await expect(pool.query("UPDATE tasks SET location = '' WHERE id = $1", [ids.located])).rejects.toThrow(/tasks_location_filled/);
    await expect(pool.query("UPDATE tasks SET location = 'Casa' WHERE id = $1", [ids.agent])).rejects.toThrow(/tasks_location_human/);
  });
});
