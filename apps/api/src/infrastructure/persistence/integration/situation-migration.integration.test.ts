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
const PROJECT = ulid();
const MIGRATION = "0013_situacao_da_tarefa_de_agente";

interface JournalEntry { tag: string }

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

describe("migration da situacao, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  const finalStatuses = ["completed", "interrupted", "failed", "cancelled", "rolled_back"];
  const openStatuses = ["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription"];
  const finishedRequests = new Map<string, string>();
  const openRequests = new Map<string, string>();
  const finishedBuildRequests: string[] = [];
  const finishedSteps: string[] = [];
  const finishedCrons: string[] = [];
  const savedContent: string[] = [];
  const humans: string[] = [];

  async function situations(): Promise<Map<string, string | null>> {
    const { rows } = await pool.query<{ id: string; situation: string | null }>("SELECT id, situation FROM tasks");
    return new Map(rows.map((row) => [row.id, row.situation]));
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

    await pool.query(`INSERT INTO projects (id, user_id, name, personal) VALUES ($1, 'user-1', 'personal', true)`, [PROJECT]);
    const insert = async (actor: string, kind: string, status: string): Promise<string> => {
      const id = ulid();
      await pool.query(
        `INSERT INTO tasks (id, project_id, user_id, actor, kind, status, name) VALUES ($1, $5, 'user-1', $2, $3, $4, 'Tarefa')`,
        [id, actor, kind, status, PROJECT],
      );
      return id;
    };
    for (const status of finalStatuses) finishedRequests.set(await insert("agent", "request", status), status);
    for (const status of openStatuses) openRequests.set(await insert("agent", "request", status), status);
    finishedBuildRequests.push(await insert("agent", "build_request", "completed"));
    finishedSteps.push(await insert("agent", "step", "completed"), await insert("agent", "step", "failed"));
    finishedCrons.push(await insert("agent", "cron", "completed"));
    // O conteudo guardado (migration 0009) nunca tem situacao, nem terminado.
    savedContent.push(
      await insert("agent", "save_content", "completed"),
      await insert("agent", "save_content_with_transcription", "failed"),
      await insert("agent", "save_content_with_transcription", "cancelled"),
      await insert("agent", "save_content_with_transcription", "awaiting_transcription"),
    );
    humans.push(await insert("human", "common", "done"), await insert("human", "common", "todo"));

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

  test("os pedidos de agente que ja terminaram ficam revisados, em qualquer status final", async () => {
    const now = await situations();

    for (const [id, status] of finishedRequests) expect(now.get(id), status).toBe("reviewed");
    for (const id of finishedBuildRequests) expect(now.get(id)).toBe("reviewed");
  });

  test("os pedidos abertos, os passos, as execucoes agendadas, o conteudo guardado e as tarefas de pessoa ficam sem situacao", async () => {
    const now = await situations();

    for (const [id, status] of openRequests) expect(now.get(id), status).toBeNull();
    for (const id of [...finishedSteps, ...finishedCrons, ...savedContent, ...humans]) expect(now.get(id)).toBeNull();
  });

  test("os checks novos passam a valer sobre o que a migration gravou", async () => {
    const insert = (kind: string, status: string, situation: string) =>
      pool.query(
        `INSERT INTO tasks (id, project_id, user_id, actor, kind, status, situation, name) VALUES ($1, $5, 'user-1', 'agent', $2, $3, $4, 'Nova')`,
        [ulid(), kind, status, situation, PROJECT],
      );

    await insert("request", "failed", "to_review");
    await expect(insert("request", "running", "to_review")).rejects.toThrow(/tasks_situation_shape/);
    await expect(insert("step", "completed", "to_review")).rejects.toThrow(/tasks_situation_shape/);
    await expect(insert("save_content", "completed", "to_review")).rejects.toThrow(/tasks_situation_shape/);
    await expect(insert("save_content_with_transcription", "failed", "reviewed")).rejects.toThrow(/tasks_situation_shape/);
    await expect(insert("request", "completed", "archived")).rejects.toThrow(/tasks_situation_valid/);
  });
});
