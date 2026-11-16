import type { AgentTraceDto } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { getJobsEnv } from "../../config/env";
import { Artifact, type FoodData } from "../../domain";
import { HermesRequestError, type HermesChatInput } from "../../infrastructure/hermes/hermes.client";
import { JobsService } from "../../infrastructure/jobs/jobs.service";
import { PostgresEntityBatchWriter } from "../../infrastructure/persistence/agent-batch/postgres-entity-batch-writer";
import { PostgresScopedSqlQuery } from "../../infrastructure/persistence/agent-sql/postgres-scoped-sql.query";
import { PostgresWorkoutCatalog } from "../../infrastructure/persistence/artifacts/postgres-workout.catalog";
import { PostgresArtifactRepository } from "../../infrastructure/persistence/artifacts/repositories/postgres-artifact.repository";
import { PostgresDatabase } from "../../infrastructure/persistence/database/postgres-database";
import { PostgresTaskRepository } from "../../infrastructure/persistence/tasks/repositories/postgres-task.repository";
import { PostgresJobStore } from "../../infrastructure/persistence/jobs/postgres-job.store";
import { PostgresRecurrenceRepository } from "../../infrastructure/persistence/recurrences/repositories/postgres-recurrence.repository";
import { PostgresCandidateQuery } from "../../infrastructure/persistence/requests/postgres-candidate.query";
import { PostgresRequestStore } from "../../infrastructure/persistence/requests/postgres-request.store";
import { createPostgresTestContext, type PostgresTestContext } from "../../infrastructure/persistence/testing/postgres-test-context";
import { FastStageError } from "../agent/errors/agent.errors";
import { GenerateFoodUseCase } from "../artifacts/generate-food.usecase";
import { ArtifactBuilder } from "../artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../tasks/create-task.usecase";
import type { ParsedTaskCommand } from "../tasks/gateways/task-command-parsing.gateway";
import { HermesTurnWorker } from "./hermes-turn-worker";
import { RequestAgentRunner } from "./request-agent-runner";
import { dispatchConfig, uiConfig } from "./request-config";
import { RequestCreateWorker } from "./request-create-worker";
import { RequestDispatcher } from "./request-dispatcher";
import { RequestEditTargetWorker } from "./request-edit-target-worker";
import { RequestEditWorker } from "./request-edit-worker";
import { RequestFallback } from "./request-fallback";
import { RequestFinalizer } from "./request-finalizer";
import { RequestOperations } from "./request-operations";
import { RequestQueryWorker } from "./request-query-worker";
import { RequestTargetEditWorker } from "./request-target-edit-worker";
import { confident, FakeAgentFiles, result, ScriptedFoodParsing, scriptedJev, ScriptedStructuredGateway } from "./testing/request-test-kit";
import { VoiceTaskWorker } from "./voice-task-worker";

/**
 * O pedido de ponta a ponta no Postgres de verdade: a rota grava o pedido e o job, a fila unica entrega os jobs
 * aos handlers e o que sobra e lido como o cliente le. So os modelos (JEV, agentes, Hermes) sao combinados.
 */

let ctx: PostgresTestContext;
let jobs: JobsService;
let operations: RequestOperations;
let tasks: PostgresTaskRepository;
let artifacts: PostgresArtifactRepository;
let dispatch: Record<string, ReturnType<typeof confident>> = {};
let hermesReply: (input: HermesChatInput) => Promise<{ text: string; trace: AgentTraceDto }>;
let command: ParsedTaskCommand;
const gateway = new ScriptedStructuredGateway();
const foodParsing = new ScriptedFoodParsing();
const actor = { userId: "user-1" };

