import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Event, EntityBatchConflictError, Note, Recurrence, Task } from "../../../domain";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresDatabase } from "../database/postgres-database";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresAiJobStore } from "../ai-jobs/postgres-ai-job.store";
import { PostgresAiProcessStore } from "../ai-processes/postgres-ai-process.store";
import { PostgresProcessCandidateQuery } from "../ai-processes/postgres-process-candidate.query";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresNoteRepository } from "../notes/repositories/postgres-note.repository";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";

describe("rota por processo no Postgres", () => {
  let ctx: PostgresTestContext;
  let database: PostgresDatabase;
  let processes: PostgresAiProcessStore;
  let writer: PostgresEntityBatchWriter;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    database = new PostgresDatabase(ctx.pool);
    processes = new PostgresAiProcessStore(database);
    writer = new PostgresEntityBatchWriter(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.pool.query("TRUNCATE ai_process_entities, ai_process_steps, ai_processes, ai_job_outbox, ai_jobs CASCADE");
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  const start = (id: string, userId = "user-1") =>
    processes.start({ id, userId, actorId: userId, prompt: "pedido" });

  const jobsOf = async (kind?: string) =>
    (await ctx.pool.query(
      `SELECT id,kind,status,payload FROM ai_jobs ${kind ? "WHERE kind=$1" : ""} ORDER BY created_at, id`,
      kind ? [kind] : [],
    )).rows as Array<{ id: string; kind: string; status: string; payload: Record<string, string> }>;

  function newEvent(userId = "user-1") {
    return Event.create({
      userId, name: "Refeição", description: "", startedAt: new Date("2026-10-25T15:00:00Z"),
      tags: [], interruptions: [], kind: "meal", noteLinks: [],
    });
  }

  test("o processo nasce com o despacho enfileirado, na mesma transacao", async () => {
    await start("p1");

    expect((await processes.find("p1"))?.status).toBe("dispatching");
    expect(await jobsOf("process-dispatch")).toHaveLength(1);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM ai_job_outbox")).rows[0].n).toBe(1);
  });

  test("os passos entram todos de uma vez, cada um na sua fila, e o processo passa a running", async () => {
    await start("p1");
    await processes.beginSteps("p1", [
      { id: "s1", agent: "event-create", expected: "many" },
      { id: "s2", agent: "note-create", expected: "one" },
    ], { fallbackReason: undefined });

    expect((await jobsOf()).map((job) => job.kind)).toEqual(["process-dispatch", "process-event-create", "process-note-create"]);
    expect((await processes.steps("p1")).map((step) => [step.id, step.status, step.expected])).toEqual([
      ["s1", "pending", "many"], ["s2", "pending", "one"],
    ]);
    expect((await processes.find("p1"))?.status).toBe("running");
  });

  test("entidade, passo concluido e finalizacao existem juntos: o afterWrite e atomico com o lote", async () => {
    await start("p1");
    await processes.beginSteps("p1", [{ id: "s1", agent: "event-create", expected: "one" }], {});
    const event = newEvent();

    await writer.commit({
      userId: "user-1", events: [{ op: "create", entity: event }], tasks: [], notes: [],
      afterWrite: (tx) => processes.recordStepSuccess(tx, {
        processId: "p1", stepId: "s1", timings: { total: 10 },
        entities: [{ kind: "event", id: event.id, operation: "create", summary: { name: "Refeição", eventKind: "meal" } }],
      }),
    });

    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM events")).rows[0].n).toBe(1);
    expect((await processes.steps("p1"))[0].status).toBe("succeeded");
    expect(await processes.entities("p1")).toMatchObject([{ id: event.id, kind: "event", finalized: false, stepId: "s1" }]);
    expect((await jobsOf("process-finalize")).map((job) => job.payload)).toEqual([{ processId: "p1", stepId: "s1" }]);
  });

  test("se o lote falha, nada do passo fica: sem entidade, sem passo concluido, sem finalizacao", async () => {
    await start("p1");
    await processes.beginSteps("p1", [{ id: "s1", agent: "event-create", expected: "one" }], {});
    const event = newEvent();

    await expect(writer.commit({
      userId: "user-1",
      // Revisao que nao existe: o lote inteiro volta.
      events: [{ op: "update", entity: event, expectedRevision: 7 }], tasks: [], notes: [],
      afterWrite: (tx) => processes.recordStepSuccess(tx, {
        processId: "p1", stepId: "s1", timings: {},
        entities: [{ kind: "event", id: event.id, operation: "create", summary: { name: "x" } }],
      }),
    })).rejects.toBeInstanceOf(EntityBatchConflictError);

    expect((await processes.steps("p1"))[0].status).toBe("pending");
    expect(await processes.entities("p1")).toEqual([]);
    expect(await jobsOf("process-finalize")).toEqual([]);
  });

  test("passo que falha enfileira a finalizacao com o codigo registrado", async () => {
    await start("p1");
    await processes.beginSteps("p1", [{ id: "s1", agent: "event-create", expected: "one" }], {});
    await processes.failStep({ processId: "p1", stepId: "s1", errorCode: "agent_timeout" });
    await processes.failStep({ processId: "p1", stepId: "s1", errorCode: "agent_timeout" });

    expect((await processes.steps("p1"))[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    // Repetir a falha nao duplica a finalizacao (dedupe por passo).
    expect(await jobsOf("process-finalize")).toHaveLength(1);
  });

  test("finalizar a entidade acrescenta os vinculos e encerra o processo uma vez", async () => {
    await start("p1");
    await processes.beginSteps("p1", [{ id: "s1", agent: "note-create", expected: "one" }], {});
    await processes.recordStepSuccess(undefined, {
      processId: "p1", stepId: "s1", timings: {},
      entities: [{ kind: "note", id: "n1", operation: "create", summary: { name: "Nota" } }],
    });
    const link = { from: { kind: "note" as const, id: "n1" }, to: { kind: "event" as const, id: "e1" } };

    await processes.markFinalized(undefined, "p1", { kind: "note", id: "n1" }, [link]);
    await processes.finish("p1", "completed", { failedSteps: [] });
    await processes.finish("p1", "failed", { failedSteps: [{ agent: "note-create", errorCode: "x" }] });

    expect(await processes.entities("p1")).toMatchObject([{ id: "n1", finalized: true, links: [link] }]);
    expect(await processes.find("p1")).toMatchObject({ status: "completed", response: { failedSteps: [] } });
  });
});

describe("lock da fila de finalizacao", () => {
  let ctx: PostgresTestContext;
  let database: PostgresDatabase;
  let processes: PostgresAiProcessStore;
  let jobs: PostgresAiJobStore;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    database = new PostgresDatabase(ctx.pool);
    processes = new PostgresAiProcessStore(database);
    jobs = new PostgresAiJobStore(database, 60_000, 3);
  }, 60000);

  afterAll(async () => {
    await ctx?.stop();
  });

  async function finalizeJobs(processId: string, steps: string[]): Promise<string[]> {
    await processes.start({ id: processId, userId: "user-1", actorId: "user-1", prompt: "pedido" });
    await processes.beginSteps(processId, steps.map((id) => ({ id, agent: "note-create" as const, expected: "one" as const })), {});
    for (const id of steps) await processes.failStep({ processId, stepId: id, errorCode: "x" });
    return (await ctx.pool.query(
      "SELECT id FROM ai_jobs WHERE kind='process-finalize' AND payload->>'processId'=$1 ORDER BY created_at, id", [processId],
    )).rows.map((row) => row.id as string);
  }

  test("duas finalizacoes do mesmo processo nunca rodam juntas, e vao na ordem de chegada", async () => {
    const [first, second] = await finalizeJobs("lock-a", ["a1", "a2"]);

    // Disputa simultanea pelo claim: so uma vence.
    const claims = await Promise.all([jobs.claim(second), jobs.claim(first)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.id).toBe(first);
    expect(await jobs.claim(second)).toBeUndefined();

    // Concluida a primeira, a segunda pode rodar.
    await ctx.pool.query("UPDATE ai_jobs SET status='succeeded',lease_until=NULL WHERE id=$1", [first]);
    expect((await jobs.claim(second))?.id).toBe(second);
  });

  test("processos diferentes finalizam em paralelo", async () => {
    const [b] = await finalizeJobs("lock-b", ["b1"]);
    const [c] = await finalizeJobs("lock-c", ["c1"]);
    const claims = await Promise.all([jobs.claim(b), jobs.claim(c)]);
    expect(claims.map((job) => job?.id)).toEqual([b, c]);
  });

  test("os jobs do processo nao aparecem na lista de jobs do usuario", async () => {
    await finalizeJobs("lock-d", ["d1"]);
    expect((await jobs.list("user-1")).filter((job) => job.kind.startsWith("process-"))).toEqual([]);
  });
});

describe("candidatos de edicao no Postgres", () => {
  let ctx: PostgresTestContext;
  let candidates: PostgresProcessCandidateQuery;
  const NOW = new Date("2026-10-25T15:00:00Z");

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    candidates = new PostgresProcessCandidateQuery(new PostgresDatabase(ctx.pool));
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function event(userId: string, name: string, startedAt: string, finishedAt?: string) {
    const entity = Event.create({
      userId, name, description: "", startedAt: new Date(startedAt), finishedAt: finishedAt ? new Date(finishedAt) : undefined,
      tags: [], interruptions: [], kind: "routine", noteLinks: [],
    });
    await new PostgresEventRepository(ctx.db).save(entity);
    return entity;
  }

  test("eventos de ontem, hoje e amanha do usuario, e nao os de outros dias nem os de outros usuarios", async () => {
    await event("user-1", "Anteontem", "2026-10-23T15:00:00Z");
    await event("user-1", "Ontem", "2026-10-24T15:00:00Z");
    await event("user-1", "Hoje", "2026-10-25T12:00:00Z", "2026-10-25T13:00:00Z");
    await event("user-1", "Amanhã", "2026-10-26T15:00:00Z");
    await event("user-1", "Depois de amanhã", "2026-10-27T15:00:00Z");
    await event("user-2", "De outro usuário", "2026-10-25T12:00:00Z");

    const found = await candidates.shortlist({ userId: "user-1", now: NOW, kinds: ["event"] });

    expect(found.map((candidate) => candidate.name)).toEqual(["Ontem", "Hoje", "Amanhã"]);
    expect(found[1]).toMatchObject({ kind: "event", eventKind: "routine", finishedAt: "2026-10-25T13:00:00.000Z" });
  });

  test("series: a cadencia vem em texto e o alvo diz o que a serie gera", async () => {
    const rule = { frequency: "weekly" as const, interval: 1, byWeekday: 1 << 1, timeOfDay: "07:00", timeZone: "America/Sao_Paulo", startsOn: "2026-10-26" };
    const series = Recurrence.create({
      userId: "user-1", target: "event", rule, template: { kind: "training", name: "Corrida", description: "", tags: [], priority: "normal" },
    });
    await new PostgresRecurrenceRepository(ctx.db).save(series);

    const found = await candidates.shortlist({ userId: "user-1", now: NOW, kinds: ["recurrence"] });

    expect(found).toMatchObject([{ kind: "recurrence", target: "event", name: "Corrida" }]);
    expect(found[0].cadence).toMatch(/segunda/i);
    expect(await candidates.shortlist({ userId: "user-2", now: NOW, kinds: ["recurrence"] })).toEqual([]);
  });

  test("tarefas em aberto e notas recentes; so os tipos pedidos", async () => {
    const tasks = new PostgresTaskRepository(ctx.db);
    await tasks.save(Task.create({ userId: "user-1", name: "Aberta", description: "", tags: [] }));
    await tasks.save(Task.create({ userId: "user-1", name: "Feita", description: "", tags: [], status: "done" }));
    await new PostgresNoteRepository(ctx.db).save(Note.create({ userId: "user-1", name: "Ideia", data: { body: "Visão semanal" } }));

    const onlyTasks = await candidates.shortlist({ userId: "user-1", now: NOW, kinds: ["task"] });
    expect(onlyTasks.map((candidate) => candidate.name)).toEqual(["Aberta"]);

    const notes = await candidates.shortlist({ userId: "user-1", now: NOW, kinds: ["note"] });
    expect(notes).toMatchObject([{ kind: "note", name: "Ideia", noteType: "text", text: "Visão semanal" }]);
    expect(await candidates.shortlist({ userId: "user-2", now: NOW, kinds: ["task", "note", "event"] })).toEqual([]);
  });
});
