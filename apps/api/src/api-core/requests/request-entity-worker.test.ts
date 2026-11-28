import { describe, expect, test } from "vitest";
import { Artifact, defaultTaskDurationMinutesFor, Task } from "../../domain";
import { FastStageError } from "../agent/errors/agent.errors";
import type { EditCandidate } from "./request-candidates";
import { addStep, entityAnswer, setupRequest } from "./testing/request-test-kit";
import { RequestEntityWorker } from "./request-entity-worker";

const iso = (hour: number, minute = 0) => `2026-10-25T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;

const task = (over: Record<string, unknown> = {}) => ({
  name: "Tarefa", kind: "common", status: null, priority: null, longRunning: false, startedAt: null,
  estimatedFinishAt: null, description: null, tags: [], subtaskOf: null, foods: null, foodName: null, ...over,
});

/** O artefato que o lote cria na posicao dada. */
const createdArtifact = (change: { op: string; entity?: { id: string; name: string } } | undefined) =>
  change?.op === "create" ? change.entity : undefined;

const finalizeJobs = (ctx: ReturnType<typeof setupRequest>) => ctx.store.jobs.filter((job) => job.kind === "request-finalize");

describe("tarefas novas", () => {
  test("o exemplo-guia vira tres tarefas num commit proprio, e a refeicao nasce com o alimento ligado", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [
      task({ name: "Refeição", kind: "meal", startedAt: iso(12), foods: "300g de arroz, 200g de feijão", foodName: "Arroz e feijão" }),
      task({ name: "Nadar na praia", kind: "training", startedAt: iso(12, 30), estimatedFinishAt: iso(13, 30) }),
      task({ name: "Voltar para casa e ver o filme", startedAt: iso(15, 30) }),
    ] }));

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    const batch = ctx.batchWriter.commits[0];
    expect(batch?.tasks).toHaveLength(3);
    // So a refeicao traz artefato: o alimento dela, pendente, com os alimentos ditos.
    expect(batch?.artifacts).toHaveLength(1);
    expect(batch?.artifacts[0]).toMatchObject({
      op: "create", entity: { type: "food", name: "Arroz e feijão", data: { description: "300g de arroz, 200g de feijão", generation: { status: "pending" } } },
    });
    const food = createdArtifact(batch?.artifacts[0]);
    const meal = batch?.tasks.find((change) => change.op === "create" && change.entity.kind === "meal");
    expect(meal && meal.op === "create" && meal.entity.artifactLinks).toEqual([
      { artifactId: food?.id, relation: "creates", fromRecurrence: false },
    ]);

    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    const entities = await ctx.store.entities("r1");
    expect(entities.map((entity) => [entity.kind, entity.operation, entity.summary.name])).toEqual([
      ["task", "create", "Refeição"], ["artifact", "create", food?.name],
      ["task", "create", "Nadar na praia"], ["task", "create", "Voltar para casa e ver o filme"],
    ]);
    // O alimento ja nasce ligado: entra finalizado, e a finalizacao nao o liga a mais nada.
    const mealId = meal?.op === "create" ? meal.entity.id : undefined;
    expect(entities[1]).toMatchObject({
      finalized: true, links: [{ from: { kind: "artifact", id: food?.id }, to: { kind: "task", id: mealId } }],
    });
    expect(entities[0]?.finalized).toBe(false);
    expect(finalizeJobs(ctx)).toEqual([{ kind: "request-finalize", requestId: "r1", stepId: "s1" }]);
  });

  test("refeicao sem alimentos ditos tambem ganha o alimento, com o nome dela como texto", async () => {
    const ctx = setupRequest("Almocei");
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ name: "Almoço", kind: "meal" })] }));

    await ctx.worker.run(payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.artifacts).toHaveLength(1);
    // Sem o que foi comido, o alimento leva o nome da refeicao.
    expect(batch?.artifacts[0]).toMatchObject({ entity: { type: "food", name: "Almoço", data: { description: "Almoço" } } });
    expect(ctx.database.tasks[0]?.artifactLinks).toEqual([
      { artifactId: createdArtifact(batch?.artifacts[0])?.id, relation: "creates", fromRecurrence: false },
    ]);
  });

  test("uma chamada so, com o pedido e os candidatos: o agente nao tem ferramentas nem pergunta", async () => {
    const ctx = setupRequest("Almocei agora");
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ name: "Almoço", kind: "meal" })] }));

    await ctx.worker.run(payload);

    expect(ctx.gateway.calls).toHaveLength(1);
    const call = ctx.gateway.calls[0];
    expect(call?.user).toContain("Almocei agora");
    expect(Object.keys((call?.schema.properties ?? {}) as object)).toEqual([
      "tasks", "artifacts", "series", "taskEdits", "artifactEdits", "seriesEdits", "query",
    ]);
    // Sem candidatos, a lista vai vazia: o agente so cria ou pede uma consulta.
    expect(call?.user).toContain('Candidatos (JSON):\n{"tasks":[],"artifacts":[],"series":[]}');
    expect(JSON.stringify(call?.schema)).not.toMatch(/clarification|question/i);
  });

  test("algo a fazer e uma tarefa com status, sem data; o que so marca um horario nasce de referencia", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [
      task({ name: "Pagar o aluguel", status: "todo", priority: "high" }),
      task({ name: "Reunião", startedAt: iso(15), estimatedFinishAt: iso(16) }),
    ] }));

    await ctx.worker.run(payload);

    const [tracked, reference] = ctx.database.tasks;
    expect(tracked).toMatchObject({ name: "Pagar o aluguel", status: "todo", priority: "high", startedAt: undefined });
    expect(reference).toMatchObject({ name: "Reunião", status: undefined });
    expect(reference?.isReference).toBe(true);
  });

  test("os relatos-guia: caminhada agora com a duracao padrao do treino, estudo de hoje fora da agenda e refeicao com o alimento", async () => {
    const ctx = setupRequest("vou caminhar agora; quero estudar hoje; comi 200g de macarrão");
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [
      // "vou caminhar agora": sem status e sem fim dito.
      task({ name: "Caminhada", kind: "training", startedAt: iso(12) }),
      // "quero estudar hoje": a fazer, sem inicio, com o dia de hoje (a meia-noite dele) como prazo.
      task({ name: "Estudar", status: "todo", estimatedFinishAt: iso(0) }),
      // "comi 200g de macarrão": a refeicao e o que foi comido.
      task({ name: "Almoço", kind: "meal", foods: "200g de macarrão", foodName: "Macarrão" }),
    ] }));

    await ctx.worker.run(payload);

    const [walk, study, meal] = ctx.database.tasks;
    // Sem acompanhamento de status, na agenda desde agora, pelo tempo padrao de um treino.
    expect(walk).toMatchObject({ kind: "training", status: undefined, startedAt: new Date(iso(12)) });
    expect(walk?.estimatedFinishAt).toEqual(new Date(new Date(iso(12)).getTime() + defaultTaskDurationMinutesFor("training") * 60_000));
    // A fazer e sem inicio: fica na lista de tarefas, fora da agenda, com hoje como data.
    expect(study).toMatchObject({ kind: "common", status: "todo", startedAt: undefined, estimatedFinishAt: new Date(iso(0)), longRunning: false });
    // A refeicao marca o instante do pedido e nasce com o alimento, de onde saem as calorias e a receita.
    expect(meal).toMatchObject({ kind: "meal", status: undefined, startedAt: ctx.request.createdAt });
    const food = createdArtifact(ctx.batchWriter.commits[0]?.artifacts[0]);
    expect(ctx.batchWriter.commits[0]?.artifacts[0]).toMatchObject({ entity: { type: "food", name: "Macarrão", data: { description: "200g de macarrão" } } });
    expect(meal?.artifactLinks).toEqual([{ artifactId: food?.id, relation: "creates", fromRecurrence: false }]);
  });

  test("o lugar dito vira o endereco achado no mapa; sem lugar dito, a tarefa nasce sem local", async () => {
    const ctx = setupRequest("Quero ir à clínica Saúde Emocional amanhã às 10h");
    ctx.places.addresses.set("clínica Saúde Emocional", "Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [
      task({ name: "Ir à clínica", location: "clínica Saúde Emocional" }),
      task({ name: "Almoço", kind: "meal" }),
    ] }));

    await ctx.worker.run(payload);

    expect(ctx.places.calls).toEqual([{ said: "clínica Saúde Emocional" }]);
    const [clinic, lunch] = ctx.database.tasks;
    expect(clinic?.location).toBe("Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    // Sem lugar dito, nada e procurado no mapa.
    expect(lunch?.location).toBeUndefined();
  });

  test("lugar que o mapa nao conhece fica como o usuario disse", async () => {
    const ctx = setupRequest("Jantar na casa da tia Lúcia");
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ name: "Jantar", kind: "meal", location: "casa da tia Lúcia" })] }));

    await ctx.worker.run(payload);

    expect(ctx.database.tasks[0]?.location).toBe("casa da tia Lúcia");
  });

  test("a tarefa declarada como parte de outra da mesma lista vira subtarefa no lote, sem revisar nenhuma tarefa", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [
      task({ name: "Organizar a festa", status: "todo" }),
      task({ name: "Comprar o bolo", status: "todo", subtaskOf: 0 }),
      task({ name: "Servir o bolo", status: "todo", subtaskOf: 0 }),
    ] }));

    await ctx.worker.run(payload);

    const byName = async (name: string) => {
      const created = ctx.database.tasks.find((candidate) => candidate.name === name);
      return ctx.taskRepository.findById(created?.id as string);
    };
    const [party, cake, serve] = [await byName("Organizar a festa"), await byName("Comprar o bolo"), await byName("Servir o bolo")];
    // A principal de cada uma e lida das arestas; todas nascem na revisao 1.
    expect(cake?.parentId).toBe(party?.id);
    expect(serve?.parentId).toBe(party?.id);
    expect(party?.subtaskIds).toEqual([cake?.id, serve?.id]);
    expect([party, cake, serve].map((candidate) => candidate?.revision)).toEqual([1, 1, 1]);
    expect(ctx.batchWriter.commits[0]?.tasks.map((change) => change.op)).toEqual(["create", "create", "create"]);
    expect(ctx.batchWriter.commits[0]?.subtasks).toEqual([
      { op: "add", parentId: party?.id, subtaskId: cake?.id },
      { op: "add", parentId: party?.id, subtaskId: serve?.id },
    ]);
  });

  test("uma lista sem subtaskOf nao grava hierarquia", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ status: "todo" }), task({ status: "todo" })] }));

    await ctx.worker.run(payload);

    expect(ctx.database.edges).toEqual([]);
    expect(ctx.batchWriter.commits[0]?.subtasks ?? []).toEqual([]);
  });

  test("uma posicao que nao existe na lista derruba o passo, sem gravar nada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ status: "todo", subtaskOf: 3 })] }));

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("uma tarefa subtarefa dela mesma derruba o passo, sem gravar nada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ status: "todo", subtaskOf: 0 })] }));

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("duas tarefas subtarefas uma da outra formam ciclo e derrubam o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [
      task({ name: "A", status: "todo", subtaskOf: 1 }),
      task({ name: "B", status: "todo", subtaskOf: 0 }),
    ] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed" });
  });

  test("horario invalido do modelo cai no padrao em vez de derrubar o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ startedAt: "amanhã cedo", estimatedFinishAt: "x" })] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    // Tarefa de referencia sem inicio dito comeca no instante do pedido.
    expect(ctx.database.tasks[0]?.startedAt).toEqual(ctx.request.createdAt);
  });
});

describe("artefatos de texto novos", () => {
  const note = (over: Record<string, unknown> = {}) => ({ name: "Ideia", content: "Visão semanal", taskIndex: null, taskId: null, ...over });

  test("um artefato solto nasce sem tarefa", async () => {
    const ctx = setupRequest("anota: visão semanal");
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ artifacts: [note()] }));

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits[0]?.artifacts[0]).toMatchObject({ entity: { type: "text", name: "Ideia", data: { body: "Visão semanal" } } });
    expect(ctx.database.tasks).toEqual([]);
    expect(await ctx.store.entities("r1")).toMatchObject([{ kind: "artifact", operation: "create", finalized: false, links: [] }]);
  });

  test("guardar um video do YouTube vira o pedido de transcricao, nao uma nota com o link", async () => {
    const ctx = setupRequest("salva esse vídeo https://youtu.be/dQw4w9WgXcQ");
    const asked: [string, string][] = [];
    const worker = new RequestEntityWorker({
      store: ctx.store, runner: ctx.runner, batchWriter: ctx.batchWriter, repositories: ctx.repositories,
      createTask: ctx.createTask, places: ctx.places, sql: ctx.sql,
      transcribe: async (url, userId) => {
        asked.push([url, userId]);
        const doc = Artifact.create({ userId, name: "Vídeo do YouTube (dQw4w9WgXcQ)", data: { body: "Transcrição na fila" } });
        await ctx.artifactRepository.save(doc);
        return doc.id;
      },
    });
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ artifacts: [note({ name: "Vídeo", content: "Ver depois: https://youtu.be/dQw4w9WgXcQ" })] }));

    await worker.run(payload);

    expect(asked).toEqual([["https://www.youtube.com/watch?v=dQw4w9WgXcQ", ctx.request.userId]]);
    expect(ctx.batchWriter.commits[0]?.artifacts).toEqual([]);
    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    expect(await ctx.store.entities("r1")).toMatchObject([{ kind: "artifact", operation: "create", summary: { name: "Vídeo do YouTube (dQw4w9WgXcQ)" } }]);
  });

  test("o agente liga o artefato a tarefa nova da mesma resposta, e a ligacao nasce no mesmo lote", async () => {
    const ctx = setupRequest("reunião com a Ana às 15h, pauta: orçamento e contratação");
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({
      tasks: [task({ name: "Reunião com a Ana", startedAt: iso(15) })],
      artifacts: [note({ name: "Pauta da reunião", content: "orçamento e contratação", taskIndex: 0 })],
    }));

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    const pauta = createdArtifact(ctx.batchWriter.commits[0]?.artifacts[0]);
    const meeting = ctx.database.tasks[0];
    expect(meeting?.artifactLinks).toEqual([{ artifactId: pauta?.id, relation: "creates", fromRecurrence: false }]);
    const entities = await ctx.store.entities("r1");
    expect(entities.map((entity) => [entity.kind, entity.operation, entity.finalized])).toEqual([
      ["task", "create", false], ["artifact", "create", true],
    ]);
    // A ligacao que o pedido mostra e a que o agente declarou; nenhum outro modelo a adivinha depois.
    expect(entities[1]?.links).toEqual([{ from: { kind: "artifact", id: pauta?.id }, to: { kind: "task", id: meeting?.id } }]);
  });

  test("o agente liga o artefato a uma tarefa que ja existe, se ela esta entre os candidatos", async () => {
    const ctx = setupRequest("anota na reunião: levar o contrato");
    const meeting = Task.create({ userId: "user-1", name: "Reunião", startedAt: new Date(iso(15)) });
    await ctx.taskRepository.save(meeting);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [{ kind: "task", id: meeting.id, name: "Reunião" }] });
    ctx.gateway.outputs.set("entity", entityAnswer({ artifacts: [note({ name: "Levar", content: "levar o contrato", taskId: meeting.id })] }));

    await ctx.worker.run(payload);

    const stored = await ctx.taskRepository.findById(meeting.id);
    expect(stored?.artifactLinks).toHaveLength(1);
    expect(stored?.revision).toBe(meeting.revision + 1);
    expect((await ctx.store.entities("r1")).map((entity) => [entity.kind, entity.operation])).toEqual([
      ["task", "update"], ["artifact", "create"],
    ]);
  });

  test.each([
    ["tarefa fora dos candidatos", { taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }, "target_unknown"],
    ["posicao que nao existe na lista", { taskIndex: 3 }, "rejected"],
    ["posicao e id ao mesmo tempo", { taskIndex: 0, taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }, "rejected"],
  ])("ligacao invalida (%s) derruba o passo, sem gravar nada", async (_, link, code) => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task({ startedAt: iso(15) })], artifacts: [note(link)] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: code });
    expect(ctx.batchWriter.commits).toHaveLength(0);
  });
});

describe("series novas", () => {
  const series = (over: Record<string, unknown> = {}) => ({
    name: "Corrida", kind: "training", status: null, priority: null, description: null, tags: [], frequency: "daily",
    interval: null, weekdays: null, monthDay: null, month: null, timeOfDay: "07:00", durationMinutes: 60,
    startsOn: null, endsOn: null, ...over,
  });

  test("a serie entra com a primeira ocorrencia no mesmo lote, e e a ocorrencia que o pedido mostra", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ series: [series()] }));

    await ctx.worker.run(payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.recurrences).toHaveLength(1);
    expect(batch?.tasks).toHaveLength(1);
    const [entity] = await ctx.store.entities("r1");
    expect(entity).toMatchObject({ kind: "task", operation: "create", summary: { name: "Corrida", series: true } });
  });

  test("o lugar dito na serie vira o endereco achado no mapa, e a ocorrencia nasce com ele", async () => {
    const ctx = setupRequest("tenho terapia na saude emocional quarta 13 horas");
    ctx.places.addresses.set("saude emocional", "Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ series: [series({
      name: "Terapia", kind: "common", frequency: "weekly", weekdays: ["wed"], timeOfDay: "13:00", location: "saude emocional",
    })] }));

    await ctx.worker.run(payload);

    expect(ctx.places.calls).toEqual([{ said: "saude emocional" }]);
    expect(ctx.database.tasks[0]?.location).toBe("Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
  });

  test("a serie de algo a fazer gera ocorrencias acompanhadas", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ series: [
      series({ name: "Pagar o aluguel", kind: "common", status: "todo", priority: "high", frequency: "monthly", monthDay: 5, timeOfDay: null, durationMinutes: null }),
    ] }));

    await ctx.worker.run(payload);

    expect(ctx.recurrences.recurrences[0]?.template).toMatchObject({ name: "Pagar o aluguel", status: "todo", priority: "high" });
    expect(ctx.database.tasks[0]).toMatchObject({ status: "todo", priority: "high" });
  });

  test("regra que contradiz o que foi dito derruba o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ series: [series({ weekdays: ["mon"] })] }));
    await ctx.worker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });
});

describe("falha de passo", () => {
  test.each([
    ["modelo estoura o tempo", new FastStageError("timeout"), "agent_timeout"],
    ["modelo responde fora do schema", new FastStageError("invalid"), "agent_invalid"],
    ["erro inesperado", new Error("boom"), "internal"],
  ])("%s: passo vermelho, nada gravado, finalizacao enfileirada", async (_, error, code) => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.failure = error;

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: code });
    expect(finalizeJobs(ctx)).toHaveLength(1);
    // O passo nunca e refeito dentro do worker.
    expect(ctx.gateway.calls).toHaveLength(1);
  });

  test("agente que nao acha nada para criar falha com codigo, sem perguntar", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [] }));
    await ctx.worker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "empty" });
  });

  test("passo ja concluido nao roda de novo, e o de um pedido cancelado nem comeca", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity");
    ctx.gateway.outputs.set("entity", entityAnswer({ tasks: [task()] }));
    await ctx.worker.run(payload);
    await ctx.worker.run(payload);
    expect(ctx.batchWriter.commits).toHaveLength(1);

    const second = await addStep(ctx, "s2", "entity");
    await ctx.store.cancel("r1");
    await ctx.worker.run(second);
    expect(ctx.batchWriter.commits).toHaveLength(1);
    expect(ctx.store.stepRecords[1]?.status).toBe("cancelled");
  });
});

const noTask = {
  name: null, kind: null, status: null, priority: null, startedAt: null, estimatedFinishAt: null, finishedAt: null,
  description: null, tags: null,
};

async function seedTask(ctx: ReturnType<typeof setupRequest>, name = "Trabalhar", extra: Partial<Parameters<typeof Task.create>[0]> = {}) {
  const task = Task.create({ userId: "user-1", name, startedAt: new Date("2026-10-25T12:00:00Z"), ...extra });
  await ctx.taskRepository.save(task);
  return task;
}

const candidate = (kind: EditCandidate["kind"], id: string, name: string): EditCandidate => ({ kind, id, name });
const updated = async (ctx: ReturnType<typeof setupRequest>) => ctx.store.entities("r1");

describe("mudancas em tarefas que ja existem", () => {
  test("'parei de trabalhar' altera so o fim planejado da tarefa candidata, num commit proprio", async () => {
    const ctx = setupRequest("parei de trabalhar");
    const task = await seedTask(ctx);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", task.id, "Trabalhar")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: task.id, estimatedFinishAt: iso(18) }] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    const stored = await ctx.taskRepository.findById(task.id);
    expect(stored?.estimatedFinishAt?.toISOString()).toBe(new Date(iso(18)).toISOString());
    expect(stored?.name).toBe("Trabalhar");
    expect(stored?.revision).toBe(task.revision + 1);
    expect(await updated(ctx)).toMatchObject([{ kind: "task", id: task.id, operation: "update", summary: { name: "Trabalhar" } }]);
    expect(ctx.store.jobs.filter((job) => job.kind === "request-finalize")).toHaveLength(1);
    // O agente recebeu os candidatos que o despacho listou.
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.gateway.calls[0]?.user).toContain(task.id);
  });

  test("mudar o local: o lugar dito vira o endereco achado no mapa; texto vazio tira o local", async () => {
    const ctx = setupRequest("a consulta vai ser no Hospital Mater Dei");
    ctx.places.addresses.set("Hospital Mater Dei", "Hospital Mater Dei Santo Agostinho, Rua Gonçalves Dias 3155, Belo Horizonte");
    const task = await seedTask(ctx, "Consulta", { location: "Consultório antigo" });
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", task.id, "Consulta")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: task.id, location: "Hospital Mater Dei" }] }));

    await ctx.worker.run(payload);

    expect(ctx.places.calls).toEqual([{ said: "Hospital Mater Dei" }]);
    expect((await ctx.taskRepository.findById(task.id))?.location).toBe(
      "Hospital Mater Dei Santo Agostinho, Rua Gonçalves Dias 3155, Belo Horizonte",
    );

    const clearing = setupRequest("tira o local da consulta");
    const located = await seedTask(clearing, "Consulta", { location: "Consultório antigo" });
    const clear = await addStep(clearing, "s1", "entity", "many", { candidates: [candidate("task", located.id, "Consulta")] });
    clearing.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: located.id, location: "" }] }));

    await clearing.worker.run(clear);

    expect(clearing.places.calls).toEqual([]);
    expect((await clearing.taskRepository.findById(located.id))?.location).toBeUndefined();
  });

  test("concluir uma tarefa acompanhada: status e conclusao real", async () => {
    const ctx = setupRequest("já paguei o aluguel");
    const task = await seedTask(ctx, "Pagar o aluguel", { status: "todo", startedAt: undefined });
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", task.id, "Pagar o aluguel")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: task.id, status: "done", finishedAt: iso(10) }] }));

    await ctx.worker.run(payload);

    expect(await ctx.taskRepository.findById(task.id)).toMatchObject({ status: "done", finishedAt: new Date(iso(10)) });
  });

  test("tres tarefas no mesmo passo, um commit; os demais nao sao tocados", async () => {
    const ctx = setupRequest();
    const tasks = [await seedTask(ctx, "A", { status: "todo" }), await seedTask(ctx, "B", { status: "todo" }), await seedTask(ctx, "C", { status: "todo" })];
    const other = await seedTask(ctx, "Almoço");
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: tasks.map((task) => candidate("task", task.id, task.name)) });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: tasks.map((task) => ({ ...noTask, id: task.id, priority: "high" })) }));

    await ctx.worker.run(payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    expect(ctx.batchWriter.commits[0]?.tasks.map((change) => change.op)).toEqual(["update", "update", "update"]);
    expect(await updated(ctx)).toHaveLength(3);
    expect((await ctx.taskRepository.findById(other.id))?.revision).toBe(other.revision);
  });

  test("nenhum candidato serve: o agente pede UMA consulta e e chamado de novo com o resultado", async () => {
    const ctx = setupRequest("terminei a reunião");
    const real = await seedTask(ctx, "Reunião");
    ctx.sql.run = async (input) => {
      ctx.sql.calls.push(input);
      return { ok: true, columns: ["id", "name"], rows: [[real.id, "Reunião"]], truncated: false };
    };
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [] });
    let round = 0;
    ctx.gateway.complete = async (input) => {
      ctx.gateway.calls.push(input);
      round += 1;
      return round === 1
        ? { modelName: "stub", value: entityAnswer({ query: { sql: "SELECT id, name FROM tasks" } }) }
        : { modelName: "stub", value: entityAnswer({ taskEdits: [{ ...noTask, id: real.id, estimatedFinishAt: iso(11) }] }) };
    };

    await ctx.worker.run(payload);

    expect(ctx.sql.calls).toEqual([{ userId: "user-1", sql: "SELECT id, name FROM tasks" }]);
    expect(ctx.gateway.calls).toHaveLength(2);
    expect(ctx.gateway.calls[1]?.user).toContain("Resultado da consulta");
    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
  });

  test("so uma rodada extra: depois da consulta, outra consulta nao e executada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [] });
    ctx.gateway.complete = async (input) => {
      ctx.gateway.calls.push(input);
      return { modelName: "stub", value: entityAnswer({ query: { sql: "SELECT id FROM tasks" } }) };
    };

    await ctx.worker.run(payload);

    expect(ctx.sql.calls).toHaveLength(1);
    expect(ctx.gateway.calls).toHaveLength(2);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "not_found" });
  });

  test("id que nao veio dos candidatos nem da consulta e recusado, nada e gravado", async () => {
    const ctx = setupRequest();
    const task = await seedTask(ctx);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: task.id, name: "Outro" }] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
    expect(ctx.batchWriter.commits).toHaveLength(0);
  });

  test("um pedido ou passo do agente nunca e alvo de edicao", async () => {
    const ctx = setupRequest();
    const agentTask = Task.create({ userId: "user-1", actor: "agent", kind: "request", status: "completed", name: "pedido antigo" });
    await ctx.taskRepository.save(agentTask);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", agentTask.id, "pedido antigo")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: agentTask.id, name: "Outro" }] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("consulta recusada pelo executor", async () => {
    const ctx = setupRequest("x", { ok: false, error: "so SELECT" });
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [], query: { sql: "DELETE FROM tasks" } }));
    await ctx.worker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "query_rejected" });
  });

  test("edicao sem nenhum campo novo falha com codigo, sem perguntar", async () => {
    const ctx = setupRequest();
    const task = await seedTask(ctx);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", task.id, "Trabalhar")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ taskEdits: [{ ...noTask, id: task.id }] }));
    await ctx.worker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
  });

  test("subtarefas novas: nascem a fazer, sob a tarefa editada, como criadas, no mesmo commit", async () => {
    const ctx = setupRequest("quebra em comprar a tinta e pintar a sala, a tinta ate sexta");
    const house = await seedTask(ctx, "Pintar a casa", { status: "todo" });
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", house.id, "Pintar a casa")] });
    ctx.gateway.outputs.set("entity", entityAnswer({
      taskEdits: [{
        ...noTask,
        id: house.id,
        subtasks: [
          { name: "Comprar a tinta", status: null, priority: "high", startedAt: null, estimatedFinishAt: iso(18), description: null },
          { name: "Pintar a sala", status: null, priority: null, startedAt: null, estimatedFinishAt: null, description: null },
        ],
      }],
    }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    expect(ctx.batchWriter.commits).toHaveLength(1);
    const parent = await ctx.taskRepository.findById(house.id);
    // So as arestas mudam: os campos da tarefa maior ficam como estavam.
    expect(parent?.name).toBe("Pintar a casa");
    const [paint, room] = await Promise.all((parent?.subtaskIds ?? []).map((id) => ctx.taskRepository.findById(id)));
    expect(paint).toMatchObject({ name: "Comprar a tinta", kind: "common", status: "todo", priority: "high", parentId: house.id });
    expect(paint?.estimatedFinishAt?.toISOString()).toBe(new Date(iso(18)).toISOString());
    expect(room).toMatchObject({ name: "Pintar a sala", status: "todo", parentId: house.id });
    expect(await updated(ctx)).toMatchObject([
      { kind: "task", id: paint?.id, operation: "create" },
      { kind: "task", id: room?.id, operation: "create" },
    ]);
  });

  test("mudar campos e criar subtarefa no mesmo item: a tarefa e alterada e a subtarefa nasce sob ela", async () => {
    const ctx = setupRequest("adia a viagem para as 18h e acrescenta reservar o hotel");
    const trip = await seedTask(ctx, "Preparar a viagem", { status: "todo" });
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("task", trip.id, "Preparar a viagem")] });
    ctx.gateway.outputs.set("entity", entityAnswer({
      taskEdits: [{
        ...noTask,
        id: trip.id,
        startedAt: iso(18),
        subtasks: [{ name: "Reservar o hotel", status: "doing", priority: null, startedAt: null, estimatedFinishAt: null, description: null }],
      }],
    }));

    await ctx.worker.run(payload);

    const stored = await ctx.taskRepository.findById(trip.id);
    expect(stored?.startedAt?.toISOString()).toBe(new Date(iso(18)).toISOString());
    const hotel = await ctx.taskRepository.findById(stored?.subtaskIds[0] as string);
    expect(hotel).toMatchObject({ name: "Reservar o hotel", status: "doing", parentId: trip.id });
    expect(await updated(ctx)).toMatchObject([
      { kind: "task", id: trip.id, operation: "update" },
      { kind: "task", id: hotel?.id, operation: "create" },
    ]);
  });

  test("modelo fora do ar: passo vermelho, sem repetir", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [] });
    ctx.gateway.failure = new FastStageError("timeout");
    await ctx.worker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    expect(ctx.gateway.calls).toHaveLength(1);
  });
});

describe("mudancas em artefatos que ja existem", () => {
  test("alterar o texto de um artefato de texto", async () => {
    const ctx = setupRequest();
    const artifact = Artifact.create({ userId: "user-1", name: "Ideia", data: { body: "Visão semanal" } });
    await ctx.artifactRepository.save(artifact);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("artifact", artifact.id, "Ideia")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ artifactEdits: [{ id: artifact.id, name: null, content: "Visão semanal e mensal", tags: null }] }));

    await ctx.worker.run(payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    expect((await ctx.artifactRepository.findById(artifact.id))?.data).toMatchObject({ body: "Visão semanal e mensal" });
    expect((await updated(ctx))[0]).toMatchObject({
      kind: "artifact", operation: "update", summary: { name: "Ideia", artifactType: "text", text: "Visão semanal e mensal" },
    });
  });

  test("so artefatos de texto tem texto editavel", async () => {
    const ctx = setupRequest();
    const sleep = Artifact.create({ userId: "user-1", type: "sleep", data: { trackedSleepTime: 400, score: 70 } });
    await ctx.artifactRepository.save(sleep);
    const payload = await addStep(ctx, "s1", "entity", "many", { candidates: [candidate("artifact", sleep.id, "Sono")] });
    ctx.gateway.outputs.set("entity", entityAnswer({ artifactEdits: [{ id: sleep.id, name: null, content: "texto", tags: null }] }));
    await ctx.worker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });
});
