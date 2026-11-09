import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { Event, Note } from "../../domain";
import { PostgresProcessCandidateQuery } from "../../infrastructure/persistence/ai-processes/postgres-process-candidate.query";
import { StubMealParsingGateway } from "../events/testing/stub-meal-parsing.gateway";
import { InMemoryWorkoutCatalog } from "../events/testing/in-memory-workout.catalog";
import { CreateEventUseCase } from "../events/create-event.usecase";
import { NoteBuilder } from "../notes/services/note-builder.service";
import { getAiJobsEnv } from "../../config/env";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { PostgresAiJobStore } from "../../infrastructure/persistence/ai-jobs/postgres-ai-job.store";
import { PostgresAiProcessStore } from "../../infrastructure/persistence/ai-processes/postgres-ai-process.store";
import { PostgresScopedSqlQuery } from "../../infrastructure/persistence/agent-sql/postgres-scoped-sql.query";
import { PostgresEntityBatchWriter } from "../../infrastructure/persistence/agent-batch/postgres-entity-batch-writer";
import { PostgresDatabase } from "../../infrastructure/persistence/database/postgres-database";
import { PostgresEventRepository } from "../../infrastructure/persistence/events/repositories/postgres-event.repository";
import { PostgresNoteRepository } from "../../infrastructure/persistence/notes/repositories/postgres-note.repository";
import { PostgresRecurrenceRepository } from "../../infrastructure/persistence/recurrences/repositories/postgres-recurrence.repository";
import { PostgresTaskRepository } from "../../infrastructure/persistence/tasks/repositories/postgres-task.repository";
import { createPostgresTestContext, type PostgresTestContext } from "../../infrastructure/persistence/testing/postgres-test-context";
import { ProcessAgentRunner } from "./process-agent-runner";
import { ProcessDispatcher } from "./process-dispatcher";
import { ProcessEditWorker } from "./process-edit-worker";
import { ProcessEditTargetWorker } from "./process-edit-target-worker";
import { ProcessTargetEditWorker } from "./process-target-edit-worker";
import { ProcessFallback } from "./process-fallback";
import { ProcessQueryWorker } from "./process-query-worker";
import { ProcessFinalizer } from "./process-finalizer";
import { ProcessOperations } from "./process-operations";
import { ProcessStepWorker } from "./process-step-worker";
import { dispatchConfig, uiConfig } from "./process-config";
import { confident, FakeAgentFiles, result, scriptedJev, ScriptedStructuredGateway } from "./testing/process-test-kit";

let ctx: PostgresTestContext;
let service: AiJobsService;
let operations: ProcessOperations;
let scenario: "guide" | "edit" | "query" | "fallback" | "series-create" | "series-edit" | "fail" = "guide";
let events: PostgresEventRepository;
const gateway = new ScriptedStructuredGateway();
const files = new FakeAgentFiles(new Map([["hermes/skills/cafe/SKILL.md", "---\nname: cafe\n---\n# Café"]]));
const actor = { userId: "user-1" };