// Hoje: os candidatos de edicao sao as tarefas de ontem, hoje e amanha.
const TODAY = new Date().toISOString().slice(0, 10);
const iso = (hour: number) => `${TODAY}T${String(hour).padStart(2, "0")}:00:00-03:00`;
const task = (name: string, kind: string, hour: number, over: Record<string, unknown> = {}) => ({
  name, kind, status: null, priority: null, longRunning: false, startedAt: iso(hour), estimatedFinishAt: null,
  description: null, tags: [], followsFrom: [], ...over,
});
const noTask = {
  name: null, kind: null, status: null, priority: null, startedAt: null, estimatedFinishAt: null, finishedAt: null,
  description: null, tags: null,
};

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  const database = new PostgresDatabase(ctx.pool);
  const env = getJobsEnv({ AI_JOBS_LEASE_MS: "60000", AI_JOBS_MAX_ATTEMPTS: "1", AI_JOBS_CONCURRENCY: "4" });
  jobs = new JobsService(new PostgresJobStore(database, env.AI_JOBS_LEASE_MS, env.AI_JOBS_MAX_ATTEMPTS), env);
  tasks = new PostgresTaskRepository(ctx.db);
  artifacts = new PostgresArtifactRepository(ctx.db);
  const repositories = { tasks, artifacts, recurrences: new PostgresRecurrenceRepository(ctx.db) };
  const artifactBuilder = new ArtifactBuilder(new PostgresWorkoutCatalog(ctx.db));
  const batchWriter = new PostgresEntityBatchWriter(ctx.db);
  const createTask = new CreateTaskUseCase(tasks, artifacts, artifactBuilder, batchWriter);
  const store = new PostgresRequestStore(database);
  const sql = new PostgresScopedSqlQuery(ctx.pool);
  const runner = new RequestAgentRunner(gateway, { thoughts: store, reasoning: "low" });

  // O JEV de entrada responde o que o teste combinou; o de ligacao escolhe a refeicao; o de candidatos, a reuniao.
  const jev = scriptedJev((questions, state) => {
    if ("link" in questions) {
      // So o alimento e a refeicao pertencem um ao outro; as outras tarefas ficam soltas.
      const criteria = Object.entries((questions.link as { criteria: Record<string, string> }).criteria);
      const entity = String(state.entity);
      const owner = entity.startsWith("artefato") ? criteria.find(([, text]) => text.includes("Refeição"))
        : entity.includes("Refeição") ? criteria.find(([, text]) => text.startsWith("artefato")) : undefined;
      return result({ link: confident(owner?.[0] ?? "none") });
    }
    if ("c1" in questions) {
      const picked: Record<string, ReturnType<typeof confident>> = {};
      for (const [name, question] of Object.entries(questions as Record<string, { instructions: string }>)) {
        picked[name] = confident(/Reunião|Corrida/.test(question.instructions) ? "edit" : "keep");
      }
      return result(picked);
    }
    const answers: Record<string, ReturnType<typeof confident>> = {};
    for (const name of Object.keys(dispatchConfig.questions)) answers[name] = confident(name === "query" ? "no" : "none");
    return result({ ...answers, ...dispatch });
  });

  const deps = { store, runner, batchWriter, repositories, createTask };
  operations = new RequestOperations(jobs, store, {
    dispatcher: new RequestDispatcher(store, jev.client, new PostgresCandidateQuery(database)),
    create: new RequestCreateWorker(deps),
    edit: new RequestEditWorker({ ...deps, sql }),
    query: new RequestQueryWorker({ store, runner, sql }),
    finalizer: new RequestFinalizer({ ...deps, jev: jev.client }),
    fallback: new RequestFallback({ store, runner }),
    editTarget: new RequestEditTargetWorker({
      store, repositories, files: new FakeAgentFiles(), failureText: (code) => uiConfig.targetFailed[code],
    }),
    targetEdit: new RequestTargetEditWorker({ ...deps, foodParsing, artifactBuilder, files: new FakeAgentFiles() }),
    hermes: new HermesTurnWorker(store, { chat: (input) => hermesReply(input) }),
    voice: new VoiceTaskWorker({
      store, parsing: { parseCommand: async () => command }, createTask, batchWriter,
    }),
    food: new GenerateFoodUseCase(artifacts, foodParsing),
  });
  operations.onModuleInit();
}, 120000);

beforeEach(async () => {
  await ctx.reset();
  gateway.outputs.clear();
  gateway.reasonings.clear();
  gateway.calls.length = 0;
  gateway.failure = undefined;
  dispatch = {};
  foodParsing.texts.length = 0;
  foodParsing.response = {
    items: [{ food: "Arroz", portion: "300 g", approximateWeightGrams: 300, caloriesKcal: 390, macronutrients: { carbohydratesGrams: 84, proteinsGrams: 8, totalFatGrams: 1, fiberGrams: 1 } }],
    recipe: { source: "model", ingredients: [{ name: "arroz", quantity: "300 g" }], steps: ["Cozinhe."] },
    modelProvider: "stub", modelName: "stub",
  };
  command = { input: { name: "Estudar", kind: "common", tags: [] }, schedule: {}, modelProvider: "stub", modelName: "stub" };
  hermesReply = async () => { throw new HermesRequestError("sem resposta combinada"); };
});

afterAll(async () => {
  await ctx?.stop();
});

