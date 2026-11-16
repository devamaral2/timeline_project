import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

type Row = Record<string, unknown>;

describe("banco novo: checks, restricoes e indices", () => {
  let ctx: PostgresTestContext;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function insert(table: string, row: Row): Promise<void> {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await ctx.pool.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      columns.map((column) => row[column]),
    );
  }

  async function event(overrides: Row = {}): Promise<string> {
    const id = (overrides.id as string | undefined) ?? ulid();
    await insert("events", { id, user_id: "user-1", actor: "human", kind: "common", name: "Evento", ...overrides });
    return id;
  }

  const agentEvent = (overrides: Row = {}) =>
    event({ actor: "agent", kind: "request", status: "queued", name: "Pedido", ...overrides });

  async function artifact(overrides: Row = {}): Promise<string> {
    const id = (overrides.id as string | undefined) ?? ulid();
    await insert("artifacts", { id, user_id: "user-1", type: "text", name: "Artefato", ...overrides });
    return id;
  }

  async function recurrence(): Promise<string> {
    const id = ulid();
    await insert("recurrences", {
      id,
      user_id: "user-1",
      freq: "daily",
      time_of_day: "18:00",
      starts_on: "2026-11-01",
      template: "{}",
    });
    return id;
  }

  const count = async (table: string) =>
    (await ctx.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;

  test("a migration cria exatamente as 13 tabelas", async () => {
    const { rows } = await ctx.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );

    expect(rows.map((row) => row.table_name)).toEqual([
      "artifact_artifact_relation",
      "artifact_tags",
      "artifacts",
      "event_artifact_relation",
      "event_entries",
      "event_event_relation",
      "event_tags",
      "events",
      "idempotency_keys",
      "jobs",
      "recurrence_exceptions",
      "recurrences",
      "tags",
    ]);
  });

  describe("events: tipo e status conforme o executor", () => {
    test("pessoa aceita os tipos de pessoa e recusa tipo de agente", async () => {
      for (const kind of ["common", "meal", "sleep", "training"]) await event({ kind });

      await expect(event({ kind: "request" })).rejects.toThrow(/events_kind_matches_actor/);
      await expect(event({ kind: "step" })).rejects.toThrow(/events_kind_matches_actor/);
    });

    test("agente aceita os tipos de agente e recusa tipo de pessoa", async () => {
      for (const kind of [
        "request",
        "search_request",
        "build_request",
        "inquiry_request",
        "review_request",
        "cron",
        "step",
      ]) {
        await agentEvent({ kind });
      }

      await expect(agentEvent({ kind: "meal" })).rejects.toThrow(/events_kind_matches_actor/);
    });

    test("evento de pessoa pode nao ter status: e o evento de referencia", async () => {
      const id = await event({ status: null });

      const { rows } = await ctx.pool.query("SELECT status, priority, revision FROM events WHERE id = $1", [id]);
      expect(rows[0]).toEqual({ status: null, priority: "medium", revision: 1 });
    });

    test("evento de agente sempre tem status", async () => {
      await expect(agentEvent({ status: null })).rejects.toThrow(/events_status_matches_actor/);
    });

    test("cada executor so aceita os seus status; done e cancel valem para os dois", async () => {
      for (const status of ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"]) await event({ status });
      for (const status of ["queued", "running", "waiting", "done", "failed", "cancel"]) await agentEvent({ status });

      await expect(event({ status: "queued" })).rejects.toThrow(/events_status_matches_actor/);
      await expect(event({ status: "scheduled" })).rejects.toThrow(/events_status_matches_actor/);
      await expect(agentEvent({ status: "todo" })).rejects.toThrow(/events_status_matches_actor/);
      await expect(agentEvent({ status: "missed" })).rejects.toThrow(/events_status_matches_actor/);
    });

    test("executor e prioridade fora do conjunto sao recusados", async () => {
      await expect(event({ actor: "bot" })).rejects.toThrow(/events_actor_valid/);
      await expect(event({ priority: "normal" })).rejects.toThrow(/events_priority_valid/);
    });
  });

  describe("events: datas", () => {
    test("o fim planejado nao vem antes do inicio", async () => {
      await expect(
        event({ started_at: "2026-11-14T10:00:00Z", estimated_finish_at: "2026-11-14T09:00:00Z" }),
      ).rejects.toThrow(/events_block_span/);
    });

    test("fora do evento longo o bloco dura no maximo 31 dias", async () => {
      await event({ started_at: "2026-11-01T10:00:00Z", estimated_finish_at: "2026-12-02T10:00:00Z" });

      await expect(
        event({ started_at: "2026-11-01T10:00:00Z", estimated_finish_at: "2026-12-02T10:00:01Z" }),
      ).rejects.toThrow(/events_block_span/);
    });

    test("concluir antes do inicio planejado e valido", async () => {
      await event({ status: "done", started_at: "2026-11-15T10:00:00Z", finished_at: "2026-11-14T08:00:00Z" });
    });

    test("so o prazo, sem inicio, e valido", async () => {
      await event({ status: "todo", estimated_finish_at: "2026-11-20T23:00:00Z" });
    });

    test("os avisos ficam entre 1 minuto e 30 dias", async () => {
      await event({ started_at: "2026-11-14T10:00:00Z", notify_offsets_minutes: [10, 43200] });

      await expect(event({ notify_offsets_minutes: [0] })).rejects.toThrow(/events_notify_offsets_valid/);
      await expect(event({ notify_offsets_minutes: [43201] })).rejects.toThrow(/events_notify_offsets_valid/);
    });
  });

  describe("events: evento longo", () => {
    const long = (overrides: Row = {}) => event({ long_running: true, status: "doing", ...overrides });

    test("aceita meses de duracao e inicio real depois do prazo", async () => {
      await long({ started_at: "2026-11-01T10:00:00Z", estimated_finish_at: "2027-03-01T10:00:00Z" });
      await long({ started_at: "2026-11-20T10:00:00Z", estimated_finish_at: "2026-11-10T10:00:00Z" });
      await long();
    });

    test("e sempre de pessoa, com status, sem serie e nunca perdido", async () => {
      const series = await recurrence();

      await expect(agentEvent({ long_running: true })).rejects.toThrow(/events_long_running_shape/);
      await expect(long({ status: null })).rejects.toThrow(/events_long_running_shape/);
      await expect(long({ status: "missed" })).rejects.toThrow(/events_long_running_shape/);
      await expect(long({ recurrence_id: series, occurrence_on: "2026-11-14" })).rejects.toThrow(
        /events_long_running_shape/,
      );
    });

    test("sem prazo nao tem aviso; com prazo tem", async () => {
      await long({ estimated_finish_at: "2026-12-20T10:00:00Z", notify_offsets_minutes: [1440] });

      await expect(long({ notify_offsets_minutes: [1440] })).rejects.toThrow(/events_long_running_notify/);
    });
  });

  describe("events: serie", () => {
    test("ocorrencia precisa do dia", async () => {
      const series = await recurrence();

      await expect(event({ recurrence_id: series })).rejects.toThrow(/events_occurrence_requires_day/);
    });

    test("uma ocorrencia por dia, e a apagada continua ocupando o dia", async () => {
      const series = await recurrence();
      await event({ recurrence_id: series, occurrence_on: "2026-11-14", deleted_at: "2026-11-14T12:00:00Z" });
      await event({ recurrence_id: series, occurrence_on: "2026-11-15" });

      await expect(event({ recurrence_id: series, occurrence_on: "2026-11-14" })).rejects.toThrow(
        /events_recurrence_occurrence_unique/,
      );
    });

    test("apagar a regra nao apaga as ocorrencias: so tira o vinculo", async () => {
      const series = await recurrence();
      const id = await event({ recurrence_id: series, occurrence_on: "2026-11-14" });

      await ctx.pool.query("DELETE FROM recurrences WHERE id = $1", [series]);

      const { rows } = await ctx.pool.query("SELECT recurrence_id, occurrence_on::text FROM events WHERE id = $1", [id]);
      expect(rows[0]).toEqual({ recurrence_id: null, occurrence_on: "2026-11-14" });
    });
  });

  describe("event_entries", () => {
    const entry = (eventId: string, overrides: Row) =>
      insert("event_entries", { id: ulid(), event_id: eventId, user_id: "user-1", ...overrides });

    test("aceita os cinco tipos", async () => {
      const request = await agentEvent();

      await entry(request, { kind: "message", role: "user", content: "marca o treino" });
      await entry(request, { kind: "thought", content: "vou procurar o treino" });
      await entry(request, { kind: "trace", data: { ms: 420, code: "dispatch" } });
      await entry(request, { kind: "result", data: { eventId: "x" } });
      await entry(request, { kind: "input", content: "retrato do evento" });

      expect(await count("event_entries")).toBe(5);
    });

    test("role existe so em mensagem, e so user ou agent", async () => {
      const request = await agentEvent();

      await expect(entry(request, { kind: "message", content: "sem role" })).rejects.toThrow(
        /event_entries_role_only_in_message/,
      );
      await expect(entry(request, { kind: "thought", role: "agent", content: "x" })).rejects.toThrow(
        /event_entries_role_only_in_message/,
      );
      await expect(entry(request, { kind: "message", role: "assistant", content: "x" })).rejects.toThrow(
        /event_entries_role_valid/,
      );
    });

    test("trace nao guarda texto", async () => {
      const request = await agentEvent();

      await expect(entry(request, { kind: "trace", content: "texto do usuario" })).rejects.toThrow(
        /event_entries_trace_without_text/,
      );
    });

    test("apagar fisicamente o evento leva as entradas", async () => {
      const request = await agentEvent();
      await entry(request, { kind: "message", role: "user", content: "oi" });

      await ctx.pool.query("DELETE FROM events WHERE id = $1", [request]);

      expect(await count("event_entries")).toBe(0);
    });
  });

  describe("artifacts", () => {
    test("so alimento e exercicio podem ser globais", async () => {
      await artifact({ user_id: null, type: "food", name: "Arroz" });
      await artifact({ user_id: null, type: "workout", name: "Agachamento", data: { code: "squat" } });

      await expect(artifact({ user_id: null, type: "text" })).rejects.toThrow(/artifacts_global_only_catalog/);
      await expect(artifact({ type: "note" })).rejects.toThrow(/artifacts_type_valid/);
    });

    test("o codigo do exercicio global e unico", async () => {
      await artifact({ user_id: null, type: "workout", name: "Agachamento", data: { code: "squat" } });

      await expect(
        artifact({ user_id: null, type: "workout", name: "Agachamento livre", data: { code: "squat" } }),
      ).rejects.toThrow(/artifacts_workout_code_unique/);
    });

    test("um artefato vivo por arquivo de skill ou agente", async () => {
      const first = await artifact({ type: "skill", name: "Agenda", data: { path: "hermes/skills/agenda/SKILL.md" } });

      await expect(
        artifact({ type: "skill", name: "Agenda", data: { path: "hermes/skills/agenda/SKILL.md" } }),
      ).rejects.toThrow(/artifacts_agent_file_unique/);

      await ctx.pool.query("UPDATE artifacts SET deleted_at = now() WHERE id = $1", [first]);
      await artifact({ type: "skill", name: "Agenda", data: { path: "hermes/skills/agenda/SKILL.md" } });
    });

    test("data e sempre um objeto", async () => {
      await expect(artifact({ data: "[]" })).rejects.toThrow(/artifacts_data_object/);
    });
  });

  describe("relacoes entre eventos", () => {
    const relate = (from: string, to: string, relation: string) =>
      insert("event_event_relation", { from_event_id: from, to_event_id: to, relation });

    test("um evento pode seguir mais de um antecessor e anteceder mais de um sucessor", async () => {
      const [first, second, shared, after] = [await event(), await event(), await event(), await event()];

      await relate(first, shared, "precedes");
      await relate(second, shared, "precedes");
      await relate(shared, after, "precedes");

      expect(await count("event_event_relation")).toBe(3);
    });

    test("o mesmo par pode ter relacoes de tipos diferentes, mas nao a mesma duas vezes", async () => {
      const [a, b] = [await event(), await event()];
      await relate(a, b, "precedes");
      await relate(a, b, "follow_up");

      await expect(relate(a, b, "precedes")).rejects.toThrow(/event_event_relation_.*_pk/);
    });

    test("um evento nao se relaciona consigo mesmo, e o tipo e do conjunto", async () => {
      const [a, b] = [await event(), await event()];

      await expect(relate(a, a, "precedes")).rejects.toThrow(/event_event_not_self/);
      await expect(relate(a, b, "parent")).rejects.toThrow(/event_event_relation_valid/);
    });

    test("os tipos antigos subtask e blocks nao existem mais", async () => {
      const [a, b] = [await event(), await event()];

      await expect(relate(a, b, "subtask")).rejects.toThrow(/event_event_relation_valid/);
      await expect(relate(a, b, "blocks")).rejects.toThrow(/event_event_relation_valid/);
      for (const relation of ["generates", "updates", "deletes", "step", "precedes", "follow_up"]) {
        await relate(a, b, relation);
      }
      expect(await count("event_event_relation")).toBe(6);
    });

    test("cada continuacao tem um so primeiro pedido", async () => {
      const [first, other, followUp] = [await agentEvent(), await agentEvent(), await agentEvent()];
      await relate(first, followUp, "follow_up");

      await expect(relate(other, followUp, "follow_up")).rejects.toThrow(/event_event_follow_up_unique/);
    });

    test("apagar fisicamente uma ponta leva a relacao, e nao a outra ponta", async () => {
      const [project, session] = [await event(), await event()];
      await relate(project, session, "precedes");

      await ctx.pool.query("DELETE FROM events WHERE id = $1", [project]);

      expect(await count("event_event_relation")).toBe(0);
      expect(await count("events")).toBe(1);
    });
  });

  describe("relacoes entre evento e artefato", () => {
    const link = (eventId: string, artifactId: string, overrides: Row = {}) =>
      insert("event_artifact_relation", { event_id: eventId, artifact_id: artifactId, relation: "uses", ...overrides });

    test("uma linha por par", async () => {
      const [meal, food] = [await event({ kind: "meal" }), await artifact({ type: "food" })];
      await link(meal, food, { relation: "creates", position: 0 });

      await expect(link(meal, food, { relation: "uses", position: 1 })).rejects.toThrow(
        /event_artifact_relation_.*_pk/,
      );
    });

    test("a posicao e unica no evento, mas a relacao de um passo nao tem posicao", async () => {
      const [meal, step] = [await event({ kind: "meal" }), await agentEvent({ kind: "step" })];
      const [a, b, c] = [await artifact(), await artifact(), await artifact()];
      await link(meal, a, { position: 0 });
      await link(step, a, { relation: "updates" });
      await link(step, b, { relation: "creates" });

      await expect(link(meal, c, { position: 0 })).rejects.toThrow(/event_artifact_event_position_unique/);
      await expect(link(meal, c, { position: -1 })).rejects.toThrow(/event_artifact_position_nonneg/);
    });

    test("reordenar com position + 1 nao colide no meio do UPDATE", async () => {
      const meal = await event({ kind: "meal" });
      const [a, b] = [await artifact(), await artifact()];
      await link(meal, a, { position: 0 });
      await link(meal, b, { position: 1 });

      await ctx.pool.query("UPDATE event_artifact_relation SET position = position + 1 WHERE event_id = $1", [meal]);

      const { rows } = await ctx.pool.query(
        "SELECT artifact_id, position FROM event_artifact_relation WHERE event_id = $1 ORDER BY position",
        [meal],
      );
      expect(rows).toEqual([
        { artifact_id: a, position: 1 },
        { artifact_id: b, position: 2 },
      ]);
    });

    test("o tipo e do conjunto", async () => {
      const [meal, food] = [await event({ kind: "meal" }), await artifact({ type: "food" })];

      await expect(link(meal, food, { relation: "derives" })).rejects.toThrow(/event_artifact_relation_valid/);
    });
  });

  describe("relacoes entre artefatos", () => {
    const derive = (from: string, to: string) =>
      insert("artifact_artifact_relation", { from_artifact_id: from, to_artifact_id: to, relation: "derives" });

    test("uma copia tem um so original, e um original tem varias copias", async () => {
      const [rice, beans] = [await artifact({ type: "food" }), await artifact({ type: "food" })];
      const [eatenMonday, eatenTuesday] = [
        await artifact({ type: "food", derived: true }),
        await artifact({ type: "food", derived: true }),
      ];
      await derive(rice, eatenMonday);
      await derive(rice, eatenTuesday);

      await expect(derive(beans, eatenMonday)).rejects.toThrow(/artifact_derives_copy_unique/);
      await expect(derive(rice, rice)).rejects.toThrow(/artifact_artifact_not_self/);
    });
  });

  describe("tags", () => {
    test("o nome e normalizado e unico por usuario", async () => {
      await insert("tags", { id: ulid(), user_id: "user-1", name: "saúde" });
      await insert("tags", { id: ulid(), user_id: "user-2", name: "saúde" });

      await expect(insert("tags", { id: ulid(), user_id: "user-1", name: "saúde" })).rejects.toThrow(
        /tags_user_name_unique/,
      );
      await expect(insert("tags", { id: ulid(), user_id: "user-1", name: " Saúde" })).rejects.toThrow(
        /tag_name_normalized/,
      );
    });
  });

  describe("jobs", () => {
    const job = (overrides: Row = {}) =>
      insert("jobs", { id: ulid(), kind: "step", user_id: "user-1", actor_id: "user-1", payload: "{}", ...overrides });

    test("a chave de deduplicacao e unica por usuario e tipo; sem chave nada colide", async () => {
      await job({ dedupe_key: "m1" });
      await job({ dedupe_key: "m1", kind: "voice" });
      await job();
      await job();

      await expect(job({ dedupe_key: "m1" })).rejects.toThrow(/jobs_dedupe_unique/);
    });

    test("o status e do conjunto e nasce na fila", async () => {
      await job();

      expect((await ctx.pool.query("SELECT status, attempts FROM jobs")).rows[0]).toEqual({
        status: "queued",
        attempts: 0,
      });
      await expect(job({ status: "done" })).rejects.toThrow(/jobs_status_valid/);
    });

    test("apagar fisicamente o passo leva o job dele", async () => {
      const step = await agentEvent({ kind: "step" });
      await job({ event_id: step });

      await ctx.pool.query("DELETE FROM events WHERE id = $1", [step]);

      expect(await count("jobs")).toBe(0);
    });

    test("dois workers nao pegam o mesmo job", async () => {
      await job();
      await job();
      const claim = `SELECT id FROM jobs WHERE status = 'queued' AND available_at <= now()
        ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
      const [first, second] = [await ctx.pool.connect(), await ctx.pool.connect()];

      try {
        await first.query("BEGIN");
        await second.query("BEGIN");
        const a = (await first.query(claim)).rows[0].id;
        const b = (await second.query(claim)).rows[0].id;

        expect(a).not.toBe(b);
      } finally {
        await first.query("ROLLBACK");
        await second.query("ROLLBACK");
        first.release();
        second.release();
      }
    });
  });

  // O planejador so usa um indice parcial quando o filtro da consulta implica o
  // filtro do indice. Sem varredura sequencial, o plano mostra se a consulta de
  // cada tela (docs/tdd/novo-banco-de-dados.md) casa com o indice feito para ela.
  describe("a consulta de cada tela usa o indice feito para ela", () => {
    async function planOf(query: string): Promise<string> {
      const client = await ctx.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL enable_seqscan = off");
        const { rows } = await client.query(`EXPLAIN ${query}`);
        return rows.map((row) => row["QUERY PLAN"]).join("\n");
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    }

    test("janela da agenda", async () => {
      const plan = await planOf(`
        SELECT id FROM events
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND NOT long_running AND kind <> 'step'
          AND started_at <= '2026-11-21T03:00:00Z'
          AND started_at >= timestamptz '2026-11-14T03:00:00Z' - interval '31 days'
          AND coalesce(estimated_finish_at, finished_at, started_at) >= '2026-11-14T03:00:00Z'
        ORDER BY started_at, id`);

      expect(plan).toContain("events_agenda_idx");
    });

    test("sem o filtro de passos a consulta nao casa com o indice da agenda", async () => {
      const plan = await planOf(`
        SELECT id FROM events
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND NOT long_running
          AND started_at BETWEEN '2026-11-14T03:00:00Z' AND '2026-11-21T03:00:00Z'
        ORDER BY started_at, id`);

      expect(plan).not.toContain("events_agenda_idx");
    });

    test("agenda so de pessoa", async () => {
      const plan = await planOf(`
        SELECT id FROM events
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND NOT long_running AND kind <> 'step'
          AND actor = 'human' AND started_at BETWEEN '2026-11-14T03:00:00Z' AND '2026-11-21T03:00:00Z'
        ORDER BY started_at, id`);

      expect(plan).toContain("events_agenda_idx");
    });

    test("lista de tarefas por status e data", async () => {
      const plan = await planOf(`
        SELECT id FROM events
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND kind <> 'step' AND status = 'todo'
        ORDER BY coalesce(started_at, estimated_finish_at), id LIMIT 50`);

      expect(plan).toContain("events_tracked_idx");
    });

    test("lista de pedidos", async () => {
      const plan = await planOf(`
        SELECT id FROM events
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND actor = 'agent' AND kind <> 'step'
        ORDER BY id DESC LIMIT 50`);

      expect(plan).toContain("events_requests_idx");
    });

    test("todos os eventos vivos de pessoa", async () => {
      const plan = await planOf(
        "SELECT id FROM events WHERE user_id = 'user-1' AND deleted_at IS NULL AND actor = 'human'",
      );

      expect(plan).toContain("events_user_live_idx");
    });

    test("entradas de um evento, em ordem e a partir da ultima lida", async () => {
      const plan = await planOf(`
        SELECT id FROM event_entries
        WHERE event_id = '01JCZ0000000000000000000AA' AND id > '01JCZ0000000000000000000AB' ORDER BY id`);

      expect(plan).toContain("event_entries_event_idx");
    });

    test("relacoes para um evento, por tipo", async () => {
      const plan = await planOf(`
        SELECT from_event_id FROM event_event_relation
        WHERE to_event_id = '01JCZ0000000000000000000AA' AND relation = 'precedes'`);

      expect(plan).toContain("event_event_reverse_idx");
    });

    test("em quais eventos um artefato aparece", async () => {
      const plan = await planOf(
        "SELECT event_id FROM event_artifact_relation WHERE artifact_id = '01JCZ0000000000000000000AA'",
      );

      expect(plan).toContain("event_artifact_reverse_idx");
    });

    test("lista de artefatos por tipo, sem copias", async () => {
      const plan = await planOf(`
        SELECT id FROM artifacts
        WHERE user_id = 'user-1' AND type = 'food' AND deleted_at IS NULL AND NOT derived
        ORDER BY updated_at DESC, id DESC LIMIT 50`);

      expect(plan).toContain("artifacts_user_type_recent_idx");
    });

    test("catalogo global por nome", async () => {
      const plan = await planOf(`
        SELECT id FROM artifacts
        WHERE user_id IS NULL AND deleted_at IS NULL AND type = 'food' AND name >= 'arr' ORDER BY name LIMIT 20`);

      expect(plan).toContain("artifacts_global_idx");
    });

    test("fila: proximo job e lease vencido", async () => {
      const next = await planOf(`
        SELECT id FROM jobs WHERE status = 'queued' AND available_at <= now()
        ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const expired = await planOf("SELECT id FROM jobs WHERE status = 'running' AND lease_until <= now()");

      expect(next).toContain("jobs_queue_idx");
      expect(expired).toContain("jobs_lease_idx");
    });
  });
});
