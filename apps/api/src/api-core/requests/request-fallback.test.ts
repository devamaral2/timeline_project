import { describe, expect, test } from "vitest";
import { FastStageError } from "../agent/errors/agent.errors";
import { RequestAgentRunner } from "./request-agent-runner";
import { RequestFallback } from "./request-fallback";
import { RequestQueryWorker } from "./request-query-worker";
import { toRequestDto } from "./request-view";
import { addStep, result, scriptedJev, setupRequest } from "./testing/request-test-kit";

async function fallbackStep(prompt = "qual a capital da França?") {
  const ctx = setupRequest(prompt);
  await ctx.store.beginSteps("r1", [{ id: "f1", agent: "fallback", expected: "one" }]);
  const fallback = new RequestFallback({ store: ctx.store, runner: ctx.runner });
  return { ctx, fallback, payload: { requestId: "r1", stepId: "f1" } };
}

describe("fila de fallback", () => {
  test("responde o pedido sem relacao com as entidades e encerra o pedido", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.outputs.set("fallback", { reply: "Paris.", invoke: null });

    await fallback.run(payload);

    expect(ctx.store.require("r1")).toMatchObject({ status: "done", answer: "Paris.", failedSteps: [] });
    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    expect(ctx.batchWriter.commits).toHaveLength(0);
  });

  test("pedido que pede acoes: chama os especialistas pelo mesmo mecanismo do despacho e termina o seu passo", async () => {
    const { ctx, fallback, payload } = await fallbackStep("almocei e conclui o aluguel");
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: [
      { agent: "task-create", instruction: "Criar a tarefa do almoço" },
      { agent: "task-edit", instruction: "Concluir a tarefa do aluguel" },
    ] });

    await fallback.run(payload);

    expect(ctx.store.stepRecords.map((step) => [step.agent, step.status, step.input?.instruction])).toEqual([
      ["fallback", "done", undefined],
      ["task-create", "queued", "Criar a tarefa do almoço"],
      ["task-edit", "queued", "Concluir a tarefa do aluguel"],
    ]);
    expect(ctx.store.jobs.map((job) => job.kind)).toEqual(["request-fallback", "request-step", "request-step"]);
    // O pedido segue aberto: os passos chamados ainda vao rodar.
    expect(ctx.store.require("r1").status).toBe("running");
  });

  test("o foco do orquestrador chega ao especialista junto do pedido inteiro", async () => {
    const { ctx, fallback, payload } = await fallbackStep("almocei e conclui o aluguel");
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: [{ agent: "task-create", instruction: "Criar a tarefa do almoço" }] });
    await fallback.run(payload);
    ctx.gateway.outputs.set("task_create", { tasks: [
      { name: "Almoço", kind: "meal", status: null, priority: null, longRunning: false, startedAt: null, estimatedFinishAt: null, description: null, tags: [], followsFrom: [] },
    ] });

    await ctx.worker.run("task-create", { requestId: "r1", stepId: ctx.store.stepRecords[1]?.id as string });

    const call = ctx.gateway.calls.at(-1);
    expect(call?.user).toContain("Foco (dado pelo orquestrador): Criar a tarefa do almoço");
    expect(call?.user).toContain("almocei e conclui o aluguel");
  });

  test("limita quantos especialistas chama e nunca chama a si mesmo", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: Array.from({ length: 9 }, () => ({ agent: "task-create", instruction: "x" })) });
    await fallback.run(payload);
    expect(ctx.store.stepRecords.filter((step) => step.agent === "task-create")).toHaveLength(6);
    expect(ctx.store.stepRecords.filter((step) => step.agent === "fallback")).toHaveLength(1);
    // O schema nem aceita "fallback" como especialista.
    expect(JSON.stringify(ctx.gateway.calls[0]?.schema)).not.toMatch(/"fallback"/);
  });

  test("sem resposta e sem especialistas: passo vermelho, sem perguntar", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: null });
    await fallback.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "empty" });
  });

  test("falha do agente vira passo vermelho e a finalizacao fecha o pedido", async () => {
    const { ctx, fallback, payload } = await fallbackStep();
    ctx.gateway.failure = new FastStageError("timeout");

    await fallback.run(payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    expect(ctx.store.jobs.at(-1)).toMatchObject({ kind: "request-finalize", stepId: "f1" });
  });
});