const iso = (hour: number) => `2026-10-25T${String(hour).padStart(2, "0")}:00:00-03:00`;
const event = (name: string, kind: string, hour: number) =>
  ({ name, kind, startedAt: iso(hour), finishedAt: null, description: null, tags: [] });

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  const database = new PostgresDatabase(ctx.pool);
  service = new AiJobsService(new PostgresAiJobStore(database, 60_000, 3), getAiJobsEnv({
    RABBITMQ_URL: "amqp://unused", AI_JOBS_QUEUE_PREFIX: "process-flow", AI_JOBS_LEASE_MS: "60000", AI_JOBS_MAX_ATTEMPTS: "3",
  }));
  events = new PostgresEventRepository(ctx.db);
  const repositories = {
    events,
    tasks: new PostgresTaskRepository(ctx.db),
    notes: new PostgresNoteRepository(ctx.db),
    recurrences: new PostgresRecurrenceRepository(ctx.db),
  };
  const noteBuilder = new NoteBuilder(new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }), new InMemoryWorkoutCatalog());
  const createEvent = new CreateEventUseCase(
    repositories.events, repositories.notes,
    noteBuilder,
    () => new Date("2026-10-25T15:00:00Z"),
  );
  const store = new PostgresAiProcessStore(database);
  const sql = new PostgresScopedSqlQuery(ctx.pool);
  const batchWriter = new PostgresEntityBatchWriter(ctx.db);
  const runner = new ProcessAgentRunner(gateway);

  // O JEV de entrada reconhece o exemplo-guia; o de vinculo escolhe a refeicao para a nota.
  const jev = scriptedJev((questions) => {
    if ("link" in questions) {
      const criteria = (questions.link as { criteria: Record<string, string> }).criteria;
      const meal = Object.entries(criteria).find(([, text]) => text.includes("Refeição"));
      return result({ link: confident(meal?.[0] ?? "none") });
    }
    // Segunda etapa do despacho: o JEV escolhe, dentre os candidatos listados, o evento pedido.
    if ("c1" in questions) {
      const picked: Record<string, ReturnType<typeof confident>> = {};
      for (const [name, question] of Object.entries(questions as Record<string, { instructions: string }>)) {
        picked[name] = confident(/Reunião|Corrida/.test(question.instructions) ? "edit" : "keep");
      }
      return result(picked);
    }
    const answers: Record<string, ReturnType<typeof confident>> = {};
    for (const name of Object.keys(dispatchConfig.questions)) answers[name] = confident(name === "query" ? "no" : "none");
    if (scenario === "guide") {
      answers.event_create = confident("many");
      answers.note_create = confident("one");
    } else if (scenario === "edit") {
      answers.event_edit = confident("one");
    } else if (scenario === "query") {
      answers.query = confident("yes");
    } else if (scenario === "series-create") {
      answers.recurring_event_create = confident("one");
    } else if (scenario === "series-edit") {
      answers.recurring_event_edit = confident("one");
    } else if (scenario === "fail") {
      answers.event_create = confident("one");
      answers.note_create = confident("one");
    }
    // "fallback": todas as respostas "nenhum" mandam o pedido ao fallback.
    return result(answers);
  });

  operations = new ProcessOperations(
    service, store, new ProcessDispatcher(store, jev.client, new PostgresProcessCandidateQuery(database)),
    new ProcessStepWorker({ store, runner, batchWriter, repositories, createEvent }),
    new ProcessEditWorker({ store, runner, batchWriter, repositories, createEvent, sql }),
    new ProcessQueryWorker({ store, runner, sql }),
    new ProcessFinalizer({ store, jev: jev.client, batchWriter, repositories, createEvent, runner }),
    new ProcessFallback({ store, runner }),
    new ProcessEditTargetWorker({ store, repositories, files, failureText: (code) => uiConfig.targetFailed[code] }),
    new ProcessTargetEditWorker({
      store, runner, batchWriter, repositories, createEvent, noteBuilder, files,
      mealParsing: new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    }),
  );
  operations.onModuleInit();
}, 60000);

beforeEach(async () => {
  await ctx.reset();
  await ctx.pool.query("TRUNCATE ai_process_entities, ai_process_steps, ai_processes, ai_job_outbox, ai_jobs CASCADE");
  gateway.outputs.clear();
  scenario = "guide";
});

afterEach(() => {
  vi.unstubAllEnvs();
  files.written.length = 0;
});

afterAll(async () => {
  await ctx?.stop();
});

/** Entrega os jobs do processo, um a um, como o consumidor das filas faria. */
async function drain(): Promise<string[]> {
  const ran: string[] = [];
  for (let round = 0; round < 20; round += 1) {
    const { rows } = await ctx.pool.query(
      "SELECT id,kind FROM ai_jobs WHERE status='queued' AND kind LIKE 'process-%' ORDER BY created_at, id LIMIT 1");
    if (rows.length === 0) return ran;
    await service.consume(rows[0].id, rows[0].kind);
    ran.push(rows[0].kind);
  }
  throw new Error("fila nao esvaziou");
}

