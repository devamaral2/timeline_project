import { describe, expect, test } from "vitest";
import { Event, Note, Task, type MealItem, type TrainingData } from "../../domain";
import { loadAgentDefinition } from "./process-config";
import { TARGET_EDIT_AGENTS, type StepAgent } from "./process-steps";
import type { EditTarget } from "./process-store";
import { addStep, mealData, setupProcess } from "./testing/process-test-kit";

type Ctx = ReturnType<typeof setupProcess>;

const SKILL_PATH = "hermes/skills/cafe/SKILL.md";
const SKILL_TEXT = "---\nname: cafe\ndescription: Faz café\n---\n# Café\n\nUse 15 g de pó.";

async function stepFor(ctx: Ctx, agent: StepAgent, target: EditTarget) {
  return addStep(ctx, "s1", agent, "one", { target });
}

async function seedNote(ctx: Ctx, type: string, data: unknown, name = "Nota") {
  const note = Note.create({ userId: "user-1", name, type, data, tags: [] });
  await ctx.noteRepository.save(note);
  return note;
}

describe("agentes novos: os .md carregam e declaram o formato", () => {
  test.each(TARGET_EDIT_AGENTS)("%s", (agent) => {
    const definition = loadAgentDefinition(agent);
    expect(definition.name).toBe(agent);
    expect(definition.template).toContain("`Alvo`");
  });
});

describe("food-note-edit", () => {
  test("texto novo: itens, totais e receita sao estimados de novo; nenhum numero vem do agente", async () => {
    const ctx = setupProcess("troque para arroz e ovo");
    const note = await seedNote(ctx, "meal", mealData("arroz"), "Almoço");
    ctx.mealParsing.response = {
      items: [{ food: "Ovo", portion: "2 un", approximateWeightGrams: 100, caloriesKcal: 150, macronutrients: { carbohydratesGrams: 1, proteinsGrams: 12, totalFatGrams: 10, fiberGrams: 0 } }],
      recipe: { source: "model", ingredients: [{ name: "ovo", quantity: "2 un" }], steps: ["Frite."] },
      modelProvider: "stub", modelName: "stub",
    };
    ctx.gateway.outputs.set("food_note_edit", { edits: [{ id: note.id, name: null, description: "Arroz e 2 ovos", tags: null }] });
    const target: EditTarget = { entityType: "meal_note", id: note.id, snapshot: { name: "Almoço", description: "arroz" } };

    await ctx.targetEditWorker.run("food-note-edit", await stepFor(ctx, "food-note-edit", target));

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    const stored = (await ctx.noteRepository.findById(note.id))!;
    const meal = stored.data as MealItem;
    expect(meal.description).toBe("Arroz e 2 ovos");
    expect(meal.totals.totalCaloriesKcal).toBe(150);
    expect(meal.foodItems.map((item) => item.name)).toEqual(["Ovo"]);
    expect(meal.generation).toEqual({ status: "completed" });
    expect(stored.revision).toBe(note.revision + 1);
    expect(ctx.mealParsing.texts).toEqual(["Arroz e 2 ovos"]);
    expect(ctx.store.entityRecords).toMatchObject([{ kind: "note", id: note.id, operation: "update", summary: { noteType: "meal" } }]);
  });

  test("so etiquetas: a estimativa nao roda e os itens ficam", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "meal", mealData("arroz"));
    ctx.gateway.outputs.set("food_note_edit", { edits: [{ id: note.id, name: null, description: null, tags: ["fit"] }] });
    await ctx.targetEditWorker.run("food-note-edit", await stepFor(ctx, "food-note-edit", { entityType: "meal_note", id: note.id, snapshot: {} }));
    expect((await ctx.noteRepository.findById(note.id))?.tags).toEqual(["fit"]);
    expect(ctx.mealParsing.texts).toEqual([]);
  });

  test("estimativa sem receita falha o passo e nada e gravado", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "meal", mealData("arroz"));
    ctx.gateway.outputs.set("food_note_edit", { edits: [{ id: note.id, name: null, description: "outra coisa", tags: null }] });
    await ctx.targetEditWorker.run("food-note-edit", await stepFor(ctx, "food-note-edit", { entityType: "meal_note", id: note.id, snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
    expect((await ctx.noteRepository.findById(note.id))?.revision).toBe(note.revision);
  });
});