describe("caixa do pedido", () => {
  test("rotulos predefinidos; falha vira a linha predefinida, sem modelo", async () => {
    const ctx = setupRequest();
    await addStep(ctx, "s1", "task-create");
    await addStep(ctx, "s2", "artifact-create");
    await ctx.store.recordQueryResult({ requestId: "r1", stepId: "s1", result: { columns: [], rows: [], truncated: false }, timings: {} });
    await ctx.store.failStep({ requestId: "r1", stepId: "s2", errorCode: "agent_timeout" });
    await ctx.store.finish("r1", "done", { failedSteps: [{ agent: "artifact-create", errorCode: "agent_timeout" }] });

    const view = toRequestDto(ctx.store.require("r1"), ctx.store.stepRecords, []);

    expect(view.title).toBe("pedido");
    expect(view.steps.map((step) => [step.label, step.status])).toEqual([
      ["Criando tarefas", "done"], ["Criando artefatos", "failed"],
    ]);
    expect(view.message).toBe("Não consegui concluir: criando artefatos.");
  });

  test("a explicacao do agente substitui a linha predefinida quando existe", async () => {
    const ctx = setupRequest();
    await addStep(ctx, "s1", "artifact-create");
    await ctx.store.finish("r1", "failed", {
      failedSteps: [{ agent: "artifact-create", errorCode: "agent_timeout" }], message: "Não consegui criar o artefato agora.",
    });
    expect(toRequestDto(ctx.store.require("r1"), ctx.store.stepRecords, []).message).toBe("Não consegui criar o artefato agora.");
  });

  test("sucesso total nao tem mensagem: so a lista de passos com seus checks", async () => {
    const ctx = setupRequest();
    await addStep(ctx, "s1", "task-create");
    await ctx.store.finish("r1", "done", { failedSteps: [] });
    expect(toRequestDto(ctx.store.require("r1"), ctx.store.stepRecords, []).message).toBeUndefined();
  });
});