test("o exemplo-guia ponta a ponta: despacho, passos nas suas filas, finalizacao com vinculo, processo fechado", async () => {
  gateway.outputs.set("event_create", { events: [
    event("Refeição", "meal", 12), event("Nadar na praia", "training", 13), event("Voltar para casa", "routine", 15),
  ] });
  gateway.outputs.set("note_create", { notes: [
    { type: "meal", name: "Arroz e feijão", content: "300g de arroz, 200g de feijão" },
  ] });

  const processId = await operations.start({
    userId: "user-1",
    text: "comendo 300g de arroz com 200g de feijão, depois vou nadar na praia e depois de 2 horas volto para casa",
  }, actor);
  const ran = await drain();

  expect(ran[0]).toBe("process-dispatch");
  expect(ran.filter((kind) => kind === "process-event-create")).toHaveLength(1);
  expect(ran.filter((kind) => kind === "process-note-create")).toHaveLength(1);
  expect(ran.filter((kind) => kind === "process-finalize")).toHaveLength(2);

  const rows = (await ctx.pool.query("SELECT id,name FROM events ORDER BY started_at")).rows;
  expect(rows.map((row) => row.name)).toEqual(["Refeição", "Nadar na praia", "Voltar para casa"]);
  // Nenhuma nota nasceu junto de um evento; a nota de refeicao veio da fila de notas.
  const notes = (await ctx.pool.query("SELECT id,type FROM notes")).rows;
  expect(notes).toHaveLength(1);
  expect(notes[0].type).toBe("meal");
  const links = (await ctx.pool.query("SELECT event_id,note_id FROM event_notes")).rows;
  expect(links).toEqual([{ event_id: rows[0].id, note_id: notes[0].id }]);

  const view = await operations.view(processId, actor);
  expect(view).toMatchObject({ status: "completed", title: "Realizando processos:", message: undefined });
  expect(view.steps.map((step) => [step.label, step.status])).toEqual([
    ["Criando eventos", "succeeded"], ["Criando notas", "succeeded"],
  ]);
  expect(view.entities.find((entity) => entity.kind === "note")?.linkedTo).toEqual([{ kind: "event", id: rows[0].id }]);

  // Todos os jobs do processo terminaram com sucesso.
  const open = await ctx.pool.query("SELECT kind,status FROM ai_jobs WHERE kind LIKE 'process-%' AND status<>'succeeded'");
  expect(open.rows).toEqual([]);
}, 60000);

test("outro usuario nao enxerga o processo", async () => {
  const processId = await operations.start({ userId: "user-1", text: "algo" }, actor);
  await expect(operations.view(processId, { userId: "user-2" })).rejects.toThrow(/not found/i);
  await expect(operations.start({ userId: "user-2", text: "x" }, actor)).rejects.toThrow(/permiss/i);
});

test("editar: o servidor lista os candidatos, o JEV escolhe o evento e o agente altera so o fim dele", async () => {
  scenario = "edit";
  const meeting = Event.create({
    userId: "user-1", name: "Reunião", description: "", startedAt: new Date(Date.now() - 60 * 60 * 1000),
    tags: [], interruptions: [], kind: "routine", noteLinks: [],
  });
  const lunch = Event.create({
    userId: "user-1", name: "Almoço", description: "", startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    tags: [], interruptions: [], kind: "meal", noteLinks: [],
  });
  await events.save(meeting);
  await events.save(lunch);
  const finishedAt = new Date().toISOString();
  gateway.outputs.set("event_edit", { edits: [{
    id: meeting.id, name: null, kind: null, startedAt: null, finishedAt, description: null, tags: null,
  }], query: null });

  const processId = await operations.start({ userId: "user-1", text: "terminei a reunião" }, actor);
  const ran = await drain();

  expect(ran).toEqual(["process-dispatch", "process-event-edit", "process-finalize"]);
  // So a reunião foi revisada; o almoço, que o JEV não escolheu, continua na revisão 1.
  const stored = (await ctx.pool.query("SELECT name,revision,finished_at FROM events ORDER BY started_at")).rows;
  expect(stored.map((row) => [row.name, row.revision])).toEqual([["Almoço", 1], ["Reunião", 2]]);
  expect(new Date(stored[1].finished_at).toISOString()).toBe(finishedAt);
  // O agente so viu o candidato escolhido pelo JEV.
  expect(gateway.calls.find((call) => call.schemaName === "event_edit")?.user).toContain(meeting.id);
  expect(gateway.calls.find((call) => call.schemaName === "event_edit")?.user).not.toContain(lunch.id);

  const view = await operations.view(processId, actor);
  expect(view).toMatchObject({ status: "completed" });
  expect(view.steps.map((step) => [step.label, step.status])).toEqual([["Editando eventos", "succeeded"]]);
  expect(view.entities).toMatchObject([{ kind: "event", name: "Reunião", operation: "update" }]);
}, 60000);

