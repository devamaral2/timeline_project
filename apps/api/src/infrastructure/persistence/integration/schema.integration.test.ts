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

  /** O `diario` do usuario, criado na primeira necessidade: toda tarefa e serie precisa de um projeto. */
  async function personalProject(userId: string): Promise<string> {
    const found = await ctx.pool.query("SELECT id FROM projects WHERE user_id = $1 AND personal", [userId]);
    if (found.rows[0]) return found.rows[0].id as string;
    const id = ulid();
    await insert("projects", { id, user_id: userId, name: "diario", personal: true });
    return id;
  }

  async function task(overrides: Row = {}): Promise<string> {
    const id = (overrides.id as string | undefined) ?? ulid();
    const userId = (overrides.user_id as string | undefined) ?? "user-1";
    await insert("tasks", {
      id, user_id: userId, project_id: await personalProject(userId), actor: "human", kind: "common", name: "Tarefa", ...overrides,
    });
    return id;
  }

  const agentTask = (overrides: Row = {}) =>
    task({ actor: "agent", kind: "request", status: "queued", name: "Pedido", ...overrides });

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
      project_id: await personalProject("user-1"),
      freq: "daily",
      time_of_day: "18:00",
      starts_on: "2026-11-01",
      template: "{}",
    });
    return id;
  }

  const count = async (table: string) =>
    (await ctx.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;

  test("a migration cria exatamente as 14 tabelas", async () => {
    const { rows } = await ctx.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );

    expect(rows.map((row) => row.table_name)).toEqual([
      "artifact_artifact_relation",
      "artifact_tags",
      "artifacts",
      "idempotency_keys",
      "jobs",
      "projects",
      "recurrence_exceptions",
      "recurrences",
      "tags",
      "task_artifact_relation",
      "task_entries",
      "task_tags",
      "task_task_relation",
      "tasks",
    ]);
  });

  describe("projects: nome, personal e a chave das tarefas", () => {
    const project = (overrides: Row = {}) => insert("projects", { id: ulid(), user_id: "user-1", name: "timeline_project", ...overrides });

    test("o nome tem de 1 a 60 caracteres e nao leva espaco nas pontas", async () => {
      await project({ name: "a" });
      await project({ name: "x".repeat(60) });

      await expect(project({ name: "" })).rejects.toThrow(/projects_name_shape/);
      await expect(project({ name: "x".repeat(61) })).rejects.toThrow(/projects_name_shape/);
      await expect(project({ name: " espaco" })).rejects.toThrow(/projects_name_shape/);
      await expect(project({ name: "espaco " })).rejects.toThrow(/projects_name_shape/);
    });

    test("o nome e unico por usuario sem distinguir maiusculas", async () => {
      await project({ name: "Braid" });

      await expect(project({ name: "braid" })).rejects.toThrow(/projects_user_name_unique/);
      await project({ name: "braid", user_id: "user-2" });
    });

    test("cada usuario tem no maximo um personal, e o nome dele e diario", async () => {
      await project({ name: "diario", personal: true });

      await expect(project({ name: "diario", personal: true })).rejects.toThrow(/projects_user_name_unique|projects_user_personal_unique/);
      await expect(project({ name: "outro", personal: true, user_id: "user-2" })).rejects.toThrow(/projects_personal_name/);
      await project({ name: "diario", personal: true, user_id: "user-2" });
    });

    test("a tarefa e a serie exigem projeto, e um projeto com tarefa nao se apaga", async () => {
      await expect(
        insert("tasks", { id: ulid(), user_id: "user-1", actor: "human", kind: "common", name: "Sem projeto" }),
      ).rejects.toThrow(/project_id/);
      await expect(
        insert("recurrences", { id: ulid(), user_id: "user-1", freq: "daily", time_of_day: "18:00", starts_on: "2026-11-01", template: "{}" }),
      ).rejects.toThrow(/project_id/);
      await expect(
        insert("tasks", { id: ulid(), user_id: "user-1", project_id: ulid(), actor: "human", kind: "common", name: "Projeto que nao existe" }),
      ).rejects.toThrow(/tasks_project_id_projects_id_fk/);

      await task();
      await recurrence();
      await expect(ctx.pool.query("DELETE FROM projects")).rejects.toThrow(/foreign key/);
    });
  });

  describe("tasks: tipo e status conforme o executor", () => {
    test("pessoa aceita os tipos de pessoa e recusa tipo de agente", async () => {
      for (const kind of ["common", "meal", "sleep", "training"]) await task({ kind });

      await expect(task({ kind: "request" })).rejects.toThrow(/tasks_kind_matches_actor/);
      await expect(task({ kind: "step" })).rejects.toThrow(/tasks_kind_matches_actor/);
      await expect(task({ kind: "save_content" })).rejects.toThrow(/tasks_kind_matches_actor/);
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
        "save_content",
        "save_content_with_transcription",
      ]) {
        await agentTask({ kind });
      }

      await expect(agentTask({ kind: "meal" })).rejects.toThrow(/tasks_kind_matches_actor/);
    });

    test("tarefa de pessoa pode nao ter status: e a tarefa de referencia", async () => {
      const id = await task({ status: null });

      const { rows } = await ctx.pool.query("SELECT status, priority, revision FROM tasks WHERE id = $1", [id]);
      expect(rows[0]).toEqual({ status: null, priority: "medium", revision: 1 });
    });

    test("tarefa de agente sempre tem status", async () => {
      await expect(agentTask({ status: null })).rejects.toThrow(/tasks_status_matches_actor/);
    });

    test("cada executor so aceita os seus status, e os dois conjuntos nao tem valor em comum", async () => {
      const humanStatuses = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"];
      const agentStatuses = ["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription", "completed", "interrupted", "failed", "cancelled", "rolled_back"];
      expect(agentStatuses.filter((status) => humanStatuses.includes(status))).toEqual([]);

      for (const status of humanStatuses) await task({ status });
      for (const status of agentStatuses) await agentTask({ status });

      for (const status of agentStatuses) await expect(task({ status }), status).rejects.toThrow(/tasks_status_matches_actor/);
      for (const status of ["done", "cancel", "scheduled"]) {
        await expect(agentTask({ status }), status).rejects.toThrow(/tasks_status_matches_actor/);
      }
      await expect(task({ status: "scheduled" })).rejects.toThrow(/tasks_status_matches_actor/);
      await expect(agentTask({ status: "todo" })).rejects.toThrow(/tasks_status_matches_actor/);
      await expect(agentTask({ status: "missed" })).rejects.toThrow(/tasks_status_matches_actor/);
    });

    test("a situacao so vale no pedido de agente que terminou, e e opcional", async () => {
      for (const status of ["completed", "interrupted", "failed", "cancelled", "rolled_back"]) {
        for (const situation of ["to_review", "reviewed", "bookmarked"]) await agentTask({ status, situation });
        await agentTask({ status, situation: null });
      }
      await agentTask({ kind: "build_request", status: "completed", situation: "reviewed" });

      for (const status of ["preparing", "queued", "starting", "running", "waiting"]) {
        await expect(agentTask({ status, situation: "to_review" }), status).rejects.toThrow(/tasks_situation_shape/);
      }
      await expect(agentTask({ kind: "step", status: "completed", situation: "to_review" })).rejects.toThrow(/tasks_situation_shape/);
      await expect(agentTask({ kind: "cron", status: "completed", situation: "to_review" })).rejects.toThrow(/tasks_situation_shape/);
      for (const kind of ["save_content", "save_content_with_transcription"]) {
        for (const status of ["completed", "failed", "cancelled"]) {
          await agentTask({ kind, status });
          await expect(agentTask({ kind, status, situation: "to_review" }), `${kind} ${status}`).rejects.toThrow(/tasks_situation_shape/);
        }
      }
      await expect(task({ status: "done", situation: "reviewed" })).rejects.toThrow(/tasks_situation_shape/);
      await expect(task({ status: null, situation: "reviewed" })).rejects.toThrow(/tasks_situation_shape/);
    });

    test("a situacao fora do conjunto e recusada", async () => {
      await expect(agentTask({ status: "completed", situation: "archived" })).rejects.toThrow(/tasks_situation_valid/);
    });

    test("executor e prioridade fora do conjunto sao recusados", async () => {
      await expect(task({ actor: "bot" })).rejects.toThrow(/tasks_actor_valid/);
      await expect(task({ priority: "normal" })).rejects.toThrow(/tasks_priority_valid/);
    });
  });

  describe("tasks: datas", () => {
    test("o fim planejado nao vem antes do inicio", async () => {
      await expect(
        task({ started_at: "2026-11-14T10:00:00Z", estimated_finish_at: "2026-11-14T09:00:00Z" }),
      ).rejects.toThrow(/tasks_block_span/);
    });

    test("fora da tarefa longa o bloco dura no maximo 31 dias", async () => {
      await task({ started_at: "2026-11-01T10:00:00Z", estimated_finish_at: "2026-12-02T10:00:00Z" });

      await expect(
        task({ started_at: "2026-11-01T10:00:00Z", estimated_finish_at: "2026-12-02T10:00:01Z" }),
      ).rejects.toThrow(/tasks_block_span/);
    });

    test("concluir antes do inicio planejado e valido", async () => {
      await task({ status: "done", started_at: "2026-11-15T10:00:00Z", finished_at: "2026-11-14T08:00:00Z" });
    });

    test("so o prazo, sem inicio, e valido", async () => {
      await task({ status: "todo", estimated_finish_at: "2026-11-20T23:00:00Z" });
    });

    test("os avisos ficam entre 1 minuto e 30 dias", async () => {
      await task({ started_at: "2026-11-14T10:00:00Z", notify_offsets_minutes: [10, 43200] });

      await expect(task({ notify_offsets_minutes: [0] })).rejects.toThrow(/tasks_notify_offsets_valid/);
      await expect(task({ notify_offsets_minutes: [43201] })).rejects.toThrow(/tasks_notify_offsets_valid/);
    });
  });

  describe("tasks: tarefa longa", () => {
    const long = (overrides: Row = {}) => task({ long_running: true, status: "doing", ...overrides });

    test("aceita meses de duracao e inicio real depois do prazo", async () => {
      await long({ started_at: "2026-11-01T10:00:00Z", estimated_finish_at: "2027-03-01T10:00:00Z" });
      await long({ started_at: "2026-11-20T10:00:00Z", estimated_finish_at: "2026-11-10T10:00:00Z" });
      await long();
    });

    test("e sempre de pessoa, com status, sem serie e nunca perdido", async () => {
      const series = await recurrence();

      await expect(agentTask({ long_running: true })).rejects.toThrow(/tasks_long_running_shape/);
      await expect(long({ status: null })).rejects.toThrow(/tasks_long_running_shape/);
      await expect(long({ status: "missed" })).rejects.toThrow(/tasks_long_running_shape/);
      await expect(long({ recurrence_id: series, occurrence_on: "2026-11-14" })).rejects.toThrow(
        /tasks_long_running_shape/,
      );
    });

    test("sem prazo nao tem aviso; com prazo tem", async () => {
      await long({ estimated_finish_at: "2026-12-20T10:00:00Z", notify_offsets_minutes: [1440] });

      await expect(long({ notify_offsets_minutes: [1440] })).rejects.toThrow(/tasks_long_running_notify/);
    });
  });

  describe("tasks: serie", () => {
    test("ocorrencia precisa do dia", async () => {
      const series = await recurrence();

      await expect(task({ recurrence_id: series })).rejects.toThrow(/tasks_occurrence_requires_day/);
    });

    test("uma ocorrencia por dia, e a apagada continua ocupando o dia", async () => {
      const series = await recurrence();
      await task({ recurrence_id: series, occurrence_on: "2026-11-14", deleted_at: "2026-11-14T12:00:00Z" });
      await task({ recurrence_id: series, occurrence_on: "2026-11-15" });

      await expect(task({ recurrence_id: series, occurrence_on: "2026-11-14" })).rejects.toThrow(
        /tasks_recurrence_occurrence_unique/,
      );
    });

    test("apagar a regra nao apaga as ocorrencias: so tira o vinculo", async () => {
      const series = await recurrence();
      const id = await task({ recurrence_id: series, occurrence_on: "2026-11-14" });

      await ctx.pool.query("DELETE FROM recurrences WHERE id = $1", [series]);

      const { rows } = await ctx.pool.query("SELECT recurrence_id, occurrence_on::text FROM tasks WHERE id = $1", [id]);
      expect(rows[0]).toEqual({ recurrence_id: null, occurrence_on: "2026-11-14" });
    });
  });

  describe("task_entries", () => {
    const entry = (taskId: string, overrides: Row) =>
      insert("task_entries", { id: ulid(), task_id: taskId, user_id: "user-1", ...overrides });

    test("aceita os cinco tipos", async () => {
      const request = await agentTask();

      await entry(request, { kind: "message", role: "user", content: "marca o treino" });
      await entry(request, { kind: "thought", content: "vou procurar o treino" });
      await entry(request, { kind: "trace", data: { ms: 420, code: "dispatch" } });
      await entry(request, { kind: "result", data: { taskId: "x" } });
      await entry(request, { kind: "input", content: "retrato da tarefa" });

      expect(await count("task_entries")).toBe(5);
    });

    test("role existe so em mensagem, e so user ou agent", async () => {
      const request = await agentTask();

      await expect(entry(request, { kind: "message", content: "sem role" })).rejects.toThrow(
        /task_entries_role_only_in_message/,
      );
      await expect(entry(request, { kind: "thought", role: "agent", content: "x" })).rejects.toThrow(
        /task_entries_role_only_in_message/,
      );
      await expect(entry(request, { kind: "message", role: "assistant", content: "x" })).rejects.toThrow(
        /task_entries_role_valid/,
      );
    });

    test("trace nao guarda texto", async () => {
      const request = await agentTask();

      await expect(entry(request, { kind: "trace", content: "texto do usuario" })).rejects.toThrow(
        /task_entries_trace_without_text/,
      );
    });

    test("apagar fisicamente a tarefa leva as entradas", async () => {
      const request = await agentTask();
      await entry(request, { kind: "message", role: "user", content: "oi" });

      await ctx.pool.query("DELETE FROM tasks WHERE id = $1", [request]);

      expect(await count("task_entries")).toBe(0);
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

  describe("relacoes entre tarefas", () => {
    const relate = (from: string, to: string, relation: string) =>
      insert("task_task_relation", { from_task_id: from, to_task_id: to, relation });

    test("uma tarefa tem uma so principal e pode ter varias subtarefas", async () => {
      const [first, second, shared, after, other] = [await task(), await task(), await task(), await task(), await task()];

      await relate(first, shared, "subtask");
      await relate(shared, after, "subtask");
      await relate(shared, other, "subtask");
      await expect(relate(second, shared, "subtask")).rejects.toThrow(/task_task_subtask_unique/);

      expect(await count("task_task_relation")).toBe(3);
    });

    test("o mesmo par pode ter relacoes de tipos diferentes, mas nao a mesma duas vezes", async () => {
      const [a, b] = [await task(), await task()];
      await relate(a, b, "subtask");
      await relate(a, b, "follow_up");

      await expect(relate(a, b, "subtask")).rejects.toThrow(/task_task_relation_.*_pk/);
    });

    test("uma tarefa nao se relaciona consigo mesmo, e o tipo e do conjunto", async () => {
      const [a, b] = [await task(), await task()];

      await expect(relate(a, a, "subtask")).rejects.toThrow(/task_task_not_self/);
      await expect(relate(a, b, "parent")).rejects.toThrow(/task_task_relation_valid/);
    });

    test("os tipos antigos precedes e blocks nao existem mais", async () => {
      const [a, b] = [await task(), await task()];

      await expect(relate(a, b, "precedes")).rejects.toThrow(/task_task_relation_valid/);
      await expect(relate(a, b, "blocks")).rejects.toThrow(/task_task_relation_valid/);
      for (const relation of ["generates", "updates", "deletes", "step", "subtask", "follow_up"]) {
        await relate(a, b, relation);
      }
      expect(await count("task_task_relation")).toBe(6);
    });

    test("cada continuacao tem um so primeiro pedido", async () => {
      const [first, other, followUp] = [await agentTask(), await agentTask(), await agentTask()];
      await relate(first, followUp, "follow_up");

      await expect(relate(other, followUp, "follow_up")).rejects.toThrow(/task_task_follow_up_unique/);
    });

    test("apagar fisicamente uma ponta leva a relacao, e nao a outra ponta", async () => {
      const [project, session] = [await task(), await task()];
      await relate(project, session, "subtask");

      await ctx.pool.query("DELETE FROM tasks WHERE id = $1", [project]);

      expect(await count("task_task_relation")).toBe(0);
      expect(await count("tasks")).toBe(1);
    });
  });

  describe("relacoes entre tarefa e artefato", () => {
    const link = (taskId: string, artifactId: string, overrides: Row = {}) =>
      insert("task_artifact_relation", { task_id: taskId, artifact_id: artifactId, relation: "uses", ...overrides });

    test("uma linha por par", async () => {
      const [meal, food] = [await task({ kind: "meal" }), await artifact({ type: "food" })];
      await link(meal, food, { relation: "creates", position: 0 });

      await expect(link(meal, food, { relation: "uses", position: 1 })).rejects.toThrow(
        /task_artifact_relation_.*_pk/,
      );
    });

    test("a posicao e unica na tarefa, mas a relacao de um passo nao tem posicao", async () => {
      const [meal, step] = [await task({ kind: "meal" }), await agentTask({ kind: "step" })];
      const [a, b, c] = [await artifact(), await artifact(), await artifact()];
      await link(meal, a, { position: 0 });
      await link(step, a, { relation: "updates" });
      await link(step, b, { relation: "creates" });

      await expect(link(meal, c, { position: 0 })).rejects.toThrow(/task_artifact_task_position_unique/);
      await expect(link(meal, c, { position: -1 })).rejects.toThrow(/task_artifact_position_nonneg/);
    });

    test("reordenar com position + 1 nao colide no meio do UPDATE", async () => {
      const meal = await task({ kind: "meal" });
      const [a, b] = [await artifact(), await artifact()];
      await link(meal, a, { position: 0 });
      await link(meal, b, { position: 1 });

      await ctx.pool.query("UPDATE task_artifact_relation SET position = position + 1 WHERE task_id = $1", [meal]);

      const { rows } = await ctx.pool.query(
        "SELECT artifact_id, position FROM task_artifact_relation WHERE task_id = $1 ORDER BY position",
        [meal],
      );
      expect(rows).toEqual([
        { artifact_id: a, position: 1 },
        { artifact_id: b, position: 2 },
      ]);
    });

    test("o tipo e do conjunto", async () => {
      const [meal, food] = [await task({ kind: "meal" }), await artifact({ type: "food" })];

      await expect(link(meal, food, { relation: "derives" })).rejects.toThrow(/task_artifact_relation_valid/);
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
      const step = await agentTask({ kind: "step" });
      await job({ task_id: step });

      await ctx.pool.query("DELETE FROM tasks WHERE id = $1", [step]);

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
        SELECT id FROM tasks
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND NOT long_running AND kind NOT IN ('step', 'save_content', 'save_content_with_transcription')
          AND started_at <= '2026-11-21T03:00:00Z'
          AND started_at >= timestamptz '2026-11-14T03:00:00Z' - interval '31 days'
          AND coalesce(estimated_finish_at, finished_at, started_at) >= '2026-11-14T03:00:00Z'
        ORDER BY started_at, id`);

      expect(plan).toContain("tasks_agenda_idx");
    });

    test("sem o filtro de passos a consulta nao casa com o indice da agenda", async () => {
      const plan = await planOf(`
        SELECT id FROM tasks
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND NOT long_running
          AND started_at BETWEEN '2026-11-14T03:00:00Z' AND '2026-11-21T03:00:00Z'
        ORDER BY started_at, id`);

      expect(plan).not.toContain("tasks_agenda_idx");
    });

    test("agenda so de pessoa", async () => {
      const plan = await planOf(`
        SELECT id FROM tasks
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND NOT long_running AND kind NOT IN ('step', 'save_content', 'save_content_with_transcription')
          AND actor = 'human' AND started_at BETWEEN '2026-11-14T03:00:00Z' AND '2026-11-21T03:00:00Z'
        ORDER BY started_at, id`);

      expect(plan).toContain("tasks_agenda_idx");
    });

    test("lista de tarefas por status e data", async () => {
      const plan = await planOf(`
        SELECT id FROM tasks
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND kind <> 'step' AND status = 'todo'
        ORDER BY coalesce(started_at, estimated_finish_at), id LIMIT 50`);

      expect(plan).toContain("tasks_tracked_idx");
    });

    test("lista de pedidos", async () => {
      const plan = await planOf(`
        SELECT id FROM tasks
        WHERE user_id = 'user-1' AND deleted_at IS NULL AND actor = 'agent' AND kind <> 'step'
        ORDER BY id DESC LIMIT 50`);

      expect(plan).toContain("tasks_requests_idx");
    });

    test("todos as tarefas vivas de pessoa", async () => {
      const plan = await planOf(
        "SELECT id FROM tasks WHERE user_id = 'user-1' AND deleted_at IS NULL AND actor = 'human'",
      );

      expect(plan).toContain("tasks_user_live_idx");
    });

    test("entradas de uma tarefa, em ordem e a partir da ultima lida", async () => {
      const plan = await planOf(`
        SELECT id FROM task_entries
        WHERE task_id = '01JCZ0000000000000000000AA' AND id > '01JCZ0000000000000000000AB' ORDER BY id`);

      expect(plan).toContain("task_entries_task_idx");
    });

    test("relacoes para uma tarefa, por tipo", async () => {
      const plan = await planOf(`
        SELECT from_task_id FROM task_task_relation
        WHERE to_task_id = '01JCZ0000000000000000000AA' AND relation = 'step'`);

      expect(plan).toContain("task_task_reverse_idx");
    });

    test("em quais tarefas um artefato aparece", async () => {
      const plan = await planOf(
        "SELECT task_id FROM task_artifact_relation WHERE artifact_id = '01JCZ0000000000000000000AA'",
      );

      expect(plan).toContain("task_artifact_reverse_idx");
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
