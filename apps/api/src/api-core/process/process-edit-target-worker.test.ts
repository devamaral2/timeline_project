import { describe, expect, test } from "vitest";
import { Event, Note, Task } from "../../domain";
import { EDIT_TARGET_AGENTS } from "./process-steps";
import { uiConfig } from "./process-config";
import { mealData, setupProcess } from "./testing/process-test-kit";

const hash = "a".repeat(64);

async function dispatching(prompt = "pedido") {
  const ctx = setupProcess(prompt);
  ctx.store.processes.get("p1")!.status = "dispatching";
  return ctx;
}

const run = (ctx: ReturnType<typeof setupProcess>, entityType: string, entityId: string) =>
  ctx.editTargetWorker.run({ processId: "p1", entityType: entityType as never, entityId });

describe("worker da edicao pela tela de detalhe", () => {
  test("a escolha do agente e uma tabela: cada tipo tem o seu", () => {
    expect(EDIT_TARGET_AGENTS).toEqual({
      event: "event-edit", task: "task-edit", note: "note-edit", meal_note: "food-note-edit",
      sleep_note: "sleep-note-edit", training_note: "training-edit",
      skill_note: "agent-skill-note-edit", agent_note: "agent-skill-note-edit",
    });
  });

  test("evento: cria um passo event-edit com o retrato completo do alvo", async () => {
    const ctx = await dispatching();
    const event = Event.create({
      userId: "user-1", name: "Reunião", description: "pauta", startedAt: new Date("2026-10-25T12:00:00Z"),
      tags: ["trabalho"], interruptions: [], kind: "routine", noteLinks: [],
    });
    await ctx.eventRepository.save(event);

    await run(ctx, "event", event.id);

    expect(ctx.store.require("p1").status).toBe("running");
    expect(ctx.store.stepRecords).toMatchObject([{
      agent: "event-edit", status: "pending",
      input: { target: { entityType: "event", id: event.id, snapshot: { name: "Reunião", description: "pauta", tags: ["trabalho"] } } },
    }]);
    expect(ctx.store.jobs.at(-1)).toMatchObject({ kind: "process-event-edit" });
  });

  test("tarefa: cria um passo task-edit", async () => {
    const ctx = await dispatching();
    const task = Task.create({ userId: "user-1", name: "Aluguel", description: "", tags: [] });
    await ctx.tasks.save(task);
    await run(ctx, "task", task.id);
    expect(ctx.store.stepRecords).toMatchObject([{ agent: "task-edit", input: { target: { id: task.id, snapshot: { name: "Aluguel" } } } }]);
  });

  test.each([
    ["note", "text", { body: "oi" }, "note-edit"],
    ["meal_note", "meal", mealData("arroz"), "food-note-edit"],
    ["sleep_note", "sleep", { trackedSleepTime: 450, score: 80 }, "sleep-note-edit"],
    ["training_note", "training", { workouts: [], caloriesBurned: 0 }, "training-edit"],
  ])("%s: o agente certo, com o retrato do alvo", async (entityType, type, data, agent) => {
    const ctx = await dispatching();
    const note = Note.create({ userId: "user-1", name: "Nota", type, data, tags: ["x"] });
    await ctx.noteRepository.save(note);
    await run(ctx, entityType, note.id);
    expect(ctx.store.stepRecords).toMatchObject([{ agent, input: { target: { entityType, id: note.id, snapshot: { name: "Nota", tags: ["x"] } } } }]);
  });

  test("skill: o retrato traz o caminho e o texto atual do arquivo", async () => {
    const ctx = await dispatching();
    ctx.files.texts.set("hermes/skills/cafe/SKILL.md", "---\nname: cafe\n---\n# Café");
    const note = Note.create({
      userId: "user-1", name: "cafe", type: "skill", tags: ["skill"],
      data: { path: "hermes/skills/cafe/SKILL.md", hash, missing: false },
    });
    await ctx.noteRepository.save(note);
    await run(ctx, "skill_note", note.id);
    expect(ctx.store.stepRecords).toMatchObject([{
      agent: "agent-skill-note-edit",
      input: { target: { snapshot: { path: "hermes/skills/cafe/SKILL.md", text: "---\nname: cafe\n---\n# Café" } } },
    }]);
  });

  test.each([
    ["inexistente", "event", "nao-existe", "not_found"],
  ])("falha %s", async (_label, entityType, id, code) => {
    const ctx = await dispatching();
    await run(ctx, entityType, id);
    expect(ctx.store.stepRecords).toHaveLength(0);
    expect(ctx.store.require("p1")).toMatchObject({
      status: "failed", response: { failedSteps: [], text: uiConfig.targetFailed[code as "not_found"] },
    });
  });

  test("entidade de outro usuario e tratada como inexistente", async () => {
    const ctx = await dispatching();
    const task = Task.create({ userId: "outro", name: "Segredo", description: "", tags: [] });
    await ctx.tasks.save(task);
    await run(ctx, "task", task.id);
    expect(ctx.store.require("p1").status).toBe("failed");
    expect(ctx.store.stepRecords).toHaveLength(0);
  });

  test("tipo informado que nao bate com a nota falha com type_mismatch", async () => {
    const ctx = await dispatching();
    const note = Note.create({ userId: "user-1", name: "Sono", type: "sleep", data: { trackedSleepTime: 1, score: 1 }, tags: [] });
    await ctx.noteRepository.save(note);
    await run(ctx, "meal_note", note.id);
    expect(ctx.store.require("p1")).toMatchObject({ status: "failed", response: { text: uiConfig.targetFailed.type_mismatch } });
  });

  test("refeicao ainda sendo gerada falha com busy", async () => {
    const ctx = await dispatching();
    const note = Note.create({
      userId: "user-1", name: "Almoço", type: "meal", tags: [],
      data: mealData("arroz", "pending"),
    });
    await ctx.noteRepository.save(note);
    await run(ctx, "meal_note", note.id);
    expect(ctx.store.require("p1").response?.text).toBe(uiConfig.targetFailed.busy);
  });

  test("skill sem arquivo (ou marcada como sumida) falha com not_found", async () => {
    const ctx = await dispatching();
    const note = Note.create({ userId: "user-1", name: "x", type: "skill", tags: [], data: { path: "hermes/skills/x/SKILL.md", hash, missing: false } });
    await ctx.noteRepository.save(note);
    await run(ctx, "skill_note", note.id);
    expect(ctx.store.require("p1").response?.text).toBe(uiConfig.targetFailed.not_found);
  });

  test("processo que nao esta mais despachando e ignorado", async () => {
    const ctx = setupProcess();
    await run(ctx, "event", "qualquer");
    expect(ctx.store.stepRecords).toHaveLength(0);
    expect(ctx.store.require("p1").status).toBe("running");
  });
});

