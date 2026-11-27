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
const MIGRATION = "0014_projeto_padrao_diario";

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

test("a migration do projeto padrao esta no diario", () => {
  expect(journal().map((entry) => entry.tag)).toContain(MIGRATION);
});

describe("migration que renomeia o projeto padrao para diario, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  const ids = { defaultA: ulid(), defaultB: ulid(), takenA: ulid(), otherB: ulid() };

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

    const project = (id: string, userId: string, name: string, personal: boolean) =>
      pool.query("INSERT INTO projects (id, user_id, name, personal) VALUES ($1, $2, $3, $4)", [id, userId, name, personal]);
    await project(ids.defaultA, "user-a", "personal", true);
    await project(ids.takenA, "user-a", "Diario", false);
    await project(ids.defaultB, "user-b", "personal", true);
    await project(ids.otherB, "user-b", "braid", false);

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

  test("o padrao vira diario com o mesmo id, e o diario que a pessoa criou muda de nome", async () => {
    const { rows } = await pool.query("SELECT id, name, personal FROM projects");
    const byId = new Map(rows.map((row) => [row.id, [row.name, row.personal]]));

    expect(byId).toEqual(new Map([
      [ids.defaultA, ["diario", true]],
      [ids.takenA, ["diario (antigo)", false]],
      [ids.defaultB, ["diario", true]],
      [ids.otherB, ["braid", false]],
    ]));
  });

  test("a trava passa a exigir diario no projeto padrao", async () => {
    await expect(pool.query("UPDATE projects SET name = 'personal' WHERE id = $1", [ids.defaultA])).rejects.toThrow(/projects_personal_name/);
  });
});