/** A fila unica entregando os jobs, como o worker faria, ate nao sobrar nenhum pronto. Devolve os tipos, na ordem. */
async function drain(): Promise<string[]> {
  for (let round = 0; round < 50; round += 1) {
    await jobs.tick();
    await jobs.idle();
    const { rows } = await ctx.pool.query("SELECT 1 FROM jobs WHERE status IN ('queued', 'running') AND available_at <= now() LIMIT 1");
    if (rows.length === 0) break;
  }
  const { rows } = await ctx.pool.query<{ kind: string }>("SELECT kind FROM jobs ORDER BY created_at, id");
  return rows.map((row) => row.kind);
}

const jobStatuses = async () =>
  (await ctx.pool.query<{ kind: string; status: string }>("SELECT kind, status FROM jobs ORDER BY created_at, id")).rows;

test("o exemplo-guia: tarefas e alimento criados em passos proprios, ligados na finalizacao, nutrientes calculados depois", async () => {
  dispatch = { task_create: confident("many"), artifact_create: confident("one") };
  gateway.outputs.set("task_create", { tasks: [task("Refeição", "meal", 12), task("Nadar na praia", "training", 13)] });
  gateway.outputs.set("artifact_create", { artifacts: [{ type: "food", name: "Arroz e feijão", content: "300g de arroz" }] });

  const requestId = await operations.start({ userId: "user-1", text: "comendo 300g de arroz, depois vou nadar", context: { screen: "agenda" } }, actor);
  expect(await operations.view(requestId, actor)).toMatchObject({ status: "queued", steps: [], route: "steps" });

  const ran = await drain();
  expect(ran.filter((kind) => kind.startsWith("request-")).sort()).toEqual([
    "request-dispatch", "request-finalize", "request-finalize", "request-step", "request-step",
  ]);
  expect(ran).toContain("food-generation");
  expect((await jobStatuses()).every((job) => job.status === "succeeded")).toBe(true);

  const view = await operations.view(requestId, actor);
  expect(view).toMatchObject({ status: "done", title: "comendo 300g de arroz, depois vou nadar", text: "comendo 300g de arroz, depois vou nadar" });
  expect(view.message).toBeUndefined();
  expect(view.steps.map((step) => [step.agent, step.label, step.status])).toEqual([
    ["task-create", "Criando tarefas", "done"], ["artifact-create", "Criando artefatos", "done"],
  ]);
  const meal = view.entities.find((entity) => entity.name === "Refeição");
  const swim = view.entities.find((entity) => entity.name === "Nadar na praia");
  const food = view.entities.find((entity) => entity.kind === "artifact");
  expect(food).toMatchObject({ artifactType: "food", operation: "create", linkedTo: [{ kind: "task", id: meal?.id }] });
  expect(meal).toMatchObject({ kind: "task", operation: "create", linkedTo: [{ kind: "artifact", id: food?.id }] });
  expect(swim?.linkedTo).toEqual([]);
  expect(view.trace).toMatchObject({ route: "steps", status: "done" });
  expect(view.trace?.entries.map((entry) => entry.kind)).toEqual(["request", "routing", "agent", "agent", "answer"]);

  // A tarefa da refeicao passou a criar o alimento; a outra tarefa nao foi tocada.
  const stored = await tasks.findById(meal?.id as string);
  expect(stored?.artifactLinks).toEqual([{ artifactId: food?.id, relation: "creates", fromRecurrence: false }]);
  expect(stored?.revision).toBe(2);
  expect((await tasks.findById(swim?.id as string))?.revision).toBe(1);

  // O alimento nasceu pendente e o pedido de construcao calculou os nutrientes.
  const data = (await artifacts.findById(food?.id as string))?.data as FoodData;
  expect(data).toMatchObject({ description: "300g de arroz", generation: { status: "completed" }, totals: { totalCaloriesKcal: 390 } });
  expect(foodParsing.texts).toEqual(["300g de arroz"]);
  const list = await operations.list(actor);
  expect(list.map((request) => [request.route, request.kind, request.status]).sort()).toEqual([
    ["food", "build_request", "done"], ["steps", "request", "done"],
  ]);
  const build = list.find((request) => request.route === "food");
  expect(build).toMatchObject({ text: "300g de arroz", entities: [{ kind: "artifact", id: food?.id, operation: "update" }] });
  expect(build?.trace).toBeUndefined();

  // Os pedidos e os passos nao aparecem na consulta do agente nem como tarefa de pessoa.
  const humans = await ctx.pool.query("SELECT name FROM tasks WHERE actor = 'human' ORDER BY name");
  expect(humans.rows.map((row) => row.name)).toEqual(["Nadar na praia", "Refeição"]);
});

