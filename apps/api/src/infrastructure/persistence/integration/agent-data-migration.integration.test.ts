import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest";

declare module "vitest" {
  interface ProvidedContext { apiPostgresUrl: string }
}

const DRIZZLE_DIR = resolve(__dirname, "../../../../drizzle");
const MIGRATION = "0006_agentes_falam_de_tarefa";

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

describe("migration que reescreve os dados dos pedidos do agente, sobre um banco com dados", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_agent_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;
  const ids = { request: ulid(), step: ulid(), finalized: ulid(), voice: ulid(), input: ulid(), trace: ulid() };

  const dataOf = async (id: string) => (await pool.query("SELECT data FROM task_entries WHERE id = $1", [id])).rows[0].data;

  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE "${databaseName}"`); } finally { await admin.end(); }
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });
    await applyAllBefore(pool, MIGRATION);

    await pool.query(
      `INSERT INTO tasks (id, user_id, actor, kind, status, name, data) VALUES ($1, 'user-1', 'agent', 'request', 'running', 'Pedido', $2::jsonb)`,
      [ids.request, JSON.stringify({ dispatch: { answers: { event_create: { choice: "one", confidence: 1, probability: 1 }, recurring_event_edit: { choice: "none", confidence: 1, probability: 1 } }, uncertain: ["event_edit"], unsupported: [] } })],
    );
    const entry = (id: string, kind: string, data: unknown) =>
      pool.query(`INSERT INTO task_entries (id, task_id, user_id, kind, data) VALUES ($1, $2, 'user-1', $3, $4::jsonb)`, [id, ids.request, kind, JSON.stringify(data)]);
    await entry(ids.finalized, "result", { type: "finalized", entity: { kind: "event", id: "a" }, links: [{ from: { kind: "artifact", id: "b" }, to: { kind: "event", id: "a" } }] });
    await entry(ids.voice, "result", { type: "voice", eventId: "a" });
    await entry(ids.input, "input", { candidates: [{ kind: "event", id: "a", name: "Pagar", eventKind: "common" }] });
    await entry(ids.trace, "thought", { trace: { source: "mcp_braid_create_task" } });
    await applyMigration(pool, MIGRATION);
  }, 60000);

  afterAll(async () => {
    await pool?.end();
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); } finally { await admin.end(); }
  });

  test("reescreve a entidade e as ligacoes do resultado finalizado", async () => {
    expect(await dataOf(ids.finalized)).toEqual({
      type: "finalized", entity: { kind: "task", id: "a" },
      links: [{ from: { kind: "artifact", id: "b" }, to: { kind: "task", id: "a" } }],
    });
  });

  test("reescreve o resultado de voz e os candidatos do passo", async () => {
    expect(await dataOf(ids.voice)).toEqual({ type: "voice", taskId: "a" });
    expect(await dataOf(ids.input)).toEqual({ candidates: [{ kind: "task", id: "a", name: "Pagar", taskKind: "common" }] });
  });

  test("reescreve as escolhas do despacho e o rotulo das ferramentas do rastro", async () => {
    const { data } = (await pool.query("SELECT data FROM tasks WHERE id = $1", [ids.request])).rows[0];
    expect(Object.keys(data.dispatch.answers)).toEqual(["task_create", "recurring_task_edit"]);
    expect(data.dispatch.uncertain).toEqual(["task_edit"]);
    expect(await dataOf(ids.trace)).toEqual({ trace: { source: "mcp_braid_create_task" } });
  });
});
