import { describe, expect, test } from "vitest";
import { FastStageError } from "../agent/errors/agent.errors";
import { addStep, setupRequest } from "./testing/request-test-kit";

const iso = (hour: number, minute = 0) => `2026-10-25T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;

const task = (over: Record<string, unknown> = {}) => ({
  name: "Tarefa", kind: "common", status: null, priority: null, longRunning: false, startedAt: null,
  estimatedFinishAt: null, description: null, tags: [], subtaskOf: null, foods: null, foodName: null, ...over,
});

/** O artefato que o lote cria na posicao dada. */
const createdArtifact = (change: { op: string; entity?: { id: string; name: string } } | undefined) =>
  change?.op === "create" ? change.entity : undefined;

const finalizeJobs = (ctx: ReturnType<typeof setupRequest>) => ctx.store.jobs.filter((job) => job.kind === "request-finalize");

describe("passo de criar tarefas", () => {
  test("o exemplo-guia vira tres tarefas num commit proprio, e a refeicao nasce com o alimento ligado", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create", "many");
    ctx.gateway.outputs.set("task_create", { tasks: [
      task({ name: "Refeição", kind: "meal", startedAt: iso(12), foods: "300g de arroz, 200g de feijão", foodName: "Arroz e feijão" }),
      task({ name: "Nadar na praia", kind: "training", startedAt: iso(12, 30), estimatedFinishAt: iso(13, 30) }),
      task({ name: "Voltar para casa e ver o filme", startedAt: iso(15, 30) }),
    ] });

    await ctx.worker.run("task-create", payload);

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

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
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
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ name: "Almoço", kind: "meal" })] });

    await ctx.worker.run("task-create", payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.artifacts).toHaveLength(1);
    // Sem o que foi comido, o alimento leva o nome da refeicao.
    expect(batch?.artifacts[0]).toMatchObject({ entity: { type: "food", name: "Almoço", data: { description: "Almoço" } } });
    expect(ctx.database.tasks[0]?.artifactLinks).toEqual([
      { artifactId: createdArtifact(batch?.artifacts[0])?.id, relation: "creates", fromRecurrence: false },
    ]);
  });

  test("so recebe o pedido: o agente de criacao nao tem ferramenta de consulta nem pergunta", async () => {
    const ctx = setupRequest("Almocei agora");
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ name: "Almoço", kind: "meal" })] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.gateway.calls).toHaveLength(1);
    const call = ctx.gateway.calls[0];
    expect(call?.user).toContain("Almocei agora");
    expect(Object.keys((call?.schema.properties ?? {}) as object)).toEqual(["tasks"]);
    expect(JSON.stringify(call?.schema)).not.toMatch(/clarification|question/i);
  });

  test("algo a fazer e uma tarefa com status, sem data; o que so marca um horario nasce de referencia", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create", "many");
    ctx.gateway.outputs.set("task_create", { tasks: [
      task({ name: "Pagar o aluguel", status: "todo", priority: "high" }),
      task({ name: "Reunião", startedAt: iso(15), estimatedFinishAt: iso(16) }),
    ] });

    await ctx.worker.run("task-create", payload);

    const [tracked, reference] = ctx.database.tasks;
    expect(tracked).toMatchObject({ name: "Pagar o aluguel", status: "todo", priority: "high", startedAt: undefined });
    expect(reference).toMatchObject({ name: "Reunião", status: undefined });
    expect(reference?.isReference).toBe(true);
  });

  test("o lugar dito vira o endereco achado no mapa; sem lugar dito, a tarefa nasce sem local", async () => {
    const ctx = setupRequest("Quero ir à clínica Saúde Emocional amanhã às 10h");
    ctx.places.addresses.set("clínica Saúde Emocional", "Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    const payload = await addStep(ctx, "s1", "task-create", "many");
    ctx.gateway.outputs.set("task_create", { tasks: [
      task({ name: "Ir à clínica", location: "clínica Saúde Emocional" }),
      task({ name: "Almoço", kind: "meal" }),
    ] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.places.calls).toEqual([{ said: "clínica Saúde Emocional" }]);
    const [clinic, lunch] = ctx.database.tasks;
    expect(clinic?.location).toBe("Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    // Sem lugar dito, nada e procurado no mapa.
    expect(lunch?.location).toBeUndefined();
  });

  test("lugar que o mapa nao conhece fica como o usuario disse", async () => {
    const ctx = setupRequest("Jantar na casa da tia Lúcia");
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ name: "Jantar", kind: "meal", location: "casa da tia Lúcia" })] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.database.tasks[0]?.location).toBe("casa da tia Lúcia");
  });

  test("a tarefa declarada como parte de outra da mesma lista vira subtarefa no lote, sem revisar nenhuma tarefa", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create", "many");
    ctx.gateway.outputs.set("task_create", { tasks: [
      task({ name: "Organizar a festa", status: "todo" }),
      task({ name: "Comprar o bolo", status: "todo", subtaskOf: 0 }),
      task({ name: "Servir o bolo", status: "todo", subtaskOf: 0 }),
    ] });

    await ctx.worker.run("task-create", payload);

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
    const payload = await addStep(ctx, "s1", "task-create", "many");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ status: "todo" }), task({ status: "todo" })] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.database.edges).toEqual([]);
    expect(ctx.batchWriter.commits[0]?.subtasks ?? []).toEqual([]);
  });

  test("uma posicao que nao existe na lista derruba o passo, sem gravar nada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ status: "todo", subtaskOf: 3 })] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("uma tarefa subtarefa dela mesma derruba o passo, sem gravar nada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ status: "todo", subtaskOf: 0 })] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("duas tarefas subtarefas uma da outra formam ciclo e derrubam o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create", "many");
    ctx.gateway.outputs.set("task_create", { tasks: [
      task({ name: "A", status: "todo", subtaskOf: 1 }),
      task({ name: "B", status: "todo", subtaskOf: 0 }),
    ] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed" });
  });

  test("horario invalido do modelo cai no padrao em vez de derrubar o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task({ startedAt: "amanhã cedo", estimatedFinishAt: "x" })] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    // Tarefa de referencia sem inicio dito comeca no instante do pedido.
    expect(ctx.database.tasks[0]?.startedAt).toEqual(ctx.request.createdAt);
  });
});

describe("passo de criar artefatos", () => {
  test("sem passo de tarefas, o alimento vira refeicao: tarefa e alimento ligados no mesmo lote", async () => {
    const ctx = setupRequest("vou comer 200g de arroz daqui 3 min");
    const payload = await addStep(ctx, "s1", "artifact-create");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [
      { type: "food", name: "Arroz", content: "200g de arroz", startedAt: iso(12, 3) },
    ] });

    await ctx.worker.run("artifact-create", payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.artifacts).toHaveLength(1);
    expect(batch?.artifacts[0]).toMatchObject({
      op: "create", entity: { type: "food", name: "Arroz", data: { description: "200g de arroz", generation: { status: "pending" } } },
    });
    const food = createdArtifact(batch?.artifacts[0]);
    // A tarefa leva o nome da refeicao pelo horario; o alimento, o do que foi comido.
    expect(ctx.database.tasks).toHaveLength(1);
    expect(ctx.database.tasks[0]).toMatchObject({
      kind: "meal", name: "Almoço", startedAt: new Date(iso(12, 3)),
      artifactLinks: [{ artifactId: food?.id, relation: "creates", fromRecurrence: false }],
    });
    const entities = await ctx.store.entities("r1");
    expect(entities.map((entity) => [entity.kind, entity.finalized])).toEqual([["task", false], ["artifact", true]]);
    expect(entities[1]?.links).toEqual([{ from: { kind: "artifact", id: food?.id }, to: { kind: "task", id: ctx.database.tasks[0]?.id } }]);
  });

  test("com passo de tarefas no pedido, o alimento fica para ele: nada de refeicao em dobro", async () => {
    const ctx = setupRequest("comendo 300g de arroz e anota a ideia da visão semanal");
    await addStep(ctx, "s0", "task-create");
    const payload = await addStep(ctx, "s1", "artifact-create", "many");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [
      { type: "food", name: "Arroz", content: "300g de arroz", startedAt: null },
      { type: "text", name: "Ideia", content: "Visão semanal", startedAt: null },
    ] });

    await ctx.worker.run("artifact-create", payload);

    expect(ctx.batchWriter.commits[0]?.artifacts.map((change) => change.op === "create" ? change.entity.type : change.op)).toEqual(["text"]);
    expect(ctx.database.tasks).toEqual([]);
    expect(ctx.store.stepRecords.find((step) => step.id === "s1")?.status).toBe("done");
  });

  test("so com o alimento deixado para o passo de tarefas, o passo termina sem criar nada e sem falhar", async () => {
    const ctx = setupRequest("comendo 300g de arroz");
    await addStep(ctx, "s0", "task-create");
    const payload = await addStep(ctx, "s1", "artifact-create");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [{ type: "food", name: "Arroz", content: "300g de arroz", startedAt: null }] });

    await ctx.worker.run("artifact-create", payload);

    expect(ctx.store.stepRecords.find((step) => step.id === "s1")?.status).toBe("done");
    expect(await ctx.store.entities("r1")).toEqual([]);
  });

  test("se o passo de tarefas ja falhou, o alimento vira refeicao aqui", async () => {
    const ctx = setupRequest("comendo 300g de arroz");
    await addStep(ctx, "s0", "task-create");
    await ctx.store.failStep({ requestId: "r1", stepId: "s0", errorCode: "empty" });
    const payload = await addStep(ctx, "s1", "artifact-create");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [{ type: "food", name: "Arroz", content: "300g de arroz", startedAt: null }] });

    await ctx.worker.run("artifact-create", payload);

    expect(ctx.database.tasks).toMatchObject([{ kind: "meal", startedAt: ctx.request.createdAt }]);
    expect(ctx.batchWriter.commits[0]?.artifacts).toHaveLength(1);
  });

  test("artefato de texto", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "artifact-create");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [{ type: "text", name: "Ideia", content: "Visão semanal", startedAt: null }] });
    await ctx.worker.run("artifact-create", payload);
    expect(ctx.batchWriter.commits[0]?.artifacts[0]).toMatchObject({ entity: { type: "text", data: { body: "Visão semanal" } } });
  });
});

describe("passo de criar series", () => {
  const series = (over: Record<string, unknown> = {}) => ({
    name: "Corrida", kind: "training", status: null, priority: null, description: null, tags: [], frequency: "daily",
    interval: null, weekdays: null, monthDay: null, month: null, timeOfDay: "07:00", durationMinutes: 60,
    startsOn: null, endsOn: null, ...over,
  });

  test("a serie entra com a primeira ocorrencia no mesmo lote, e e a ocorrencia que o pedido mostra", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "recurring-task-create");
    ctx.gateway.outputs.set("recurring_task_create", { series: [series()] });

    await ctx.worker.run("recurring-task-create", payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.recurrences).toHaveLength(1);
    expect(batch?.tasks).toHaveLength(1);
    const [entity] = await ctx.store.entities("r1");
    expect(entity).toMatchObject({ kind: "task", operation: "create", summary: { name: "Corrida", series: true } });
  });

  test("o lugar dito na serie vira o endereco achado no mapa, e a ocorrencia nasce com ele", async () => {
    const ctx = setupRequest("tenho terapia na saude emocional quarta 13 horas");
    ctx.places.addresses.set("saude emocional", "Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    const payload = await addStep(ctx, "s1", "recurring-task-create");
    ctx.gateway.outputs.set("recurring_task_create", { series: [series({
      name: "Terapia", kind: "common", frequency: "weekly", weekdays: ["wed"], timeOfDay: "13:00", location: "saude emocional",
    })] });

    await ctx.worker.run("recurring-task-create", payload);

    expect(ctx.places.calls).toEqual([{ said: "saude emocional" }]);
    expect(ctx.database.tasks[0]?.location).toBe("Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
  });

  test("a serie de algo a fazer gera ocorrencias acompanhadas", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "recurring-task-create");
    ctx.gateway.outputs.set("recurring_task_create", { series: [
      series({ name: "Pagar o aluguel", kind: "common", status: "todo", priority: "high", frequency: "monthly", monthDay: 5, timeOfDay: null, durationMinutes: null }),
    ] });

    await ctx.worker.run("recurring-task-create", payload);

    expect(ctx.recurrences.recurrences[0]?.template).toMatchObject({ name: "Pagar o aluguel", status: "todo", priority: "high" });
    expect(ctx.database.tasks[0]).toMatchObject({ status: "todo", priority: "high" });
  });

  test("regra que contradiz o que foi dito derruba o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "recurring-task-create");
    ctx.gateway.outputs.set("recurring_task_create", { series: [series({ weekdays: ["mon"] })] });
    await ctx.worker.run("recurring-task-create", payload);
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
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.failure = error;

    await ctx.worker.run("task-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: code });
    expect(finalizeJobs(ctx)).toHaveLength(1);
    // O passo nunca e refeito dentro do worker.
    expect(ctx.gateway.calls).toHaveLength(1);
  });

  test("agente que nao acha nada para criar falha com codigo, sem perguntar", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [] });
    await ctx.worker.run("task-create", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "empty" });
  });

  test("passo ja concluido nao roda de novo, e o de um pedido cancelado nem comeca", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [task()] });
    await ctx.worker.run("task-create", payload);
    await ctx.worker.run("task-create", payload);
    expect(ctx.batchWriter.commits).toHaveLength(1);

    const second = await addStep(ctx, "s2", "task-create");
    await ctx.store.cancel("r1");
    await ctx.worker.run("task-create", second);
    expect(ctx.batchWriter.commits).toHaveLength(1);
    expect(ctx.store.stepRecords[1]?.status).toBe("cancel");
  });
});