test("edicao: o JEV escolhe o candidato, o agente muda so ele; uma continuacao aponta para o primeiro pedido", async () => {
  dispatch = { task_create: confident("one") };
  gateway.outputs.set("task_create", { tasks: [task("Reunião", "common", 12)] });
  const first = await operations.start({ userId: "user-1", text: "reunião ao meio-dia" }, actor);
  await drain();
  const [meeting] = (await operations.view(first, actor)).entities;

  dispatch = { task_edit: confident("one") };
  gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: meeting?.id, estimatedFinishAt: iso(14) }], query: null });
  const second = await operations.start({ userId: "user-1", text: "terminei a reunião às 14h", sessionId: first }, actor);
  await drain();

  const view = await operations.view(second, actor);
  expect(view).toMatchObject({
    status: "done", sessionId: first,
    steps: [{ agent: "task-edit", status: "done" }],
    entities: [{ kind: "task", id: meeting?.id, name: "Reunião", operation: "update" }],
  });
  expect((await operations.view(first, actor)).sessionId).toBeUndefined();
  expect(await tasks.findById(meeting?.id as string)).toMatchObject({ estimatedFinishAt: new Date(iso(14)), revision: 2 });
  // O agente de edicao recebeu o candidato que o JEV escolheu.
  expect(gateway.calls.at(-1)?.user).toContain(meeting?.id as string);
  const routing = view.trace?.entries.find((entry) => entry.kind === "routing");
  expect(routing?.fields).toContainEqual({ label: "Candidatos de edição", value: "1 de 1" });
});

test("consulta: as linhas ficam no passo e so enxergam as tarefas de pessoa do usuario", async () => {
  dispatch = { task_create: confident("one") };
  gateway.outputs.set("task_create", { tasks: [task("Reunião", "common", 12)] });
  await operations.start({ userId: "user-1", text: "reunião ao meio-dia" }, actor);
  await drain();

  dispatch = { query: confident("yes") };
  gateway.outputs.set("query", { sql: "SELECT name FROM tasks ORDER BY name" });
  const requestId = await operations.start({ userId: "user-1", text: "o que tenho hoje?" }, actor);
  await drain();

  const view = await operations.view(requestId, actor);
  expect(view.status).toBe("done");
  expect(view.steps).toMatchObject([{ agent: "query", status: "done", result: { columns: ["name"], rows: [["Reunião"]], truncated: false } }]);
  expect(gateway.calls.at(-1)?.user).toContain("Esquema:");
});

test("`fallback:` roda em laco: o que os especialistas fizeram volta na rodada seguinte, e o raciocinio fica no passo", async () => {
  gateway.outputs.set("fallback_loop", { reply: null, invoke: [{ agent: "task-create", instruction: "Criar o almoço" }] });
  gateway.reasonings.set("fallback_loop", "O pedido pede uma tarefa.");
  gateway.outputs.set("task_create", { tasks: [task("Almoço", "meal", 12)] });

  const requestId = await operations.start({ userId: "user-1", text: "fallback: almocei ao meio-dia" }, actor);
  // Primeira rodada e o especialista; a segunda rodada so entra depois da finalizacao dele.
  await jobs.tick();
  await jobs.idle();
  await jobs.tick();
  await jobs.idle();
  gateway.outputs.set("fallback_loop", { reply: "Registrei o almoço.", invoke: null });
  await drain();

  const view = await operations.view(requestId, actor);
  expect(view).toMatchObject({ status: "done", message: "Registrei o almoço.", text: "almocei ao meio-dia" });
  expect(view.steps.map((step) => [step.agent, step.status])).toEqual([
    ["fallback", "done"], ["task-create", "done"], ["fallback", "done"],
  ]);
  expect(view.entities).toMatchObject([{ kind: "task", name: "Almoço", operation: "create" }]);
  const second = gateway.calls.filter((call) => call.schemaName === "fallback_loop")[1]?.user ?? "";
  expect(second).toContain("Rodada: 2 de 4");
  expect(second).toContain('"records":[{"kind":"task","operation":"create","name":"Almoço"');
  expect(view.trace?.entries.filter((entry) => entry.kind === "thought").map((entry) => entry.summary)).toContain("O pedido pede uma tarefa.");
  expect(view.trace?.entries.find((entry) => entry.kind === "routing")?.summary).toBe("Fallback: pedido direto, pelo prefixo fallback:");
});

