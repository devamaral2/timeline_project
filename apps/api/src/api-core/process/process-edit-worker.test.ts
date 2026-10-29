import { describe, expect, test } from "vitest";
import { Event, Note, Task } from "../../domain";
import { FastStageError } from "../agent/errors/agent.errors";
import type { EditCandidate } from "./process-candidates";
import { addStep, setupProcess } from "./testing/process-test-kit";

const iso = (hour: number) => `2026-10-25T${String(hour).padStart(2, "0")}:00:00-03:00`;
const noEvent = { name: null, kind: null, startedAt: null, finishedAt: null, description: null, tags: null };
const noTask = { name: null, description: null, priority: null, status: null, tags: null, startedAt: null, estimatedFinishAt: null, finishedAt: null };

async function seedEvent(ctx: ReturnType<typeof setupProcess>, name = "Trabalhar") {
  const event = Event.create({
    userId: "user-1", name, description: "", startedAt: new Date("2026-10-25T12:00:00Z"),
    tags: [], interruptions: [], kind: "routine", noteLinks: [],
  });
  await ctx.eventRepository.save(event);
  return event;
}

const candidate = (kind: EditCandidate["kind"], id: string, name: string): EditCandidate => ({ kind, id, name });

describe("passo de editar eventos", () => {
  test("'parei de trabalhar' altera so o fim do evento escolhido pelo JEV, num commit proprio", async () => {
    const ctx = setupProcess("parei de trabalhar");
    const event = await seedEvent(ctx);
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [candidate("event", event.id, "Trabalhar")] });
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: event.id, finishedAt: iso(18) }], query: null });

    await ctx.editWorker.run("event-edit", payload);

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    const stored = await ctx.eventRepository.findById(event.id);
    expect(stored?.finishedAt?.toISOString()).toBe(new Date(iso(18)).toISOString());
    expect(stored?.name).toBe("Trabalhar");
    expect(stored?.revision).toBe(event.revision + 1);
    expect(ctx.store.entityRecords).toMatchObject([{ kind: "event", id: event.id, operation: "update", summary: { name: "Trabalhar" } }]);
    expect(ctx.store.jobs.filter((job) => job.kind === "process-finalize")).toHaveLength(1);
    // O agente recebeu os candidatos que o JEV escolheu, e nada mais.
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.gateway.calls[0].user).toContain(event.id);
  });

  test("a edicao nao desloca nem corrige outros eventos que passem a se sobrepor", async () => {
    const ctx = setupProcess();
    const first = await seedEvent(ctx, "Reunião");
    const second = await seedEvent(ctx, "Almoço");
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [candidate("event", first.id, "Reunião")] });
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: first.id, startedAt: iso(9), finishedAt: iso(14) }], query: null });

    await ctx.editWorker.run("event-edit", payload);

    expect(ctx.batchWriter.commits[0].events.map((change) => change.op)).toEqual(["update"]);
    expect((await ctx.eventRepository.findById(second.id))?.revision).toBe(second.revision);
  });

  test("nenhum candidato serve: o agente pede UMA consulta e e chamado de novo com o resultado", async () => {
    const event = { id: "" };
    const ctx = setupProcess("terminei a reunião", { ok: true, columns: ["id", "name"], rows: [], truncated: false });
    const real = await seedEvent(ctx, "Reunião");
    event.id = real.id;
    // A consulta devolve o evento procurado.
    ctx.sql.run = async (input) => {
      ctx.sql.calls.push(input);
      return { ok: true, columns: ["id", "name"], rows: [[real.id, "Reunião"]], truncated: false };
    };
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [] });
    let round = 0;
    ctx.gateway.complete = async (input) => {
      ctx.gateway.calls.push(input);
      round += 1;
      return round === 1
        ? { modelName: "stub", value: { edits: [], query: { sql: "SELECT id, name FROM events" } } }
        : { modelName: "stub", value: { edits: [{ ...noEvent, id: real.id, finishedAt: iso(11) }], query: null } };
    };

    await ctx.editWorker.run("event-edit", payload);

    expect(ctx.sql.calls).toEqual([{ userId: "user-1", sql: "SELECT id, name FROM events", scope: { includeChat: false } }]);
    expect(ctx.gateway.calls).toHaveLength(2);
    expect(ctx.gateway.calls[1].user).toContain("Resultado da consulta");
    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect((await ctx.eventRepository.findById(real.id))?.finishedAt).toBeDefined();
  });

  test("so uma rodada extra: depois da consulta, outra consulta nao e executada", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [] });
    ctx.gateway.complete = async (input) => {
      ctx.gateway.calls.push(input);
      return { modelName: "stub", value: { edits: [], query: { sql: "SELECT id FROM events" } } };
    };

    await ctx.editWorker.run("event-edit", payload);

    expect(ctx.sql.calls).toHaveLength(1);
    expect(ctx.gateway.calls).toHaveLength(2);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "not_found" });
  });

  test("id que nao veio dos candidatos nem da consulta e recusado, nada e gravado", async () => {
    const ctx = setupProcess();
    const event = await seedEvent(ctx);
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [] });
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: event.id, name: "Outro" }], query: null });

    await ctx.editWorker.run("event-edit", payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
    expect(ctx.batchWriter.commits).toHaveLength(0);
  });

  test.each([
    ["consulta recusada pelo executor", { ok: false as const, error: "so SELECT" }, "query_rejected"],
  ])("%s", async (_, outcome, code) => {
    const ctx = setupProcess("x", outcome);
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [] });
    ctx.gateway.outputs.set("event_edit", { edits: [], query: { sql: "DELETE FROM events" } });
    await ctx.editWorker.run("event-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: code });
  });

  test("edicao sem nenhum campo novo falha com codigo, sem perguntar", async () => {
    const ctx = setupProcess();
    const event = await seedEvent(ctx);
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [candidate("event", event.id, "Trabalhar")] });
    ctx.gateway.outputs.set("event_edit", { edits: [{ ...noEvent, id: event.id }], query: null });
    await ctx.editWorker.run("event-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
  });

  test("modelo fora do ar: passo vermelho, sem repetir", async () => {
    const ctx = setupProcess();
    const payload = await addStep(ctx, "s1", "event-edit", "one", { candidates: [] });
    ctx.gateway.failure = new FastStageError("process", "timeout");
    await ctx.editWorker.run("event-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    expect(ctx.gateway.calls).toHaveLength(1);
  });
});

