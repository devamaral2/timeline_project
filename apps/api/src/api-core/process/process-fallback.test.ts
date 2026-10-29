import { describe, expect, test } from "vitest";
import { FastStageError } from "../agent/errors/agent.errors";
import { ProcessFallback } from "./process-fallback";
import { toProcessView } from "./process-view";
import { addStep, setupProcess } from "./testing/process-test-kit";

async function fallbackStep(prompt = "qual a capital da França?") {
  const ctx = setupProcess(prompt);
  await ctx.store.beginSteps("p1", [{ id: "f1", agent: "fallback", expected: "one" }], {});
  const fallback = new ProcessFallback({ store: ctx.store, runner: ctx.runner });
  return { ctx, fallback, payload: { processId: "p1", stepId: "f1" } };
}

describe("fila de fallback", () => {
  test("responde o pedido sem relacao com as entidades e encerra o processo", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.outputs.set("fallback", { reply: "Paris.", invoke: null });

    await fallback.run(payload);

    expect(ctx.store.require("p1")).toMatchObject({ status: "completed", response: { text: "Paris.", failedSteps: [] } });
    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect(ctx.batchWriter.commits).toHaveLength(0);
  });

  test("pedido que pede acoes: chama os especialistas pelo mesmo mecanismo do despacho e termina o seu passo", async () => {
    const { ctx, fallback, payload } = await fallbackStep("almocei e conclui o aluguel");
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: [
      { agent: "event-create", instruction: "Criar o evento do almoço" },
      { agent: "task-edit", instruction: "Concluir a tarefa do aluguel" },
    ] });

    await fallback.run(payload);

    expect(ctx.store.stepRecords.map((step) => [step.agent, step.status, step.input?.instruction])).toEqual([
      ["fallback", "succeeded", undefined],
      ["event-create", "pending", "Criar o evento do almoço"],
      ["task-edit", "pending", "Concluir a tarefa do aluguel"],
    ]);
    expect(ctx.store.jobs.filter((job) => job.kind !== "process-dispatch").map((job) => job.kind)).toEqual([
      "process-fallback", "process-event-create", "process-task-edit",
    ]);
    // O processo segue aberto: os passos chamados ainda vao rodar.
    expect(ctx.store.require("p1").status).toBe("running");
  });

  test("o foco do orquestrador chega ao especialista junto do pedido inteiro", async () => {
    const { ctx, fallback, payload } = await fallbackStep("almocei e conclui o aluguel");
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: [{ agent: "event-create", instruction: "Criar o evento do almoço" }] });
    await fallback.run(payload);
    ctx.gateway.outputs.set("event_create", { events: [
      { name: "Almoço", kind: "meal", startedAt: null, finishedAt: null, description: null, tags: [] },
    ] });

    await ctx.worker.run("event-create", { processId: "p1", stepId: ctx.store.stepRecords[1].id });

    const call = ctx.gateway.calls.at(-1);
    expect(call?.user).toContain("Foco (dado pelo orquestrador): Criar o evento do almoço");
    expect(call?.user).toContain("almocei e conclui o aluguel");
  });

  test("limita quantos especialistas chama e nunca chama a si mesmo", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: Array.from({ length: 9 }, () => ({ agent: "task-create", instruction: "x" })) });
    await fallback.run(payload);
    expect(ctx.store.stepRecords.filter((step) => step.agent === "task-create")).toHaveLength(6);
    expect(ctx.store.stepRecords.filter((step) => step.agent === "fallback")).toHaveLength(1);
    // O schema nem aceita "fallback" como especialista.
    expect(JSON.stringify(ctx.gateway.calls[0].schema)).not.toMatch(/"fallback"/);
  });

  test("sem resposta e sem especialistas: passo vermelho, sem perguntar", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: null });
    await fallback.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "empty" });
  });

  test("falha do agente vira passo vermelho e a finalizacao fecha o processo", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.failure = new FastStageError("process", "timeout");

    await fallback.run(payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    expect(ctx.store.jobs.at(-1)).toMatchObject({ kind: "process-finalize", stepId: "f1" });
  });
});

describe("caixa de processo", () => {
  test("titulo e rotulos predefinidos; falha vira a linha predefinida, sem modelo", async () => {
    const ctx = setupProcess();
    await addStep(ctx, "s1", "event-create");
    await addStep(ctx, "s2", "note-create");
    ctx.store.stepRecords[0].status = "succeeded";
    await ctx.store.failStep({ processId: "p1", stepId: "s2", errorCode: "agent_timeout" });
    await ctx.store.finish("p1", "completed", { failedSteps: [{ agent: "note-create", errorCode: "agent_timeout" }] });

    const view = toProcessView(ctx.store.require("p1"), ctx.store.stepRecords, []);

    expect(view.title).toBe("Realizando processos:");
    expect(view.steps.map((step) => [step.label, step.status])).toEqual([
      ["Criando eventos", "succeeded"], ["Criando notas", "failed"],
    ]);
    expect(view.message).toBe("Não consegui concluir: criando notas.");
  });

  test("a explicacao do agente substitui a linha predefinida quando existe", async () => {
    const ctx = setupProcess();
    await addStep(ctx, "s1", "note-create");
    await ctx.store.finish("p1", "failed", {
      failedSteps: [{ agent: "note-create", errorCode: "agent_timeout" }], explanation: "Não consegui criar a nota agora.",
    });
    expect(toProcessView(ctx.store.require("p1"), ctx.store.stepRecords, []).message).toBe("Não consegui criar a nota agora.");
  });

  test("sucesso total nao tem mensagem: so a lista de passos com seus checks", async () => {
    const ctx = setupProcess();
    await addStep(ctx, "s1", "event-create");
    ctx.store.stepRecords[0].status = "succeeded";
    await ctx.store.finish("p1", "completed", { failedSteps: [] });
    expect(toProcessView(ctx.store.require("p1"), ctx.store.stepRecords, []).message).toBeUndefined();
  });
});