test("um passo que falha nao trava o pedido: ele fecha com a explicacao, e o outro passo fica gravado", async () => {
  dispatch = { task_create: confident("one"), artifact_create: confident("one") };
  gateway.outputs.set("task_create", { tasks: [task("Refeição", "meal", 12)] });
  gateway.outputs.set("failure_explainer", { message: "Criei a tarefa, mas não consegui criar o alimento." });

  const requestId = await operations.start({ userId: "user-1", text: "almocei arroz" }, actor);
  await drain();

  const view = await operations.view(requestId, actor);
  expect(view).toMatchObject({ status: "done", message: "Criei a tarefa, mas não consegui criar o alimento." });
  expect(view.steps.map((step) => [step.agent, step.status, step.errorCode])).toEqual([
    ["task-create", "done", undefined], ["artifact-create", "failed", "internal"],
  ]);
  expect(view.entities.map((entity) => entity.name)).toEqual(["Refeição"]);
});

test("o job de um passo que morre nunca deixa o pedido aberto", async () => {
  dispatch = { task_create: confident("one") };
  const requestId = await operations.start({ userId: "user-1", text: "almocei" }, actor);
  await jobs.tick();
  await jobs.idle();
  // O worker morreu no meio: sem tentativa sobrando, a fila projeta a falha no passo.
  await ctx.pool.query("UPDATE jobs SET attempts = 5 WHERE kind = 'request-step'");
  await drain();

  const view = await operations.view(requestId, actor);
  expect(view.steps).toMatchObject([{ agent: "task-create", status: "failed", errorCode: "unavailable" }]);
  expect(view).toMatchObject({ status: "failed", message: "Não consegui concluir: criando tarefas." });
  expect((await jobStatuses()).find((job) => job.kind === "request-step")?.status).toBe("failed");
});

test("edicao pela tela de detalhe: o alvo escolhe o agente, sem JEV; alvo que nao existe falha com o texto predefinido", async () => {
  const sleep = Artifact.create({ userId: "user-1", type: "sleep", name: "Sono", data: { trackedSleepTime: 400, score: 70 } });
  await artifacts.save(sleep);
  gateway.outputs.set("sleep_edit", { edits: [{ id: sleep.id, name: null, trackedSleepTime: 480, score: null, tags: null }] });

  const requestId = await operations.startEdit({ userId: "user-1", text: "dormi 8h", entityType: "sleep_artifact", entityId: sleep.id }, actor);
  expect(await drain()).toEqual(["request-edit-target", "request-step", "request-finalize"]);

  const view = await operations.view(requestId, actor);
  expect(view).toMatchObject({
    status: "done", steps: [{ agent: "sleep-edit", label: "Editando o sono", status: "done" }],
    entities: [{ kind: "artifact", id: sleep.id, artifactType: "sleep", operation: "update", linkedTo: [] }],
  });
  expect(view.trace?.entries.map((entry) => entry.kind)).toEqual(["request", "agent", "answer"]);
  expect(await artifacts.findById(sleep.id)).toMatchObject({ data: { trackedSleepTime: 480, score: 70 }, revision: 2 });

  const missing = await operations.startEdit({ userId: "user-1", text: "mude", entityType: "task", entityId: "nao-existe" }, actor);
  await drain();
  expect(await operations.view(missing, actor)).toMatchObject({
    status: "failed", errorCode: "invalid_input", message: uiConfig.targetFailed.not_found, steps: [],
  });
});

test("voz: o pedido gera a tarefa de pessoa; reenviar a mesma fala nao cria outro", async () => {
  const requestId = await operations.startVoice({ transcript: "comecei a estudar", clientMessageId: "v1" }, actor);
  expect(await operations.startVoice({ transcript: "comecei a estudar", clientMessageId: "v1" }, actor)).toBe(requestId);
  expect(await drain()).toEqual(["voice-task"]);

  const view = await operations.view(requestId, actor);
  expect(view).toMatchObject({
    route: "voice", status: "done", text: "comecei a estudar", steps: [],
    entities: [{ kind: "task", name: "Estudar", operation: "create" }],
  });
  expect(view.trace).toBeUndefined();
  const created = await tasks.findById(view.entities[0]?.id as string);
  expect(created).toMatchObject({ actor: "human", description: "comecei a estudar" });
  expect((await ctx.pool.query("SELECT 1 FROM tasks WHERE actor = 'human'")).rows).toHaveLength(1);
});