describe("fluxo da edicao pela tela de detalhe, ponta a ponta (em memoria)", () => {
  test("rota -> worker escolhe o agente -> agente edita -> finalizacao fecha o processo sem JEV", async () => {
    const ctx = setupProcess();
    ctx.store.processes.delete("p1");
    const note = Note.create({ userId: "user-1", name: "Sono", type: "sleep", data: { trackedSleepTime: 400, score: 70 }, tags: [] });
    await ctx.noteRepository.save(note);
    await ctx.store.startEdit({ id: "p1", userId: "user-1", actorId: "user-1", prompt: "dormi 8h", entityType: "sleep_note", entityId: note.id });
    expect(ctx.store.require("p1").status).toBe("dispatching");

    await ctx.editTargetWorker.run({ processId: "p1", entityType: "sleep_note", entityId: note.id });
    const [step] = ctx.store.stepRecords;
    expect(step.agent).toBe("sleep-note-edit");

    ctx.gateway.outputs.set("sleep_note_edit", { edits: [{ id: note.id, name: null, trackedSleepTime: 480, score: null, tags: null }] });
    await ctx.targetEditWorker.run("sleep-note-edit", { processId: "p1", stepId: step.id });

    const jev = { ask: async () => { throw new Error("o JEV nao participa da edicao com alvo"); } };
    await ctx.finalizer(jev as never).run({ processId: "p1", stepId: step.id });

    expect(ctx.store.require("p1")).toMatchObject({ status: "completed", response: { failedSteps: [] } });
    expect((await ctx.noteRepository.findById(note.id))?.data).toEqual({ trackedSleepTime: 480, score: 70 });
  });
});
