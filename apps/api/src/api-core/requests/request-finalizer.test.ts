import { describe, expect, test } from "vitest";
import { toRequestDto } from "./request-view";
import { addStep, entityAnswer, setupRequest } from "./testing/request-test-kit";

const iso = (hour: number) => `2026-10-25T${String(hour).padStart(2, "0")}:00:00-03:00`;
const task = (name: string, kind: string, hour: number, over: Record<string, unknown> = {}) => ({
  name, kind, status: null, priority: null, longRunning: false, startedAt: iso(hour), estimatedFinishAt: null,
  description: null, tags: [], subtaskOf: null, foods: null, foodName: null, ...over,
});

/**
 * O exemplo-guia com o passo de escrita concluido: a refeicao com o alimento dela, o treino e uma nota que o agente
 * ligou ao treino. As ligacoes nascem com o lote do passo; a finalizacao so marca e fecha.
 */
async function guideExample() {
  const ctx = setupRequest("comendo 300g de arroz com 200g de feijão, depois vou nadar na praia; anota: levar a toalha");
  const write = await addStep(ctx, "s-write", "entity");
  ctx.gateway.outputs.set("entity", entityAnswer({
    tasks: [task("Refeição", "meal", 12, { foods: "300g de arroz, 200g de feijão" }), task("Nadar na praia", "training", 13)],
    artifacts: [{ name: "Toalha", content: "Levar a toalha para a praia", taskIndex: 1, taskId: null }],
  }));
  return { ctx, write };
}

const entitiesOf = (ctx: ReturnType<typeof setupRequest>) => ctx.store.entities("r1");

describe("fila de finalizacao", () => {
  test("marca como concluido o que o passo gravou, mantem as ligacoes que o agente fez e fecha o pedido", async () => {
    const { ctx, write } = await guideExample();
    await ctx.worker.run(write);
    const commits = ctx.batchWriter.commits.length;

    await ctx.finalizer().run(write);

    const entities = await entitiesOf(ctx);
    expect(entities.every((entity) => entity.finalized)).toBe(true);
    const idOf = (name: string) => entities.find((entity) => entity.summary.name === name)?.id;
    const linked = entities.filter((entity) => entity.kind === "artifact").map((entity) => entity.links);
    // O alimento pertence a refeicao e a nota ao treino: foi o agente de escrita que disse, no lote do passo.
    expect(linked).toEqual([
      [{ from: { kind: "artifact", id: entities[1]?.id }, to: { kind: "task", id: idOf("Refeição") } }],
      [{ from: { kind: "artifact", id: idOf("Toalha") }, to: { kind: "task", id: idOf("Nadar na praia") } }],
    ]);
    // A finalizacao nao grava entidade nenhuma nem chama modelo: so o passo escreveu.
    expect(ctx.batchWriter.commits).toHaveLength(commits);
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.store.require("r1").status).toBe("done");
  });

  test("com outro passo ainda aberto, o pedido segue aberto", async () => {
    const { ctx, write } = await guideExample();
    await addStep(ctx, "s-query", "query");
    await ctx.worker.run(write);

    await ctx.finalizer().run(write);

    expect((await entitiesOf(ctx)).every((entity) => entity.finalized)).toBe(true);
    expect(ctx.store.require("r1").status).toBe("running");
  });

  test("passo que falhou nao trava o pedido: ele fecha com a falha registrada", async () => {
    const { ctx, write } = await guideExample();
    const query = await addStep(ctx, "s-query", "query");
    await ctx.worker.run(write);
    // Sem saida combinada para a consulta, o passo dela falha.
    await ctx.queryWorker.run(query);
    await ctx.finalizer().run(write);
    await ctx.finalizer().run(query);

    expect(ctx.store.require("r1")).toMatchObject({
      status: "done", failedSteps: [{ agent: "query", errorCode: "internal" }],
    });
  });

  test("todos os passos falharam: o pedido falhou", async () => {
    const ctx = setupRequest();
    const write = await addStep(ctx, "s1", "entity");
    await ctx.worker.run(write);
    await ctx.finalizer().run(write);
    expect(ctx.store.require("r1").status).toBe("failed");
  });

  test("pedido cancelado: a finalizacao que ainda estava na fila nao faz nada", async () => {
    const { ctx, write } = await guideExample();
    await ctx.worker.run(write);
    await ctx.store.cancel("r1");
    await ctx.finalizer().run(write);
    expect(ctx.store.require("r1").status).toBe("cancel");
  });
});

describe("explicacao da falha", () => {
  /** O pedido fecha na ultima finalizacao a rodar, seja de passo concluido ou de passo que falhou. */
  async function withFailedQuery(explanation?: string) {
    const { ctx, write } = await guideExample();
    const query = await addStep(ctx, "s-query", "query");
    if (explanation) ctx.gateway.outputs.set("failure_explainer", { message: explanation });
    await ctx.worker.run(write);
    await ctx.queryWorker.run(query);
    await ctx.finalizer().run(write);
    return { ctx, finalize: () => ctx.finalizer().run(query) };
  }

  test("so quando algum passo falha, uma chamada curta diz o que falhou e o que deu certo", async () => {
    const { ctx, finalize } = await withFailedQuery("Registrei tudo, mas não consegui consultar a agenda.");

    await finalize();

    const call = ctx.gateway.calls.find((candidate) => candidate.schemaName === "failure_explainer");
    expect(call?.user).toContain("Consultando dados (código: internal)");
    expect(call?.user).toContain("Criando e atualizando registros");
    const request = ctx.store.require("r1");
    expect(request).toMatchObject({ status: "done", answer: "Registrei tudo, mas não consegui consultar a agenda." });
    expect(toRequestDto(request, ctx.store.stepRecords, []).message).toBe("Registrei tudo, mas não consegui consultar a agenda.");
  });

  test("se a explicacao tambem falha, vale a linha predefinida", async () => {
    const { ctx, finalize } = await withFailedQuery();
    await finalize();
    const request = ctx.store.require("r1");
    expect(request.answer).toBeUndefined();
    expect(toRequestDto(request, ctx.store.stepRecords, []).message).toBe("Não consegui concluir: consultando dados.");
  });

  test("sucesso total nunca chama o modelo de explicacao", async () => {
    const { ctx, write } = await guideExample();
    await ctx.worker.run(write);
    await ctx.finalizer().run(write);
    expect(ctx.store.require("r1").status).toBe("done");
    expect(ctx.gateway.calls.some((call) => call.schemaName === "failure_explainer")).toBe(false);
  });
});
