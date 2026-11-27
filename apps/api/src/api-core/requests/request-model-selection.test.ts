import type { ModelSelection } from "@repo/contracts";
import { describe, expect, test } from "vitest";
import { Artifact } from "../../domain";
import { addStep, entityAnswer, foodData, setupRequest } from "./testing/request-test-kit";

const CHOSEN: ModelSelection = { provider: "anthropic", model: "claude-haiku-5-5", effort: "high" };

/** O pedido `r1` como o chat ou o detalhe o abrem com o seletor do campo: com a escolha do usuario guardada. */
function setupChosen(prompt = "pedido") {
  const ctx = setupRequest(prompt, { ok: true, columns: ["n"], rows: [[1]], truncated: false });
  ctx.store.require("r1").model = CHOSEN;
  return ctx;
}

describe("o modelo que o usuario escolheu roda todo agente do pedido", () => {
  test("o agente de consulta", async () => {
    const ctx = setupChosen("o que tenho hoje?");
    ctx.gateway.outputs.set("query", { sql: "SELECT 1" });
    await ctx.queryWorker.run(await addStep(ctx, "s1", "query"));
    expect(ctx.gateway.calls.map((call) => call.model)).toEqual([CHOSEN]);
  });

  test("o agente de escrita, nas duas rodadas quando ele pede uma consulta", async () => {
    const ctx = setupChosen("mude o dentista para as 19h");
    ctx.gateway.outputs.set("entity", entityAnswer({ query: { sql: "SELECT id FROM tasks" } }));
    await ctx.worker.run(await addStep(ctx, "s1", "entity", "many"));
    expect(ctx.gateway.calls.map((call) => call.model)).toEqual([CHOSEN, CHOSEN]);
  });

  test("o agente de edicao da tela de detalhe", async () => {
    const ctx = setupChosen("marque como fit");
    const food = Artifact.create({ userId: "user-1", name: "Almoço", type: "food", data: foodData("arroz") });
    await ctx.artifactRepository.save(food);
    ctx.gateway.outputs.set("food_edit", { edits: [{ id: food.id, name: null, description: null, tags: ["fit"] }] });
    const payload = await addStep(ctx, "s1", "food-edit", "one", { target: { entityType: "food_artifact", id: food.id, snapshot: {} } });

    await ctx.targetEditWorker.run("food-edit", payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("completed");
    expect(ctx.gateway.calls.map((call) => call.model)).toEqual([CHOSEN]);
  });

  test("a explicacao de uma falha", async () => {
    const ctx = setupChosen();
    ctx.gateway.outputs.set("failure_explainer", { message: "Não consegui consultar." });
    // Sem saida combinada para a consulta, o passo falha e a finalizacao pede a explicacao.
    const payload = await addStep(ctx, "s1", "query");
    await ctx.queryWorker.run(payload);
    await ctx.finalizer().run(payload);

    const explain = ctx.gateway.calls.find((call) => call.schemaName === "failure_explainer");
    expect(explain?.model).toEqual(CHOSEN);
    expect(ctx.store.require("r1").answer).toBe("Não consegui consultar.");
  });

  test("sem escolha no pedido, nenhuma chamada leva modelo: vale o do servidor", async () => {
    const ctx = setupRequest("o que tenho hoje?", { ok: true, columns: ["n"], rows: [[1]], truncated: false });
    ctx.gateway.outputs.set("query", { sql: "SELECT 1" });
    await ctx.queryWorker.run(await addStep(ctx, "s1", "query"));
    expect(ctx.gateway.calls[0]).not.toHaveProperty("model");
  });
});
