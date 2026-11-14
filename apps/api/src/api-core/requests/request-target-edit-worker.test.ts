import { describe, expect, test } from "vitest";
import { Artifact, Event, type FoodData, type TrainingData } from "../../domain";
import { loadAgentDefinition } from "./request-config";
import { TARGET_EDIT_AGENTS, type StepAgent } from "./request-steps";
import type { EditTarget } from "./request-store";
import { addStep, foodData, setupRequest } from "./testing/request-test-kit";

type Ctx = ReturnType<typeof setupRequest>;

const SKILL_PATH = "hermes/skills/cafe/SKILL.md";
const SKILL_TEXT = "---\nname: cafe\ndescription: Faz café\n---\n# Café\n\nUse 15 g de pó.";

const stepFor = (ctx: Ctx, agent: StepAgent, target: EditTarget) => addStep(ctx, "s1", agent, "one", { target });

async function seed(ctx: Ctx, type: string, data: unknown, name = "Registro") {
  const artifact = Artifact.create({ userId: "user-1", name, type, data });
  await ctx.artifactRepository.save(artifact);
  return artifact;
}

describe("agentes com alvo: os .md carregam e declaram o formato", () => {
  test.each(TARGET_EDIT_AGENTS)("%s", (agent) => {
    const definition = loadAgentDefinition(agent);
    expect(definition.name).toBe(agent);
    expect(definition.template).toContain("`Alvo`");
  });
});