test("consultar: uma unica consulta de leitura, executada no escopo do usuario, com as linhas no passo", async () => {
  scenario = "query";
  await events.save(Event.create({
    userId: "user-1", name: "Corrida", description: "", startedAt: new Date(), tags: [], interruptions: [],
    kind: "training", noteLinks: [],
  }));
  await events.save(Event.create({
    userId: "user-2", name: "Segredo de outro usuário", description: "", startedAt: new Date(), tags: [],
    interruptions: [], kind: "routine", noteLinks: [],
  }));
  gateway.outputs.set("query", { sql: "SELECT name FROM events ORDER BY started_at" });

  const processId = await operations.start({ userId: "user-1", text: "o que tenho hoje?" }, actor);
  const ran = await drain();

  expect(ran).toEqual(["process-dispatch", "process-query", "process-finalize"]);
  const view = await operations.view(processId, actor);
  expect(view.status).toBe("completed");
  expect(view.steps[0]).toMatchObject({ label: "Consultando dados", status: "succeeded", result: { columns: ["name"], rows: [["Corrida"]] } });
}, 60000);

test("fallback: o pedido nao reconhecido e orquestrado em especialistas, que rodam e fecham o processo", async () => {
  scenario = "fallback";
  gateway.outputs.set("fallback", { reply: null, invoke: [{ agent: "event-create", instruction: "Criar o evento do almoço" }] });
  gateway.outputs.set("event_create", { events: [event("Almoço", "meal", 12)] });

  const processId = await operations.start({ userId: "user-1", text: "almocei agorinha" }, actor);
  const ran = await drain();

  expect(ran).toEqual(["process-dispatch", "process-fallback", "process-event-create", "process-finalize"]);
  expect((await ctx.pool.query("SELECT name FROM events")).rows).toEqual([{ name: "Almoço" }]);
  const view = await operations.view(processId, actor);
  expect(view.status).toBe("completed");
  expect(view.steps.map((step) => [step.label, step.status])).toEqual([
    ["Analisando o pedido", "succeeded"], ["Criando eventos", "succeeded"],
  ]);
}, 60000);

test("fallback que so responde: pedido sem relacao com os dados", async () => {
  scenario = "fallback";
  gateway.outputs.set("fallback", { reply: "Paris.", invoke: null });
  const processId = await operations.start({ userId: "user-1", text: "qual a capital da França?" }, actor);
  await drain();
  expect(await operations.view(processId, actor)).toMatchObject({ status: "completed", message: "Paris." });
}, 60000);

test("series: criar sem nenhuma nota e depois editar so a hora, de hoje em diante", async () => {
  scenario = "series-create";
  gateway.outputs.set("recurring_event_create", { series: [{
    name: "Corrida", kind: "training", description: null, tags: [], frequency: "daily", interval: null, weekdays: null,
    monthDay: null, month: null, timeOfDay: "07:00", durationMinutes: 60, startsOn: null, endsOn: null,
  }] });
  const created = await operations.start({ userId: "user-1", text: "corrida todo dia às 7h" }, actor);
  expect(await drain()).toEqual(["process-dispatch", "process-recurring-event-create", "process-finalize"]);
  expect((await operations.view(created, actor)).status).toBe("completed");
  const series = (await ctx.pool.query("SELECT id,time_of_day,freq FROM recurrences")).rows;
  expect(series).toHaveLength(1);
  expect(series[0]).toMatchObject({ freq: "daily" });
  expect((await ctx.pool.query("SELECT count(*)::int AS n FROM notes")).rows[0].n).toBe(0);
  expect((await ctx.pool.query("SELECT count(*)::int AS n FROM events WHERE recurrence_id=$1", [series[0].id])).rows[0].n).toBeGreaterThan(0);

  scenario = "series-edit";
  gateway.outputs.set("recurring_event_edit", { edits: [{
    id: String(series[0].id).trim(), name: null, description: null, tags: null, frequency: null, interval: null,
    weekdays: null, monthDay: null, month: null, timeOfDay: "08:00", durationMinutes: null, startsOn: null, endsOn: null,
  }], query: null });
  const edited = await operations.start({ userId: "user-1", text: "mude a corrida para as 8h" }, actor);
  const ran = await drain();

  expect(ran).toEqual(["process-dispatch", "process-recurring-event-edit", "process-finalize"]);
  const view = await operations.view(edited, actor);
  expect(view).toMatchObject({ status: "completed" });
  expect(view.steps.map((step) => [step.label, step.status])).toEqual([["Editando eventos recorrentes", "succeeded"]]);
  expect((await ctx.pool.query("SELECT time_of_day,revision FROM recurrences")).rows).toEqual([{ time_of_day: "08:00:00", revision: 2 }]);
}, 60000);

