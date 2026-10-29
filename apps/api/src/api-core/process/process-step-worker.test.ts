import { describe, expect, test } from "vitest";
import { FastStageError } from "../agent/errors/agent.errors";
import { addStep, setupProcess } from "./testing/process-test-kit";

const iso = (hour: number, minute = 0) => `2026-10-25T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;

const event = (over: Record<string, unknown> = {}) => ({
  name: "Evento", kind: "routine", startedAt: null, finishedAt: null, description: null, tags: [], ...over,
});

describe("passo de criar eventos", () => {
  test("o exemplo-guia vira tres eventos, sem nenhuma nota, num commit proprio", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-create", "many");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Refeição", kind: "meal", startedAt: iso(12) }),
      event({ name: "Nadar na praia", kind: "training", startedAt: iso(12, 30), finishedAt: iso(13, 30) }),
      event({ name: "Voltar para casa e ver o filme", startedAt: iso(15, 30) }),
    ] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    const batch = ctx.batchWriter.commits[0];
    expect(batch.events).toHaveLength(3);
    // Agentes de criacao de evento nunca criam notas: nem a nota de refeicao que o tipo implicaria.
    expect(batch.notes).toHaveLength(0);
    const meal = batch.events.find((change) => change.op === "create" && change.entity.kind === "meal");
    expect(meal && meal.op === "create" && meal.entity.noteLinks).toEqual([]);

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect(ctx.store.entityRecords.map((entity) => [entity.kind, entity.summary.name])).toEqual([
      ["event", "Refeição"], ["event", "Nadar na praia"], ["event", "Voltar para casa e ver o filme"],
    ]);
    expect(ctx.store.jobs.filter((job) => job.kind === "process-finalize")).toEqual([
      { kind: "process-finalize", processId: "p1", stepId: "s1" },
    ]);
  });

  test("so recebe o pedido: o agente de criacao nao tem ferramenta de consulta nem pergunta", async () => {
    const ctx = setupProcess("Almocei agora");
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ name: "Almoço", kind: "meal" })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.gateway.calls).toHaveLength(1);
    const call = ctx.gateway.calls[0];
    expect(call.stage).toBe("process");
    expect(call.user).toContain("Almocei agora");
    expect(Object.keys((call.schema as { properties: object }).properties)).toEqual(["events"]);
    expect(JSON.stringify(call.schema)).not.toMatch(/clarification|question/i);
  });

  test("evento sobreposto a outro e gravado como esta: nenhum evento existente e deslocado", async () => {
    const ctx = setupProcess();
    const first = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Reunião", startedAt: iso(20, 30), finishedAt: iso(21, 30) }),
    ] });
    await ctx.worker.run("event-create", first);

    const second = await addStep(ctx, "s2", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [
      event({ name: "Jogar cartas", startedAt: iso(20), finishedAt: iso(21) }),
    ] });
    await ctx.worker.run("event-create", second);

    const batch = ctx.batchWriter.commits[1];
    expect(batch.events.map((change) => change.op)).toEqual(["create"]);
    const meeting = [...ctx.database.events.values()].find((candidate) => candidate.name === "Reunião");
    expect(meeting?.startedAt.toISOString()).toBe(new Date(iso(20, 30)).toISOString());
  });

  test("horario invalido do modelo cai no padrao em vez de derrubar o passo", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event({ startedAt: "amanhã cedo", finishedAt: "x" })] });

    await ctx.worker.run("event-create", payload);

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect(ctx.store.entityRecords[0].summary.startedAt).toBeUndefined();
  });
});

describe("passo de criar tarefas e notas", () => {
  test("tarefa nova com padrao do servidor para o que o usuario nao disse", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [
      { name: "Pagar o aluguel", description: null, priority: null, status: null, tags: [], estimatedFinishAt: null },
    ] });

    await ctx.worker.run("task-create", payload);

    expect(ctx.batchWriter.commits[0].tasks).toHaveLength(1);
    expect(ctx.store.entityRecords[0]).toMatchObject({ kind: "task", operation: "create" });
  });

  test("nota de refeicao e gravada mesmo sem evento: a finalizacao vincula depois", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "note-create");
    ctx.gateway.outputs.set("note_create", { notes: [
      { type: "meal", name: "Arroz e feijão", content: "300g de arroz, 200g de feijão" },
    ] });

    await ctx.worker.run("note-create", payload);

    const batch = ctx.batchWriter.commits[0];
    expect(batch.notes).toHaveLength(1);
    expect(batch.notes[0]).toMatchObject({ op: "create", entity: { type: "meal" } });
    expect(ctx.store.entityRecords[0].summary).toMatchObject({ noteType: "meal", text: "300g de arroz, 200g de feijão" });
  });

  test("nota de texto", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "note-create");
    ctx.gateway.outputs.set("note_create", { notes: [{ type: "text", name: "Ideia", content: "Visão semanal" }] });
    await ctx.worker.run("note-create", payload);
    expect(ctx.batchWriter.commits[0].notes[0]).toMatchObject({ entity: { type: "text" } });
  });
});

describe("falha de passo", () => {
  test.each([
    ["modelo estoura o tempo", new FastStageError("process", "timeout"), "agent_timeout"],
    ["modelo responde fora do schema", new FastStageError("process", "invalid"), "agent_invalid"],
    ["erro inesperado", new Error("boom"), "internal"],
  ])("%s: passo vermelho, nada gravado, finalizacao enfileirada", async (_, error, code) => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.failure = error;

    await ctx.worker.run("event-create", payload);

    expect(ctx.batchWriter.commits).toHaveLength(0);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: code });
    expect(ctx.store.jobs.filter((job) => job.kind === "process-finalize")).toHaveLength(1);
    // O passo nunca e refeito dentro do worker.
    expect(ctx.gateway.calls).toHaveLength(1);
  });

  test("agente que nao acha nada para criar falha com codigo, sem perguntar", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [] });
    await ctx.worker.run("event-create", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "empty" });
  });

  test("passo ja concluido nao roda de novo", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-create");
    ctx.gateway.outputs.set("event_create", { events: [event()] });
    await ctx.worker.run("event-create", payload);
    await ctx.worker.run("event-create", payload);
    expect(ctx.batchWriter.commits).toHaveLength(1);
  });
});