describe("food-edit", () => {
  test("texto novo: itens, totais e receita sao estimados de novo; nenhum numero vem do agente", async () => {
    const ctx = setupRequest("troque para arroz e ovo");
    const food = await seed(ctx, "food", foodData("arroz"), "Almoço");
    ctx.foodParsing.response = {
      items: [{ food: "Ovo", portion: "2 un", approximateWeightGrams: 100, caloriesKcal: 150, macronutrients: { carbohydratesGrams: 1, proteinsGrams: 12, totalFatGrams: 10, fiberGrams: 0 } }],
      recipe: { source: "model", ingredients: [{ name: "ovo", quantity: "2 un" }], steps: ["Frite."] },
      modelProvider: "stub", modelName: "stub",
    };
    ctx.gateway.outputs.set("food_edit", { edits: [{ id: food.id, name: null, description: "Arroz e 2 ovos", tags: null }] });
    const target: EditTarget = { entityType: "food_artifact", id: food.id, snapshot: { name: "Almoço", description: "arroz" } };

    await ctx.targetEditWorker.run("food-edit", await stepFor(ctx, "food-edit", target));

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    const stored = await ctx.artifactRepository.findById(food.id);
    const data = stored?.data as FoodData;
    expect(data.description).toBe("Arroz e 2 ovos");
    expect(data.totals.totalCaloriesKcal).toBe(150);
    expect(data.items.map((item) => item.name)).toEqual(["Ovo"]);
    expect(data.generation).toEqual({ status: "completed" });
    expect(stored?.name).toBe("Almoço");
    expect(stored?.revision).toBe(food.revision + 1);
    expect(ctx.foodParsing.texts).toEqual(["Arroz e 2 ovos"]);
    expect(await ctx.store.entities("r1")).toMatchObject([{ kind: "artifact", id: food.id, operation: "update", summary: { artifactType: "food" } }]);
  });

  test("so etiquetas: a estimativa nao roda e os itens ficam", async () => {
    const ctx = setupRequest();
    const food = await seed(ctx, "food", foodData("arroz"));
    ctx.gateway.outputs.set("food_edit", { edits: [{ id: food.id, name: null, description: null, tags: ["fit"] }] });
    await ctx.targetEditWorker.run("food-edit", await stepFor(ctx, "food-edit", { entityType: "food_artifact", id: food.id, snapshot: {} }));
    expect((await ctx.artifactRepository.findById(food.id))?.tags).toEqual(["fit"]);
    expect(ctx.foodParsing.texts).toEqual([]);
  });

  test("estimativa sem receita falha o passo e nada e gravado", async () => {
    const ctx = setupRequest();
    const food = await seed(ctx, "food", foodData("arroz"));
    ctx.gateway.outputs.set("food_edit", { edits: [{ id: food.id, name: null, description: "outra coisa", tags: null }] });
    await ctx.targetEditWorker.run("food-edit", await stepFor(ctx, "food-edit", { entityType: "food_artifact", id: food.id, snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
    expect((await ctx.artifactRepository.findById(food.id))?.revision).toBe(food.revision);
  });
});

describe("sleep-edit", () => {
  test("muda so o que o agente disse; o resto fica", async () => {
    const ctx = setupRequest();
    const sleep = await seed(ctx, "sleep", { trackedSleepTime: 400, score: 70 }, "Sono");
    ctx.gateway.outputs.set("sleep_edit", { edits: [{ id: sleep.id, name: null, trackedSleepTime: 450, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-edit", await stepFor(ctx, "sleep-edit", { entityType: "sleep_artifact", id: sleep.id, snapshot: {} }));
    expect((await ctx.artifactRepository.findById(sleep.id))?.data).toEqual({ trackedSleepTime: 450, score: 70 });
    expect(ctx.store.stepRecords[0]?.status).toBe("done");
  });

  test("valor fora do formato (score acima de 100) e recusado pelo schema do agente", async () => {
    const ctx = setupRequest();
    const sleep = await seed(ctx, "sleep", { trackedSleepTime: 400, score: 70 });
    ctx.gateway.outputs.set("sleep_edit", { edits: [{ id: sleep.id, name: null, trackedSleepTime: null, score: 500, tags: null }] });
    await ctx.targetEditWorker.run("sleep-edit", await stepFor(ctx, "sleep-edit", { entityType: "sleep_artifact", id: sleep.id, snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_invalid" });
    expect((await ctx.artifactRepository.findById(sleep.id))?.data).toEqual({ trackedSleepTime: 400, score: 70 });
  });
});

describe("training-edit", () => {
  const running = { workoutCode: "running", calories: 300, duration: 30, pace: 5, distance: 6, sets: null };

  test("a lista nova vira o treino: nome dos exercicios globais, calorias somadas e as ja existentes preservadas", async () => {
    const ctx = setupRequest();
    const training = await seed(ctx, "training", {
      workouts: [{ id: "w1", workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 5, distance: 6 }],
      caloriesBurned: 300,
    });
    ctx.gateway.outputs.set("training_edit", { edits: [{ id: training.id, name: null, tags: null, workouts: [
      { ...running, calories: null, duration: 40 },
      { workoutCode: "weightlifting", calories: 100, duration: 20, pace: null, distance: null, sets: [{ exercise: "Supino", repetitions: 10, weight: 40 }] },
    ] }] });
    await ctx.targetEditWorker.run("training-edit", await stepFor(ctx, "training-edit", { entityType: "training_artifact", id: training.id, snapshot: {} }));

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    const data = (await ctx.artifactRepository.findById(training.id))?.data as TrainingData;
    expect(data.workouts).toHaveLength(2);
    expect(data.workouts[0]).toMatchObject({ id: "w1", calories: 300, duration: 40 });
    expect(data.workouts[0]?.workoutName).toBeTruthy();
    expect(data.workouts[1]).toMatchObject({ workoutCode: "weightlifting", sets: [{ exercise: "Supino", repetitions: 10, weight: 40 }] });
    expect(data.caloriesBurned).toBe(400);
  });

  test("workouts null mantem os treinos e muda so o titulo", async () => {
    const ctx = setupRequest();
    const training = await seed(ctx, "training", { workouts: [{ id: "w1", workoutCode: "free", workoutName: "Livre", calories: 50, duration: 10 }], caloriesBurned: 50 });
    ctx.gateway.outputs.set("training_edit", { edits: [{ id: training.id, name: "Treino leve", tags: null, workouts: null }] });
    await ctx.targetEditWorker.run("training-edit", await stepFor(ctx, "training-edit", { entityType: "training_artifact", id: training.id, snapshot: {} }));
    const stored = await ctx.artifactRepository.findById(training.id);
    expect(stored?.name).toBe("Treino leve");
    expect(stored?.data).toMatchObject({ workouts: [{ id: "w1" }] });
  });
});

describe("agent-file-edit", () => {
  const target = (): EditTarget => ({
    entityType: "skill_artifact", id: "a1", snapshot: { name: "cafe", path: SKILL_PATH, text: SKILL_TEXT },
  });

  test("grava o arquivo do alvo (caminho vem do alvo) e registra o artefato como alterado", async () => {
    const ctx = setupRequest();
    const text = SKILL_TEXT.replace("15 g", "18 g");
    ctx.gateway.outputs.set("agent_file_edit", { edits: [{ id: "a1", text }] });
    await ctx.targetEditWorker.run("agent-file-edit", await stepFor(ctx, "agent-file-edit", target()));

    expect(ctx.files.written).toEqual([{ path: SKILL_PATH, text }]);
    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    expect(ctx.store.touched).toMatchObject([{ kind: "artifact", id: "a1", operation: "update", stepId: "s1" }]);
  });

  test("perder o cabecalho do arquivo e recusado e nada e gravado", async () => {
    const ctx = setupRequest();
    ctx.gateway.outputs.set("agent_file_edit", { edits: [{ id: "a1", text: "# Só o corpo" }] });
    await ctx.targetEditWorker.run("agent-file-edit", await stepFor(ctx, "agent-file-edit", target()));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
    expect(ctx.files.written).toEqual([]);
  });

  test("texto null (agente avaliou o risco): nada muda e o passo falha com nothing_to_change", async () => {
    const ctx = setupRequest();
    ctx.gateway.outputs.set("agent_file_edit", { edits: [{ id: "a1", text: null }] });
    await ctx.targetEditWorker.run("agent-file-edit", await stepFor(ctx, "agent-file-edit", target()));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
    expect(ctx.files.written).toEqual([]);
  });
});

describe("regras comuns a todo agente com alvo", () => {
  test("o agente so pode devolver o id do alvo: outro id derruba o passo sem gravar", async () => {
    const ctx = setupRequest();
    const mine = await seed(ctx, "sleep", { trackedSleepTime: 1, score: 1 });
    const other = await seed(ctx, "sleep", { trackedSleepTime: 2, score: 2 });
    ctx.gateway.outputs.set("sleep_edit", { edits: [{ id: other.id, name: null, trackedSleepTime: 999, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-edit", await stepFor(ctx, "sleep-edit", { entityType: "sleep_artifact", id: mine.id, snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
    expect((await ctx.artifactRepository.findById(other.id))?.data).toEqual({ trackedSleepTime: 2, score: 2 });
  });

  test("passo sem alvo falha com target_missing", async () => {
    const ctx = setupRequest();
    await ctx.targetEditWorker.run("sleep-edit", await addStep(ctx, "s1", "sleep-edit"));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_missing" });
  });

  test("o prompt do agente leva o pedido e o retrato do alvo, e nenhuma consulta e permitida", async () => {
    const ctx = setupRequest("durmi 8h");
    const sleep = await seed(ctx, "sleep", { trackedSleepTime: 1, score: 1 });
    ctx.gateway.outputs.set("sleep_edit", { edits: [{ id: sleep.id, name: null, trackedSleepTime: 480, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-edit", await stepFor(ctx, "sleep-edit", { entityType: "sleep_artifact", id: sleep.id, snapshot: { trackedSleepTime: 1 } }));
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.gateway.calls[0]?.user).toContain("durmi 8h");
    expect(ctx.gateway.calls[0]?.user).toContain(`"id":"${sleep.id}"`);
    expect(ctx.sql.calls).toHaveLength(0);
  });
});

describe("event-edit e artifact-edit com alvo (sem JEV e sem consulta)", () => {
  const noEvent = {
    name: null, kind: null, status: null, priority: null, startedAt: null, estimatedFinishAt: null, finishedAt: null,
    description: null, tags: null,
  };

  test("evento: so o alvo, uma chamada ao agente, mesmo que ele peca consulta", async () => {
    const ctx = setupRequest("termina as 18h");
    const event = Event.create({ userId: "user-1", name: "Reunião", startedAt: new Date("2026-10-25T12:00:00Z") });
    await ctx.eventRepository.save(event);
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: event.id, estimatedFinishAt: "2026-10-25T18:00:00-03:00" }], query: { sql: "SELECT 1" } });
    await ctx.editWorker.run("event-edit", await stepFor(ctx, "event-edit", { entityType: "event", id: event.id, snapshot: { name: "Reunião" } }));
    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    expect((await ctx.eventRepository.findById(event.id))?.estimatedFinishAt?.toISOString()).toBe("2026-10-25T21:00:00.000Z");
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.sql.calls).toHaveLength(0);
  });

  test("evento: id diferente do alvo falha com target_unknown", async () => {
    const ctx = setupRequest();
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: "outro", name: "x" }], query: null });
    await ctx.editWorker.run("event-edit", await stepFor(ctx, "event-edit", { entityType: "event", id: "alvo", snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
  });

  test("artefato de texto: muda o texto do alvo", async () => {
    const ctx = setupRequest();
    const text = await seed(ctx, "text", { body: "antes" });
    ctx.gateway.outputs.set("artifact_edit", { edits: [{ id: text.id, name: null, content: "depois", tags: null }], query: null });
    await ctx.editWorker.run("artifact-edit", await stepFor(ctx, "artifact-edit", { entityType: "artifact", id: text.id, snapshot: {} }));
    expect((await ctx.artifactRepository.findById(text.id))?.data).toEqual({ body: "depois" });
  });

  test("sem mudanca nenhuma: nothing_to_change", async () => {
    const ctx = setupRequest();
    ctx.gateway.outputs.set("artifact_edit", { edits: [], query: null });
    await ctx.editWorker.run("artifact-edit", await stepFor(ctx, "artifact-edit", { entityType: "artifact", id: "n", snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
  });
});