describe("sleep-note-edit", () => {
  test("muda so o que o agente disse; o resto fica", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "sleep", { trackedSleepTime: 400, score: 70 }, "Sono");
    ctx.gateway.outputs.set("sleep_note_edit", { edits: [{ id: note.id, name: null, trackedSleepTime: 450, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-note-edit", await stepFor(ctx, "sleep-note-edit", { entityType: "sleep_note", id: note.id, snapshot: {} }));
    expect((await ctx.noteRepository.findById(note.id))?.data).toEqual({ trackedSleepTime: 450, score: 70 });
    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
  });

  test("nota fora do formato (score acima de 100) e recusada pelo schema do agente", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "sleep", { trackedSleepTime: 400, score: 70 });
    ctx.gateway.outputs.set("sleep_note_edit", { edits: [{ id: note.id, name: null, trackedSleepTime: null, score: 500, tags: null }] });
    await ctx.targetEditWorker.run("sleep-note-edit", await stepFor(ctx, "sleep-note-edit", { entityType: "sleep_note", id: note.id, snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_invalid" });
    expect((await ctx.noteRepository.findById(note.id))?.data).toEqual({ trackedSleepTime: 400, score: 70 });
  });
});

describe("training-edit", () => {
  const running = { workoutCode: "running", calories: 300, duration: 30, pace: 5, distance: 6, sets: null };

  test("a lista nova vira o treino: nome do catalogo, calorias somadas e as ja existentes preservadas", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "training", {
      workouts: [{ id: "w1", workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 5, distance: 6 }],
      caloriesBurned: 300,
    });
    ctx.gateway.outputs.set("training_edit", { edits: [{ id: note.id, name: null, tags: null, workouts: [
      { ...running, calories: null, duration: 40 },
      { workoutCode: "weightlifting", calories: 100, duration: 20, pace: null, distance: null, sets: [{ exercise: "Supino", repetitions: 10, weight: 40 }] },
    ] }] });
    await ctx.targetEditWorker.run("training-edit", await stepFor(ctx, "training-edit", { entityType: "training_note", id: note.id, snapshot: {} }));

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    const data = (await ctx.noteRepository.findById(note.id))!.data as TrainingData;
    expect(data.workouts).toHaveLength(2);
    expect(data.workouts[0]).toMatchObject({ id: "w1", workoutName: "Corrida", calories: 300, duration: 40 });
    expect(data.workouts[1]).toMatchObject({ workoutCode: "weightlifting", sets: [{ exercise: "Supino", repetitions: 10, weight: 40 }] });
    expect(data.caloriesBurned).toBe(400);
  });

  test("workouts null mantem os treinos e muda so o titulo", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "training", { workouts: [{ id: "w1", workoutCode: "free", workoutName: "Livre", calories: 50, duration: 10 }], caloriesBurned: 50 });
    ctx.gateway.outputs.set("training_edit", { edits: [{ id: note.id, name: "Treino leve", tags: null, workouts: null }] });
    await ctx.targetEditWorker.run("training-edit", await stepFor(ctx, "training-edit", { entityType: "training_note", id: note.id, snapshot: {} }));
    const stored = (await ctx.noteRepository.findById(note.id))!;
    expect(stored.name).toBe("Treino leve");
    expect((stored.data as TrainingData).workouts).toHaveLength(1);
  });
});

describe("agent-skill-note-edit", () => {
  const target = (): EditTarget => ({
    entityType: "skill_note", id: "n1", snapshot: { name: "cafe", path: SKILL_PATH, text: SKILL_TEXT },
  });

  test("grava o arquivo do alvo (caminho vem do alvo) e registra a nota como atualizada", async () => {
    const ctx = setupProcess();
    const text = SKILL_TEXT.replace("15 g", "18 g");
    ctx.gateway.outputs.set("agent_skill_note_edit", { edits: [{ id: "n1", text }] });
    await ctx.targetEditWorker.run("agent-skill-note-edit", await stepFor(ctx, "agent-skill-note-edit", target()));

    expect(ctx.files.written).toEqual([{ path: SKILL_PATH, text }]);
    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect(ctx.store.entityRecords).toMatchObject([{ kind: "note", id: "n1", operation: "update", summary: { name: "cafe", noteType: "skill" } }]);
  });

  test("agent_note vira noteType agent", async () => {
    const ctx = setupProcess();
    ctx.gateway.outputs.set("agent_skill_note_edit", { edits: [{ id: "n1", text: `${SKILL_TEXT}\nmais` }] });
    await ctx.targetEditWorker.run("agent-skill-note-edit", await stepFor(ctx, "agent-skill-note-edit", { ...target(), entityType: "agent_note" }));
    expect(ctx.store.entityRecords[0].summary.noteType).toBe("agent");
  });

  test("perder o cabecalho do arquivo e recusado e nada e gravado", async () => {
    const ctx = setupProcess();
    ctx.gateway.outputs.set("agent_skill_note_edit", { edits: [{ id: "n1", text: "# Só o corpo" }] });
    await ctx.targetEditWorker.run("agent-skill-note-edit", await stepFor(ctx, "agent-skill-note-edit", target()));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
    expect(ctx.files.written).toEqual([]);
  });

  test("texto null (agente avaliou o risco) ou igual ao atual: nada muda e o passo falha com nothing_to_change", async () => {
    const ctx = setupProcess();
    ctx.gateway.outputs.set("agent_skill_note_edit", { edits: [{ id: "n1", text: null }] });
    await ctx.targetEditWorker.run("agent-skill-note-edit", await stepFor(ctx, "agent-skill-note-edit", target()));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
    expect(ctx.files.written).toEqual([]);
  });
});

