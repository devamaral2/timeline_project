import { describe, expect, test } from "vitest";
import { FastStageError } from "../agent/errors/agent.errors";
import { addStep, setupRequest } from "./testing/request-test-kit";

const iso = (hour: number, minute = 0) => `2026-10-25T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;

const event = (over: Record<string, unknown> = {}) => ({
  name: "Evento", kind: "common", status: null, priority: null, longRunning: false, startedAt: null,
  estimatedFinishAt: null, description: null, tags: [], followsFrom: [], ...over,
});

const finalizeJobs = (ctx: ReturnType<typeof setupRequest>) => ctx.store.jobs.filter((job) => job.kind === "request-finalize");

describe("passo de criar eventos", () => {
  test("o exemplo-guia vira tres eventos, sem nenhum artefato, num commit proprio", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Refeição", kind: "meal", startedAt: iso(12) }),
      event({ name: "Nadar na praia", kind: "training", startedAt: iso(12, 30), estimatedFinishAt: iso(13, 30) }),
      event({ name: "Voltar para casa e ver o filme", startedAt: iso(15, 30) }),
    ] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    const batch = ctx.batchWriter.commits[0];
    expect(batch?.tasks).toHaveLength(3);
    // O agente de criacao de evento nunca cria artefatos: nem o alimento que a refeicao implicaria.
    expect(batch?.artifacts).toHaveLength(0);
    const meal = batch?.tasks.find((change) => change.op === "create" && change.entity.kind === "meal");
    expect(meal && meal.op === "create" && meal.entity.artifactLinks).toEqual([]);

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    expect((await ctx.store.entities("r1")).map((entity) => [entity.kind, entity.operation, entity.summary.name])).toEqual([
      ["event", "create", "Refeição"], ["event", "create", "Nadar na praia"], ["event", "create", "Voltar para casa e ver o filme"],
    ]);
    expect(finalizeJobs(ctx)).toEqual([{ kind: "request-finalize", requestId: "r1", stepId: "s1" }]);
  });

  test("so recebe o pedido: o agente de criacao nao tem ferramenta de consulta nem pergunta", async () => {
    const ctx = setupRequest("Almocei agora");
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ name: "Almoço", kind: "meal" })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.gateway.calls).toHaveLength(1);
    const call = ctx.gateway.calls[0];
    expect(call?.user).toContain("Almocei agora");
    expect(Object.keys((call?.schema.properties ?? {}) as object)).toEqual(["events"]);
    expect(JSON.stringify(call?.schema)).not.toMatch(/clarification|question/i);
  });

  test("algo a fazer e um evento com status, sem data; o que so marca um horario nasce de referencia", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Pagar o aluguel", status: "todo", priority: "high" }),
      event({ name: "Reunião", startedAt: iso(15), estimatedFinishAt: iso(16) }),
    ] });

    await ctx.worker.run("event-create", payload);

    const [tracked, reference] = ctx.database.events;
    expect(tracked).toMatchObject({ name: "Pagar o aluguel", status: "todo", priority: "high", startedAt: undefined });
    expect(reference).toMatchObject({ name: "Reunião", status: undefined });
    expect(reference?.isReference).toBe(true);
  });

  test("o lugar dito vira o endereco achado no mapa, procurado perto de onde a pessoa esta", async () => {
    const ctx = setupRequest("Quero ir à clínica Saúde Emocional amanhã às 10h");
    const here = { latitude: -19.92, longitude: -43.94 };
    ctx.request.context = { screen: "chat", coordinates: here };
    ctx.places.addresses.set("clínica Saúde Emocional", "Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Ir à clínica", location: "clínica Saúde Emocional" }),
      event({ name: "Almoço", kind: "meal" }),
    ] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.places.calls).toEqual([{ said: "clínica Saúde Emocional", near: here }]);
    const [clinic, lunch] = ctx.database.events;
    expect(clinic?.location).toBe("Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    // Sem lugar dito, nada e procurado no mapa.
    expect(lunch?.location).toBe("");
  });

  test("lugar que o mapa nao conhece fica como o usuario disse", async () => {
    const ctx = setupRequest("Jantar na casa da tia Lúcia");
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ name: "Jantar", kind: "meal", location: "casa da tia Lúcia" })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.database.events[0]?.location).toBe("casa da tia Lúcia");
  });

  test("a ordem declarada entre eventos da mesma lista vira sequencia no lote, sem revisar nenhum evento", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Organizar a festa", status: "todo" }),
      event({ name: "Comprar o bolo", status: "todo", followsFrom: [0] }),
      event({ name: "Servir o bolo", status: "todo", followsFrom: [0, 1] }),
    ] });

    await ctx.worker.run("event-create", payload);

    const byName = async (name: string) => {
      const created = ctx.database.events.find((candidate) => candidate.name === name);
      return ctx.eventRepository.findById(created?.id as string);
    };
    const [party, cake, serve] = [await byName("Organizar a festa"), await byName("Comprar o bolo"), await byName("Servir o bolo")];
    // Quem se segue de quem e lido das arestas; todos nascem na revisao 1.
    expect(cake?.previousIds).toEqual([party?.id]);
    expect(serve?.previousIds).toEqual([party?.id, cake?.id]);
    expect(party?.nextIds).toEqual([cake?.id, serve?.id]);
    expect(cake?.nextIds).toEqual([serve?.id]);
    expect([party, cake, serve].map((candidate) => candidate?.revision)).toEqual([1, 1, 1]);
    expect(ctx.batchWriter.commits[0]?.tasks.map((change) => change.op)).toEqual(["create", "create", "create"]);
    expect(ctx.batchWriter.commits[0]?.sequence).toEqual([
      { op: "add", fromId: party?.id, toId: cake?.id },
      { op: "add", fromId: party?.id, toId: serve?.id },
      { op: "add", fromId: cake?.id, toId: serve?.id },
    ]);
  });

  test("a mesma posicao repetida em followsFrom grava uma aresta so", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Antes", status: "todo" }),
      event({ name: "Depois", status: "todo", followsFrom: [0, 0] }),
    ] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.database.edges).toHaveLength(1);
    expect(ctx.batchWriter.commits[0]?.sequence).toHaveLength(1);
  });

  test("uma lista sem followsFrom nao grava sequencia", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [event({ status: "todo" }), event({ status: "todo" })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.database.edges).toEqual([]);
    expect(ctx.batchWriter.commits[0]?.sequence ?? []).toEqual([]);
  });

  test("uma posicao que nao existe na lista derruba o passo, sem gravar nada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ status: "todo", followsFrom: [3] })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("um evento que se segue dele mesmo derruba o passo, sem gravar nada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ status: "todo", followsFrom: [0] })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("dois eventos que se seguem um ao outro formam ciclo e derrubam o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "A", status: "todo", followsFrom: [1] }),
      event({ name: "B", status: "todo", followsFrom: [0] }),
    ] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed" });
  });

  test("horario invalido do modelo cai no padrao em vez de derrubar o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ startedAt: "amanhã cedo", estimatedFinishAt: "x" })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    // Evento de referencia sem inicio dito comeca no instante do pedido.
    expect(ctx.database.events[0]?.startedAt).toEqual(ctx.request.createdAt);
  });
});

describe("passo de criar artefatos", () => {
  test("o alimento e gravado pendente mesmo sem evento: a finalizacao o liga depois", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "artifact-create");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [
      { type: "food", name: "Arroz e feijão", content: "300g de arroz, 200g de feijão" },
    ] });

    await ctx.worker.run("artifact-create", payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.artifacts).toHaveLength(1);
    expect(batch?.artifacts[0]).toMatchObject({
      op: "create", entity: { type: "food", name: "Arroz e feijão", data: { generation: { status: "pending" } } },
    });
    expect((await ctx.store.entities("r1"))[0]).toMatchObject({
      kind: "artifact", operation: "create", summary: { artifactType: "food", text: "300g de arroz, 200g de feijão" },
    });
  });

  test("artefato de texto", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "artifact-create");
    ctx.gateway.outputs.set("artifact_create", { artifacts: [{ type: "text", name: "Ideia", content: "Visão semanal" }] });
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
    const payload = await addStep(ctx, "s1", "recurring-event-create");
    ctx.gateway.outputs.set("recurring_event_create", { series: [series()] });

    await ctx.worker.run("recurring-event-create", payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch?.recurrences).toHaveLength(1);
    expect(batch?.tasks).toHaveLength(1);
    const [entity] = await ctx.store.entities("r1");
    expect(entity).toMatchObject({ kind: "event", operation: "create", summary: { name: "Corrida", series: true } });
  });

  test("o lugar dito na serie vira o endereco achado no mapa, e a ocorrencia nasce com ele", async () => {
    const ctx = setupRequest("tenho terapia na saude emocional quarta 13 horas");
    const here = { latitude: -19.92, longitude: -43.94 };
    ctx.request.context = { screen: "chat", coordinates: here };
    ctx.places.addresses.set("saude emocional", "Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
    const payload = await addStep(ctx, "s1", "recurring-event-create");
    ctx.gateway.outputs.set("recurring_event_create", { series: [series({
      name: "Terapia", kind: "common", frequency: "weekly", weekdays: ["wed"], timeOfDay: "13:00", location: "saude emocional",
    })] });

    await ctx.worker.run("recurring-event-create", payload);

    expect(ctx.places.calls).toEqual([{ said: "saude emocional", near: here }]);
    expect(ctx.database.events[0]?.location).toBe("Clínica Saúde Emocional, Rua dos Timbiras 100, Belo Horizonte");
  });

  test("a serie de algo a fazer gera ocorrencias acompanhadas", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "recurring-event-create");
    ctx.gateway.outputs.set("recurring_event_create", { series: [
      series({ name: "Pagar o aluguel", kind: "common", status: "todo", priority: "high", frequency: "monthly", monthDay: 5, timeOfDay: null, durationMinutes: null }),
    ] });

    await ctx.worker.run("recurring-event-create", payload);

    expect(ctx.recurrences.recurrences[0]?.template).toMatchObject({ name: "Pagar o aluguel", status: "todo", priority: "high" });
    expect(ctx.database.events[0]).toMatchObject({ status: "todo", priority: "high" });
  });

  test("regra que contradiz o que foi dito derruba o passo", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "recurring-event-create");
    ctx.gateway.outputs.set("recurring_event_create", { series: [series({ weekdays: ["mon"] })] });
    await ctx.worker.run("recurring-event-create", payload);
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
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.failure = error;

    await ctx.worker.run("event-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: code });
    expect(finalizeJobs(ctx)).toHaveLength(1);
    // O passo nunca e refeito dentro do worker.
    expect(ctx.gateway.calls).toHaveLength(1);
  });

  test("agente que nao acha nada para criar falha com codigo, sem perguntar", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [] });
    await ctx.worker.run("event-create", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "empty" });
  });

  test("passo ja concluido nao roda de novo, e o de um pedido cancelado nem comeca", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event()] });
    await ctx.worker.run("event-create", payload);
    await ctx.worker.run("event-create", payload);
    expect(ctx.batchWriter.commits).toHaveLength(1);

    const second = await addStep(ctx, "s2", "event-create");
    await ctx.store.cancel("r1");
    await ctx.worker.run("event-create", second);
    expect(ctx.batchWriter.commits).toHaveLength(1);
    expect(ctx.store.stepRecords[1]?.status).toBe("cancel");
  });
});