describe("laco do fallback (comando fallback:)", () => {
  const quiet = () => scriptedJev(() => result({}));

  async function loopStep(prompt: string, sqlOutcome?: Parameters<typeof setupRequest>[1]) {
    const ctx = setupRequest(prompt, sqlOutcome);
    await ctx.store.beginSteps("r1", [{ id: "f1", agent: "fallback", expected: "one", input: { round: 1 } }]);
    const fallback = new RequestFallback({ store: ctx.store, runner: ctx.runner });
    const stepOf = (agent: string) => {
      const step = ctx.store.stepRecords.filter((candidate) => candidate.agent === agent).at(-1);
      if (!step) throw new Error(`sem passo ${agent}`);
      return { requestId: "r1", stepId: step.id };
    };
    const loopCalls = () => ctx.gateway.calls.filter((call) => call.schemaName === "fallback_loop");
    return { ctx, fallback, stepOf, loopCalls };
  }

  test("o resultado dos especialistas volta na rodada seguinte e so a resposta fecha o pedido", async () => {
    const { ctx, fallback, stepOf, loopCalls } = await loopStep("conclua as tarefas da casa", {
      ok: true, columns: ["name"], rows: [["Lavar a louça"]], truncated: false,
    });
    ctx.gateway.outputs.set("fallback_loop", { reply: null, invoke: [{ agent: "query", instruction: "Listar as tarefas da casa" }] });
    ctx.gateway.outputs.set("query", { sql: "SELECT name FROM tasks" });

    await fallback.run(stepOf("fallback"));
    expect(loopCalls()[0]?.user).toContain("Rodada: 1 de 4");
    expect(loopCalls()[0]?.user).not.toContain("Rodadas anteriores");

    await ctx.queryWorker.run(stepOf("query"));
    await ctx.finalizer(quiet().client).run(stepOf("query"));

    // A finalizacao nao fecha: enfileira a rodada 2.
    expect(ctx.store.require("r1").status).toBe("running");
    expect(ctx.store.stepRecords.map((step) => [step.agent, step.status, step.input?.round])).toEqual([
      ["fallback", "done", 1], ["query", "done", undefined], ["fallback", "queued", 2],
    ]);
    expect(ctx.store.jobs.at(-1)).toMatchObject({ kind: "request-fallback", stepId: stepOf("fallback").stepId });

    ctx.gateway.outputs.set("fallback_loop", { reply: "Há uma tarefa da casa: lavar a louça.", invoke: null });
    await fallback.run(stepOf("fallback"));

    const second = loopCalls()[1]?.user ?? "";
    expect(second).toContain("Rodada: 2 de 4");
    expect(JSON.parse(second.split("Rodadas anteriores (JSON):\n")[1] ?? "")).toEqual([{
      round: 1,
      calls: [{
        agent: "query", instruction: "Listar as tarefas da casa", status: "done",
        result: { columns: ["name"], rows: [["Lavar a louça"]], truncated: false },
      }],
    }]);
    expect(ctx.store.require("r1")).toMatchObject({
      status: "done", answer: "Há uma tarefa da casa: lavar a louça.", failedSteps: [],
    });
  });

  test("so o fallback escolhido pensa: o especialista que ele chama e o fallback do despacho nao", async () => {
    const { ctx, stepOf, loopCalls } = await loopStep("quantos tarefas tenho?", {
      ok: true, columns: ["total"], rows: [[3]], truncated: false,
    });
    const runner = new RequestAgentRunner(ctx.gateway, { thoughts: ctx.store, reasoning: "low" });
    const fallback = new RequestFallback({ store: ctx.store, runner });
    ctx.gateway.outputs.set("fallback_loop", { reply: null, invoke: [{ agent: "query", instruction: "Contar as tarefas" }] });
    ctx.gateway.outputs.set("query", { sql: "SELECT count(*) FROM tasks" });

    await fallback.run(stepOf("fallback"));
    await new RequestQueryWorker({ store: ctx.store, runner, sql: ctx.sql }).run(stepOf("query"));

    expect(loopCalls()[0]).toMatchObject({ reasoning: "low" });
    expect(ctx.gateway.calls.at(-1)).toMatchObject({ schemaName: "query" });
    expect(ctx.gateway.calls.at(-1)).not.toHaveProperty("reasoning");

    // O fallback a que o despacho chega sozinho e chamada unica, sem raciocinio.
    await ctx.store.beginSteps("r1", [{ id: "f9", agent: "fallback", expected: "one" }]);
    ctx.gateway.outputs.set("fallback", { reply: "Três.", invoke: null });
    await fallback.run({ requestId: "r1", stepId: "f9" });
    expect(ctx.gateway.calls.at(-1)).toMatchObject({ schemaName: "fallback" });
    expect(ctx.gateway.calls.at(-1)).not.toHaveProperty("reasoning");
  });

  test("a falha de um especialista volta ao fallback com o codigo e fica registrada na resposta", async () => {
    const { ctx, fallback, stepOf, loopCalls } = await loopStep("almocei");
    ctx.gateway.outputs.set("fallback_loop", { reply: null, invoke: [{ agent: "task-create", instruction: "Criar o almoço" }] });
    await fallback.run(stepOf("fallback"));
    ctx.gateway.failure = new FastStageError("timeout");
    await ctx.worker.run("task-create", stepOf("task-create"));
    ctx.gateway.failure = undefined;
    await ctx.finalizer(quiet().client).run(stepOf("task-create"));

    ctx.gateway.outputs.set("fallback_loop", { reply: "Não consegui registrar o almoço.", invoke: null });
    await fallback.run(stepOf("fallback"));

    expect(loopCalls()[1]?.user).toContain('"status":"failed","errorCode":"agent_timeout"');
    expect(ctx.store.require("r1")).toMatchObject({
      status: "done", answer: "Não consegui registrar o almoço.",
      failedSteps: [{ agent: "task-create", errorCode: "agent_timeout" }],
    });
  });

  test("na ultima rodada os especialistas ficam desativados: so cabe a resposta", async () => {
    const ctx = setupRequest("x");
    await ctx.store.beginSteps("r1", [{ id: "f4", agent: "fallback", expected: "one", input: { round: 4 } }]);
    // Mesmo que o modelo insista em chamar, o schema da ultima rodada so aceita a resposta.
    ctx.gateway.outputs.set("fallback_loop", { reply: "Parei por aqui.", invoke: [{ agent: "task-create", instruction: "x" }] });

    await new RequestFallback({ store: ctx.store, runner: ctx.runner }).run({ requestId: "r1", stepId: "f4" });

    const call = ctx.gateway.calls[0];
    expect(call?.user).toContain("LIMITE DE RODADAS ATINGIDO");
    expect(JSON.stringify(call?.schema)).not.toMatch(/invoke/);
    expect(ctx.store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(ctx.store.require("r1")).toMatchObject({ status: "done", answer: "Parei por aqui." });
  });

  test("duas finalizacoes da mesma rodada nao enfileiram a rodada seguinte duas vezes", async () => {
    const { ctx, fallback, stepOf } = await loopStep("x");
    ctx.gateway.outputs.set("fallback_loop", { reply: null, invoke: [
      { agent: "task-create", instruction: "a" }, { agent: "artifact-create", instruction: "b" },
    ] });
    await fallback.run(stepOf("fallback"));
    ctx.gateway.failure = new FastStageError("timeout");
    await ctx.worker.run("task-create", stepOf("task-create"));
    await ctx.worker.run("artifact-create", stepOf("artifact-create"));
    ctx.gateway.failure = undefined;

    const finalizer = ctx.finalizer(quiet().client);
    await finalizer.run(stepOf("task-create"));
    await finalizer.run(stepOf("artifact-create"));

    expect(ctx.store.stepRecords.filter((step) => step.agent === "fallback").map((step) => step.input?.round)).toEqual([1, 2]);
    expect(ctx.store.jobs.filter((job) => job.kind === "request-fallback")).toHaveLength(2);
  });

  test("a rodada que falha encerra o laco: o pedido fecha pela finalizacao, sem nova rodada", async () => {
    const { ctx, fallback, stepOf } = await loopStep("x");
    ctx.gateway.failure = new FastStageError("timeout");
    await fallback.run(stepOf("fallback"));
    ctx.gateway.failure = undefined;

    await ctx.finalizer(quiet().client).run(stepOf("fallback"));

    expect(ctx.store.stepRecords.map((step) => [step.agent, step.status])).toEqual([["fallback", "failed"]]);
    expect(ctx.store.require("r1").status).toBe("failed");
  });

  test("fora do comando nao ha laco: os especialistas terminam e a finalizacao fecha o pedido", async () => {
    const { ctx, fallback, payload } = await fallbackStep("almocei");
    ctx.gateway.outputs.set("fallback", { reply: null, invoke: [{ agent: "task-create", instruction: "Criar o almoço" }] });
    await fallback.run(payload);
    ctx.gateway.outputs.set("task_create", { tasks: [
      { name: "Almoço", kind: "meal", status: null, priority: null, longRunning: false, startedAt: null, estimatedFinishAt: null, description: null, tags: [], followsFrom: [] },
    ] });
    const step = { requestId: "r1", stepId: ctx.store.stepRecords[1]?.id as string };
    await ctx.worker.run("task-create", step);

    await ctx.finalizer(quiet().client).run(step);

    expect(ctx.store.stepRecords.map((record) => record.agent)).toEqual(["fallback", "task-create"]);
    expect(ctx.store.require("r1").status).toBe("done");
    expect(ctx.gateway.calls.map((call) => call.schemaName)).toEqual(["fallback", "task_create"]);
  });
});