describe("regras comuns a todo agente com alvo", () => {
  test("o agente so pode devolver o id do alvo: outro id derruba o passo sem gravar", async () => {
    const ctx = setupProcess();
    const mine = await seedNote(ctx, "sleep", { trackedSleepTime: 1, score: 1 });
    const other = await seedNote(ctx, "sleep", { trackedSleepTime: 2, score: 2 });
    ctx.gateway.outputs.set("sleep_note_edit", { edits: [{ id: other.id, name: null, trackedSleepTime: 999, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-note-edit", await stepFor(ctx, "sleep-note-edit", { entityType: "sleep_note", id: mine.id, snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
    expect((await ctx.noteRepository.findById(other.id))?.data).toEqual({ trackedSleepTime: 2, score: 2 });
  });

  test("passo sem alvo falha com target_missing", async () => {
    const ctx = setupProcess();
    await ctx.store.beginSteps("p1", [{ id: "s1", agent: "sleep-note-edit", expected: "one" }], {});
    await ctx.targetEditWorker.run("sleep-note-edit", { processId: "p1", stepId: "s1" });
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_missing" });
  });

  test("o prompt do agente leva o pedido e o retrato do alvo, e nenhuma consulta e permitida", async () => {
    const ctx = setupProcess("durmi 8h");
    const note = await seedNote(ctx, "sleep", { trackedSleepTime: 1, score: 1 });
    ctx.gateway.outputs.set("sleep_note_edit", { edits: [{ id: note.id, name: null, trackedSleepTime: 480, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-note-edit", await stepFor(ctx, "sleep-note-edit", { entityType: "sleep_note", id: note.id, snapshot: { trackedSleepTime: 1 } }));
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.gateway.calls[0].user).toContain("durmi 8h");
    expect(ctx.gateway.calls[0].user).toContain(`"id":"${note.id}"`);
    expect(ctx.sql.calls ?? []).toHaveLength(0);
  });
});

describe("event-edit, task-edit e note-edit com alvo (sem JEV e sem consulta)", () => {
  const noEvent = { name: null, kind: null, startedAt: null, finishedAt: null, description: null, tags: null };

  test("evento: so o alvo, uma chamada ao agente, mesmo que ele peca consulta", async () => {
    const ctx = setupProcess("termina as 18h");
    const event = Event.create({
      userId: "user-1", name: "Reunião", description: "", startedAt: new Date("2026-10-25T12:00:00Z"),
      tags: [], interruptions: [], kind: "routine", noteLinks: [],
    });
    await ctx.eventRepository.save(event);
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: event.id, finishedAt: "2026-10-25T18:00:00-03:00" }], query: { sql: "SELECT 1" } });
    await ctx.editWorker.run("event-edit", await stepFor(ctx, "event-edit", { entityType: "event", id: event.id, snapshot: { name: "Reunião" } }));
    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect((await ctx.eventRepository.findById(event.id))?.finishedAt?.toISOString()).toBe("2026-10-25T21:00:00.000Z");
    expect(ctx.gateway.calls).toHaveLength(1);
  });

  test("evento: id diferente do alvo falha com target_unknown", async () => {
    const ctx = setupProcess();
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: "outro", name: "x" }], query: null });
    await ctx.editWorker.run("event-edit", await stepFor(ctx, "event-edit", { entityType: "event", id: "alvo", snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
  });

  test("tarefa: muda o status do alvo", async () => {
    const ctx = setupProcess();
    const task = Task.create({ userId: "user-1", name: "Aluguel", description: "", tags: [] });
    await ctx.tasks.save(task);
    ctx.gateway.outputs.set("task_edit", {
      edits: [{ id: task.id, name: null, description: null, priority: "high", status: null, tags: null, startedAt: null, estimatedFinishAt: null, finishedAt: null }],
      query: null,
    });
    await ctx.editWorker.run("task-edit", await stepFor(ctx, "task-edit", { entityType: "task", id: task.id, snapshot: {} }));
    expect((await ctx.tasks.findById(task.id))?.priority).toBe("high");
  });

  test("nota de texto: muda o texto do alvo", async () => {
    const ctx = setupProcess();
    const note = await seedNote(ctx, "text", { body: "antes" });
    ctx.gateway.outputs.set("note_edit", { edits: [{ id: note.id, name: null, content: "depois", tags: null }], query: null });
    await ctx.editWorker.run("note-edit", await stepFor(ctx, "note-edit", { entityType: "note", id: note.id, snapshot: {} }));
    expect((await ctx.noteRepository.findById(note.id))?.data).toEqual({ body: "depois" });
  });

  test("sem mudanca nenhuma: nothing_to_change", async () => {
    const ctx = setupProcess();
    ctx.gateway.outputs.set("note_edit", { edits: [], query: null });
    await ctx.editWorker.run("note-edit", await stepFor(ctx, "note-edit", { entityType: "note", id: "n", snapshot: {} }));
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
  });
});
