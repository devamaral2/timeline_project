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
const MIGRATION = "0012_status_de_agente_proprios";

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

describe("migration dos status de agente, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;

  const humanStatuses = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"];
  const agentBefore = ["queued", "running", "waiting", "awaiting_transcription", "done", "failed", "cancel"];
  const agentAfter: Record<string, string> = {
    queued: "queued", running: "running", waiting: "waiting", awaiting_transcription: "awaiting_transcription", done: "completed", failed: "failed", cancel: "cancelled",
  };
  const humans = new Map<string, string>();
  const requests = new Map<string, string>();
  const steps = new Map<string, string>();
  const saved = new Map<string, string>();

  async function rows<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
    return (await pool.query(text, values)).rows as T[];
  }

  async function statusById(): Promise<Map<string, string>> {
    return new Map((await rows<{ id: string; status: string }>("SELECT id, status FROM tasks")).map((row) => [row.id, row.status]));
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
    const insert = (id: string, actor: string, kind: string, status: string) =>
      pool.query(`INSERT INTO tasks (id, project_id, user_id, actor, kind, status, name) VALUES ($1, $5, 'user-1', $2, $3, $4, 'Tarefa')`, [id, actor, kind, status, PROJECT]);
    for (const status of humanStatuses) {
      const id = ulid();
      humans.set(id, status);
      await insert(id, "human", "common", status);
    }
    for (const status of agentBefore) {
      const requestId = ulid();
      requests.set(requestId, status);
      await insert(requestId, "agent", "request", status);
      const stepId = ulid();
      steps.set(stepId, status);
      await insert(stepId, "agent", "step", status);
      // Os tipos de conteudo guardado (migration 0009) tambem ja tem tarefas com os status antigos.
      for (const kind of ["save_content", "save_content_with_transcription"]) {
        const savedId = ulid();
        saved.set(savedId, `${kind}:${status}`);
        await insert(savedId, "agent", kind, status);
      }
    }

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

  test("pedidos e passos com done e cancel viram completed e cancelled, e os demais status nao mudam", async () => {
    const now = await statusById();

    for (const [id, before] of requests) expect(now.get(id), `pedido ${before}`).toBe(agentAfter[before]);
    for (const [id, before] of steps) expect(now.get(id), `passo ${before}`).toBe(agentAfter[before]);
    for (const [id, before] of saved) expect(now.get(id), `guardado ${before}`).toBe(agentAfter[before.split(":")[1]]);
    expect(now.get([...requests].find(([, status]) => status === "done")?.[0] as string)).toBe("completed");
    expect(now.get([...requests].find(([, status]) => status === "cancel")?.[0] as string)).toBe("cancelled");
  });

  test("as tarefas de pessoa com done e cancel ficam como estavam, e as demais tambem", async () => {
    const now = await statusById();

    for (const [id, before] of humans) expect(now.get(id), `pessoa ${before}`).toBe(before);
  });

  test("o check novo aceita os onze status de agente, nos tipos de conteudo guardado tambem, e recusa os de pessoa em tarefa de agente", async () => {
    const insert = (actor: string, kind: string, status: string) =>
      pool.query(`INSERT INTO tasks (id, project_id, user_id, actor, kind, status, name) VALUES ($1, $5, 'user-1', $2, $3, $4, 'Nova')`, [ulid(), actor, kind, status, PROJECT]);

    for (const status of ["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription", "completed", "interrupted", "failed", "cancelled", "rolled_back"]) {
      await insert("agent", "request", status);
      await insert("agent", "save_content_with_transcription", status);
    }
    await expect(insert("agent", "save_content", "done")).rejects.toThrow(/tasks_status_matches_actor/);
    await expect(insert("agent", "request", "done")).rejects.toThrow(/tasks_status_matches_actor/);
    await expect(insert("agent", "step", "cancel")).rejects.toThrow(/tasks_status_matches_actor/);
    await expect(insert("human", "common", "completed")).rejects.toThrow(/tasks_status_matches_actor/);
    await insert("human", "common", "done");
  });
});
