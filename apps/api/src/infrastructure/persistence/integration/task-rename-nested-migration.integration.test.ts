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

async function applyMigration(pool: Pool, tag: string): Promise<void> {
  await pool.query(readFileSync(resolve(DRIZZLE_DIR, `${tag}.sql`), "utf8"));
}

async function applyUpTo(pool: Pool, last: string): Promise<void> {
  const journal = JSON.parse(readFileSync(resolve(DRIZZLE_DIR, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    if (tag === last) return;
    await applyMigration(pool, tag);
  }
  throw new Error(`Migration ${last} fora do diario`);
}

/**
 * As migrations 0005 e 0006 reescrevem jsonb passando por `::text`. Aqui os
 * dados antigos tem chaves aninhadas e formas variadas, e nenhum nome antigo
 * pode sobrar entre aspas (o texto livre do usuario nao e tocado).
 */
describe("migrations 0005 e 0006 sobre jsonb aninhado e variado", () => {
  const adminUrl = inject("apiPostgresUrl");
  const databaseName = `api_nested_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool;
  const ids = { request: ulid(), step: ulid(), series: ulid(), job: ulid(), input: ulid(), result: ulid(), thought: ulid(), voice: ulid(), human: ulid(), artifact: ulid() };

  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE "${databaseName}"`); } finally { await admin.end(); }
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });
    await applyUpTo(pool, "0005_tarefa_no_lugar_de_evento");

    await pool.query(
      `INSERT INTO events (id, user_id, actor, kind, status, name, data) VALUES ($1, 'user-1', 'agent', 'request', 'running', 'Pedido', $2::jsonb)`,
      [ids.request, JSON.stringify({
        dispatch: {
          answers: { event_create: { choice: "one" }, recurring_event_create: { choice: "none" }, event_edit: { choice: "one" }, recurring_event_edit: { choice: "none" } },
          uncertain: ["event_create", "recurring_event_edit"], unsupported: ["event_edit"],
        },
        note: "o evento_create do texto livre fica",
      })],
    );
    await pool.query(
      `INSERT INTO events (id, user_id, actor, kind, status, name, data) VALUES ($1, 'user-1', 'agent', 'step', 'queued', 'Passo', $2::jsonb)`,
      [ids.step, JSON.stringify({ agent: "event-edit", expected: "many" })],
    );
    await pool.query(
      `INSERT INTO events (id, user_id, actor, kind, name) VALUES ($1, 'user-1', 'human', 'common', $2)`,
      [ids.human, "Evento de teste"],
    );
    await pool.query(`INSERT INTO artifacts (id, user_id, type, name) VALUES ($1, 'user-1', 'text', 'Nota')`, [ids.artifact]);
    await pool.query(
      `INSERT INTO recurrences (id, user_id, freq, time_of_day, starts_on, template) VALUES ($1, 'user-1', 'daily', '18:00', '2026-11-01', $2::jsonb)`,
      [ids.series, JSON.stringify({
        kind: "common", name: "Serie", previousEventIds: [ids.human],
        artifacts: [
          { type: "text", name: "mencao ao evento", data: { body: "evento" } },
          { copyOf: ids.artifact, quantity: "1" },
        ],
        artifactIds: [ids.artifact],
      })],
    );
    const entry = (id: string, kind: string, data: unknown) =>
      pool.query(`INSERT INTO event_entries (id, event_id, user_id, kind, data) VALUES ($1, $2, 'user-1', $3, $4::jsonb)`, [id, ids.request, kind, JSON.stringify(data)]);
    await entry(ids.input, "input", {
      candidates: [{ kind: "event", id: "a", name: "Pagar", eventKind: "common" }, { kind: "artifact", id: "b" }],
      nested: { deeper: { kind: "event", eventKind: "meal" } },
    });
    await entry(ids.result, "result", {
      type: "finalized", entities: [{ kind: "event", id: "a" }, { kind: "artifact", id: "b", linkedTo: [{ kind: "event", id: "a" }] }],
    });
    await entry(ids.voice, "result", { type: "voice", eventId: "a" });
    await entry(ids.thought, "thought", {
      trace: { source: "mcp_braid_create_event", tools: ["mcp_braid_update_event", "mcp_braid_get_event", "mcp_braid_list_timeline_events", "mcp_braid_list_tracked_events"] },
    });
    await pool.query(
      `INSERT INTO jobs (id, kind, user_id, actor_id, event_id, payload) VALUES ($1, 'voice-event', 'user-1', 'user-1', $2, $3::jsonb)`,
      [ids.job, ids.request, JSON.stringify({ agent: "recurring-event-create", list: ["event-edit", "recurring-event-edit"], deep: { origin: "voice-event", agent: "event-create" } })],
    );
    await applyMigration(pool, "0005_tarefa_no_lugar_de_evento");
    await applyMigration(pool, "0006_agentes_falam_de_tarefa");
  }, 60000);

  afterAll(async () => {
    await pool?.end();
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); } finally { await admin.end(); }
  });

  /** Todo texto entre aspas que ainda tem o nome antigo, em qualquer jsonb de qualquer tabela (menos a palavra solta "evento", que o teste grava de proposito como texto livre). */
  async function leftovers(): Promise<string[]> {
    const sources = [
      "SELECT data::text AS t FROM tasks", "SELECT data::text AS t FROM task_entries", "SELECT template::text AS t FROM recurrences",
      "SELECT payload::text AS t FROM jobs", "SELECT progress::text AS t FROM jobs WHERE progress IS NOT NULL",
    ];
    const found: string[] = [];
    for (const source of sources) {
      for (const { t } of (await pool.query<{ t: string }>(source)).rows) {
        found.push(...(t.match(/"[A-Za-z_-]*[eE]vent[A-Za-z_-]*"/g) ?? []).filter((token) => token !== '"evento"'));
      }
    }
    return found;
  }

  test("nenhum nome antigo sobra entre aspas, em chave ou valor, aninhado ou nao", async () => {
    expect(await leftovers()).toEqual([]);
  });

  test("a chave aninhada do template e o texto livre seguem como estavam", async () => {
    const [series] = (await pool.query<{ template: Record<string, unknown> }>("SELECT template FROM recurrences WHERE id = $1", [ids.series])).rows;
    expect(series.template).toEqual({
      kind: "common", name: "Serie", previousTaskIds: [ids.human],
      artifacts: [
        { type: "text", name: "mencao ao evento", data: { body: "evento" } },
        { copyOf: ids.artifact, quantity: "1" },
      ],
      artifactIds: [ids.artifact],
    });
    const [human] = (await pool.query<{ name: string }>("SELECT name FROM tasks WHERE id = $1", [ids.human])).rows;
    expect(human.name).toBe("Evento de teste");
  });

  test("o despacho, o passo, os registros e o job sao reescritos por inteiro", async () => {
    const { rows: [request] } = await pool.query("SELECT data FROM tasks WHERE id = $1", [ids.request]);
    expect(Object.keys(request.data.dispatch.answers).sort()).toEqual(["recurring_task_create", "recurring_task_edit", "task_create", "task_edit"]);
    expect(request.data.dispatch.uncertain).toEqual(["task_create", "recurring_task_edit"]);
    expect(request.data.dispatch.unsupported).toEqual(["task_edit"]);

    const { rows: [step] } = await pool.query("SELECT data FROM tasks WHERE id = $1", [ids.step]);
    expect(step.data).toEqual({ agent: "task-edit", expected: "many" });

    const { rows: [input] } = await pool.query("SELECT data FROM task_entries WHERE id = $1", [ids.input]);
    expect(input.data.candidates[0]).toEqual({ kind: "task", id: "a", name: "Pagar", taskKind: "common" });
    expect(input.data.nested).toEqual({ deeper: { kind: "task", taskKind: "meal" } });

    const { rows: [result] } = await pool.query("SELECT data FROM task_entries WHERE id = $1", [ids.result]);
    expect(result.data.entities).toEqual([{ kind: "task", id: "a" }, { kind: "artifact", id: "b", linkedTo: [{ kind: "task", id: "a" }] }]);

    const { rows: [voice] } = await pool.query("SELECT data FROM task_entries WHERE id = $1", [ids.voice]);
    expect(voice.data).toEqual({ type: "voice", taskId: "a" });

    const { rows: [thought] } = await pool.query("SELECT data FROM task_entries WHERE id = $1", [ids.thought]);
    expect(thought.data.trace).toEqual({
      source: "mcp_braid_create_task",
      tools: ["mcp_braid_update_task", "mcp_braid_get_task", "mcp_braid_list_agenda_tasks", "mcp_braid_list_tracked_tasks"],
    });

    const { rows: [job] } = await pool.query("SELECT payload FROM jobs WHERE id = $1", [ids.job]);
    expect(job.payload).toEqual({ agent: "recurring-task-create", list: ["task-edit", "recurring-task-edit"], deep: { origin: "voice-task", agent: "task-create" } });
  });
});
