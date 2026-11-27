import { describe, expect, test } from "vitest";
import { Artifact, Task } from "../../domain";
import { uiConfig } from "./request-config";
import { EDIT_TARGET_AGENTS, REQUEST_JOBS } from "./request-steps";
import { foodData, setupRequest } from "./testing/request-test-kit";

const hash = "a".repeat(64);

function queued(entityType: string, entityId: string) {
  const ctx = setupRequest();
  const request = ctx.store.require("r1");
  request.status = "queued";
  request.target = { entityType: entityType as never, entityId };
  return ctx;
}

async function withArtifact(entityType: string, props: { name?: string; type: string; data: unknown; tags?: string[]; userId?: string }) {
  const artifact = Artifact.create({ userId: "user-1", ...props });
  const ctx = queued(entityType, artifact.id);
  await ctx.artifactRepository.save(artifact);
  return { ctx, artifact };
}

describe("worker da edicao pela tela de detalhe", () => {
  test("a escolha do agente e uma tabela: cada tipo tem o seu", () => {
    expect(EDIT_TARGET_AGENTS).toEqual({
      task: "task-edit", artifact: "artifact-edit", food_artifact: "food-edit", sleep_artifact: "sleep-edit",
      training_artifact: "training-edit", skill_artifact: "agent-file-edit", agent_artifact: "agent-file-edit",
    });
  });

  test("tarefa: cria um passo task-edit com o retrato completo do alvo", async () => {
    const task = Task.create({
      userId: "user-1", name: "Reunião", description: "pauta", startedAt: new Date("2026-10-25T12:00:00Z"), tags: ["trabalho"],
    });
    const ctx = queued("task", task.id);
    await ctx.taskRepository.save(task);

    await ctx.editTargetWorker.run("r1");

    expect(ctx.store.require("r1").status).toBe("running");
    expect(ctx.store.stepRecords).toMatchObject([{
      agent: "task-edit", status: "queued",
      input: { target: { entityType: "task", id: task.id, snapshot: { name: "Reunião", description: "pauta", tags: ["trabalho"], status: null } } },
    }]);
    expect(ctx.store.jobs.at(-1)).toMatchObject({ kind: REQUEST_JOBS.step });
  });

  test.each([
    ["artifact", "text", { body: "oi" }, "artifact-edit"],
    ["food_artifact", "food", foodData("arroz"), "food-edit"],
    ["sleep_artifact", "sleep", { trackedSleepTime: 450, score: 80 }, "sleep-edit"],
    ["training_artifact", "training", { workouts: [], caloriesBurned: 0 }, "training-edit"],
  ])("%s: o agente certo, com o retrato do alvo", async (entityType, type, data, agent) => {
    const { ctx, artifact } = await withArtifact(entityType, { name: "Registro", type, data, tags: ["x"] });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.stepRecords).toMatchObject([{ agent, input: { target: { entityType, id: artifact.id, snapshot: { name: "Registro", tags: ["x"] } } } }]);
  });

  test("skill: o retrato traz o caminho e o texto atual do arquivo", async () => {
    const { ctx } = await withArtifact("skill_artifact", {
      name: "cafe", type: "skill", tags: ["skill"], data: { path: "hermes/skills/cafe/SKILL.md", hash, missing: false },
    });
    ctx.files.texts.set("hermes/skills/cafe/SKILL.md", "---\nname: cafe\n---\n# Café");
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.stepRecords).toMatchObject([{
      agent: "agent-file-edit",
      input: { target: { snapshot: { path: "hermes/skills/cafe/SKILL.md", text: "---\nname: cafe\n---\n# Café" } } },
    }]);
  });

  test("alvo inexistente: o pedido falha com o texto predefinido, sem passo", async () => {
    const ctx = queued("task", "nao-existe");
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.stepRecords).toHaveLength(0);
    expect(ctx.store.require("r1")).toMatchObject({ status: "failed", errorCode: "invalid_input", answer: uiConfig.targetFailed.not_found });
  });

  test("entidade de outro usuario e tratada como inexistente", async () => {
    const { ctx } = await withArtifact("artifact", { type: "text", data: { body: "segredo" }, userId: "outro" });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.require("r1")).toMatchObject({ status: "failed", answer: uiConfig.targetFailed.not_found });
    expect(ctx.store.stepRecords).toHaveLength(0);
  });

  test.each(["text", "news", "email_summary", "youtube_transcript"] as const)("alvo artifact aceita um artefato %s e chama o mesmo agente da nota", async (type) => {
    const { ctx } = await withArtifact("artifact", { name: "Resumo", type, data: { body: "texto atual" }, tags: ["leitura"] });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.stepRecords).toMatchObject([{
      agent: "artifact-edit",
      input: { target: { snapshot: { name: "Resumo", tags: ["leitura"], text: "texto atual" } } },
    }]);
  });

  test.each([
    ["router", { body: "regras" }],
    ["sleep", { trackedSleepTime: 1, score: 1 }],
  ] as const)("alvo artifact recusa um artefato %s com type_mismatch", async (type, data) => {
    const { ctx } = await withArtifact("artifact", { type, data });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.require("r1")).toMatchObject({ status: "failed", answer: uiConfig.targetFailed.type_mismatch });
    expect(ctx.store.stepRecords).toHaveLength(0);
  });

  test("tipo informado que nao bate com o artefato falha com type_mismatch", async () => {
    const { ctx } = await withArtifact("food_artifact", { type: "sleep", data: { trackedSleepTime: 1, score: 1 } });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.require("r1")).toMatchObject({ status: "failed", answer: uiConfig.targetFailed.type_mismatch });
  });

  test("alimento ainda a espera dos nutrientes falha com busy", async () => {
    const { ctx } = await withArtifact("food_artifact", { name: "Almoço", type: "food", data: foodData("arroz", "pending") });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.require("r1")).toMatchObject({ errorCode: "conflict", answer: uiConfig.targetFailed.busy });
  });

  test("skill sem arquivo (ou marcada como sumida) falha com not_found", async () => {
    const { ctx } = await withArtifact("skill_artifact", { name: "x", type: "skill", data: { path: "hermes/skills/x/SKILL.md", hash, missing: false } });
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.require("r1").answer).toBe(uiConfig.targetFailed.not_found);
  });

  test("pedido que ja saiu da fila e ignorado", async () => {
    const ctx = setupRequest();
    ctx.store.require("r1").target = { entityType: "task", entityId: "qualquer" };
    await ctx.editTargetWorker.run("r1");
    expect(ctx.store.stepRecords).toHaveLength(0);
    expect(ctx.store.require("r1").status).toBe("running");
  });
});

describe("fluxo da edicao pela tela de detalhe, ponta a ponta (em memoria)", () => {
  test("worker escolhe o agente -> agente edita -> finalizacao fecha o pedido sem JEV", async () => {
    const { ctx, artifact } = await withArtifact("sleep_artifact", { name: "Sono", type: "sleep", data: { trackedSleepTime: 400, score: 70 } });
    ctx.store.require("r1").prompt = "dormi 8h";

    await ctx.editTargetWorker.run("r1");
    const [step] = ctx.store.stepRecords;
    expect(step?.agent).toBe("sleep-edit");

    ctx.gateway.outputs.set("sleep_edit", { edits: [{ id: artifact.id, name: null, trackedSleepTime: 480, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-edit", { requestId: "r1", stepId: step?.id as string });

    await ctx.finalizer().run({ requestId: "r1", stepId: step?.id as string });

    expect(ctx.store.require("r1")).toMatchObject({ status: "done", failedSteps: [] });
    expect((await ctx.artifactRepository.findById(artifact.id))?.data).toEqual({ trackedSleepTime: 480, score: 70 });
  });
});