describe("passo de editar tarefas e notas", () => {
  test("concluir uma tarefa", async () => {
    const ctx = setupProcess("concluí o aluguel");
    const task = Task.create({ userId: "user-1", name: "Pagar o aluguel", description: "", tags: [] });
    await ctx.tasks.save(task);
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [candidate("task", task.id, "Pagar o aluguel")] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: task.id, status: "done", finishedAt: iso(10) }], query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect((await ctx.tasks.findById(task.id))?.status).toBe("done");
    expect(ctx.store.entityRecords[0]).toMatchObject({ kind: "task", operation: "update" });
  });

  test("tres tarefas no mesmo passo, um commit", async () => {
    const ctx = setupProcess();
    const tasks = [1, 2, 3].map((n) => Task.create({ userId: "user-1", name: `Tarefa ${n}`, description: "", tags: [] }));
    for (const task of tasks) await ctx.tasks.save(task);
    const payload = await addStep(ctx, "s1", "task-edit", "many", {
      candidates: tasks.map((task) => candidate("task", task.id, task.name)),
    });
    ctx.gateway.outputs.set("task_edit", { edits: tasks.map((task) => ({ ...noTask, id: task.id, priority: "high" })), query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    expect(ctx.store.entityRecords).toHaveLength(3);
  });

  test("alterar o texto de uma nota", async () => {
    const ctx = setupProcess();
    const note = Note.create({ userId: "user-1", name: "Ideia", data: { body: "Visão semanal" } });
    await ctx.noteRepository.save(note);
    const payload = await addStep(ctx, "s1", "note-edit", "one", { candidates: [candidate("note", note.id, "Ideia")] });
    ctx.gateway.outputs.set("note_edit", { edits: [{ id: note.id, name: null, content: "Visão semanal e mensal", tags: null }], query: null });

    await ctx.editWorker.run("note-edit", payload);

    expect(ctx.store.stepRecords[0].status).toBe("succeeded");
    expect((await ctx.noteRepository.findById(note.id))?.data).toMatchObject({ body: "Visão semanal e mensal" });
    expect(ctx.store.entityRecords[0].summary).toMatchObject({ name: "Ideia", noteType: "text", text: "Visão semanal e mensal" });
  });
});