test("falha: a explicacao do agente substitui a linha predefinida, so quando algum passo falhou", async () => {
  scenario = "fail";
  gateway.outputs.set("event_create", { events: [event("Almoço", "meal", 12)] });
  // Sem saida para a nota: o passo de notas falha.
  gateway.outputs.set("failure_explainer", { message: "Criei o evento, mas não consegui criar a nota." });

  const processId = await operations.start({ userId: "user-1", text: "almocei e anota o que comi" }, actor);
  await drain();

  const view = await operations.view(processId, actor);
  expect(view.status).toBe("completed");
  expect(view.steps.map((step) => [step.label, step.status])).toEqual([
    ["Criando eventos", "succeeded"], ["Criando notas", "failed"],
  ]);
  expect(view.message).toBe("Criei o evento, mas não consegui criar a nota.");
}, 60000);

test("edicao pela tela de detalhe: o worker escolhe o agente pelo tipo e o agente altera so o alvo (Postgres)", async () => {
  const notes = new PostgresNoteRepository(ctx.db);
  const sleep = Note.create({ userId: "user-1", name: "Sono", type: "sleep", data: { trackedSleepTime: 400, score: 70 }, tags: [] });
  const other = Note.create({ userId: "user-1", name: "Outro", type: "sleep", data: { trackedSleepTime: 300, score: 50 }, tags: [] });
  await notes.save(sleep);
  await notes.save(other);
  gateway.outputs.set("sleep_note_edit", { edits: [{ id: sleep.id, name: null, trackedSleepTime: 480, score: null, tags: null }] });

  const processId = await operations.startEdit(
    { userId: "user-1", text: "dormi 8h", entityType: "sleep_note", entityId: sleep.id }, actor);
  const ran = await drain();

  expect(ran).toEqual(["process-edit-target", "process-sleep-note-edit", "process-finalize"]);
  const stored = (await ctx.pool.query("SELECT name,revision,data FROM notes ORDER BY name")).rows;
  expect(stored.map((row) => [row.name, row.revision, row.data])).toEqual([
    ["Outro", 1, { trackedSleepTime: 300, score: 50 }],
    ["Sono", 2, { trackedSleepTime: 480, score: 70 }],
  ]);
  const view = await operations.view(processId, actor);
  expect(view).toMatchObject({ status: "completed", entities: [{ kind: "note", id: sleep.id, operation: "update" }] });
  expect(view.steps.map((step) => [step.label, step.status])).toEqual([["Editando a nota de sono", "succeeded"]]);
  expect((await ctx.pool.query("SELECT kind,status FROM ai_jobs WHERE kind LIKE 'process-%' AND status<>'succeeded'")).rows).toEqual([]);
}, 60000);

test("edicao de skill: o arquivo muda, o job termina e o passo fecha o processo (Postgres)", async () => {
  const notes = new PostgresNoteRepository(ctx.db);
  const skill = Note.create({
    userId: "user-1", name: "cafe", type: "skill", tags: ["skill"],
    data: { path: "hermes/skills/cafe/SKILL.md", hash: "a".repeat(64), missing: false },
  });
  await notes.save(skill);
  const text = "---\nname: cafe\n---\n# Café\nUse 18 g.";
  gateway.outputs.set("agent_skill_note_edit", { edits: [{ id: skill.id, text }] });
  vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "user-1");

  const processId = await operations.startEdit(
    { userId: "user-1", text: "use 18 g", entityType: "skill_note", entityId: skill.id }, actor);
  const ran = await drain();

  expect(ran).toEqual(["process-edit-target", "process-agent-skill-note-edit", "process-finalize"]);
  expect(files.written).toEqual([{ path: "hermes/skills/cafe/SKILL.md", text }]);
  expect((await operations.view(processId, actor)).status).toBe("completed");
  expect((await ctx.pool.query("SELECT kind,status FROM ai_jobs WHERE kind LIKE 'process-%' AND status<>'succeeded'")).rows).toEqual([]);
}, 60000);

test("edicao de alvo inexistente fecha o processo como falho, com o texto predefinido, sem passo", async () => {
  const processId = await operations.startEdit(
    { userId: "user-1", text: "muda", entityType: "event", entityId: "nao-existe" }, actor);
  expect(await drain()).toEqual(["process-edit-target"]);
  expect(await operations.view(processId, actor)).toMatchObject({
    status: "failed", steps: [], message: uiConfig.targetFailed.not_found,
  });
}, 60000);