test("voz: o modelo falha de vez e o pedido termina como falha, sem tarefa", async () => {
  command = undefined as never;
  const requestId = await operations.startVoice({ transcript: "comecei a estudar" }, actor);
  await drain();
  expect(await operations.view(requestId, actor)).toMatchObject({ status: "failed", errorCode: "unavailable", message: uiConfig.requestFailed, entities: [] });
});

test("Hermes: o rastro vem do progresso enquanto roda e das entradas depois que o job termina", async () => {
  const live: AgentTraceDto = {
    route: "hermes", status: "running", fields: [],
    entries: [{ id: "t1", kind: "tool", label: "Listou a agenda", source: "mcp_braid_list_agenda_tasks", status: "running" }],
  };
  const final: AgentTraceDto = { ...live, status: "done", durationMs: 900, entries: [{ ...live.entries[0], status: "done" } as AgentTraceDto["entries"][number]] };
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let session = "";
  hermesReply = async (input) => {
    session = input.sessionId;
    input.onTrace?.(live);
    await gate;
    return { text: "Você tem uma reunião.", trace: final };
  };

  const accepted = await operations.startHermes({ userId: "user-1", text: "o que tenho hoje?", clientMessageId: "m1" }, actor);
  expect(accepted).toMatchObject({ route: "hermes", status: "queued" });
  expect((await operations.startHermes({ userId: "user-1", text: "o que tenho hoje?", clientMessageId: "m1" }, actor)).id).toBe(accepted.id);

  await jobs.tick();
  await expect.poll(async () => (await operations.view(accepted.id, actor)).progress).toBe("Listou a agenda");
  expect(await operations.view(accepted.id, actor)).toMatchObject({
    status: "running", trace: live, steps: [{ id: "t1", agent: "mcp_braid_list_agenda_tasks", status: "running" }],
  });
  release();
  await jobs.idle();

  expect(session).toBe(`braid-user-1-${accepted.id}`);
  // O job terminou e um dia sera apagado: o que o cliente le sai do pedido.
  await ctx.pool.query("DELETE FROM jobs");
  const view = await operations.view(accepted.id, actor);
  expect(view).toMatchObject({
    status: "done", message: "Você tem uma reunião.", trace: final,
    steps: [{ id: "t1", label: "Listou a agenda", status: "done" }],
  });
  expect(view.progress).toBeUndefined();
});

test("cancelar: os jobs vivos param, o pedido e os passos abertos ficam cancelados e nada mais e gravado", async () => {
  dispatch = { task_create: confident("one"), query: confident("yes") };
  gateway.outputs.set("task_create", { tasks: [task("Almoço", "meal", 12)] });
  const requestId = await operations.start({ userId: "user-1", text: "almocei; o que tenho hoje?" }, actor);
  await jobs.tick();
  await jobs.idle();

  const cancelled = await operations.cancel(requestId, actor);
  expect(cancelled).toMatchObject({ status: "cancel", errorCode: "cancelled" });
  expect(cancelled.steps.map((step) => step.status)).toEqual(["cancel", "cancel"]);
  await drain();

  expect((await jobStatuses()).filter((job) => job.kind === "request-step").map((job) => job.status)).toEqual(["cancelled", "cancelled"]);
  expect((await ctx.pool.query("SELECT 1 FROM tasks WHERE actor = 'human'")).rows).toHaveLength(0);
  expect(gateway.calls).toHaveLength(0);
  expect(await operations.view(requestId, actor)).toMatchObject({ status: "cancel", entities: [] });
});

test("o modelo fora do ar vira passo vermelho com codigo, e o texto do usuario so aparece em mensagens, pensamentos e insumos", async () => {
  dispatch = { task_create: confident("one") };
  gateway.failure = new FastStageError("timeout");
  const text = "almocei com a Dona Zuleide";
  const requestId = await operations.start({ userId: "user-1", text }, actor);
  await drain();

  expect((await operations.view(requestId, actor)).steps).toMatchObject([{ status: "failed", errorCode: "agent_timeout" }]);
  const leaked = await ctx.pool.query(
    "SELECT kind FROM task_entries WHERE kind IN ('trace', 'result') AND (content LIKE '%Zuleide%' OR data::text LIKE '%Zuleide%')");
  expect(leaked.rows).toEqual([]);
  const traces = await ctx.pool.query("SELECT content FROM task_entries WHERE kind = 'trace'");
  expect(traces.rows.length).toBeGreaterThan(0);
  expect(traces.rows.every((row) => row.content === null)).toBe(true);
});
