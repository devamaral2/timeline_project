import { describe, expect, test } from "vitest";
import { Artifact, Event } from "../../domain";
import { FastStageError } from "../agent/errors/agent.errors";
import type { EditCandidate } from "./request-candidates";
import { addStep, setupRequest } from "./testing/request-test-kit";

const iso = (hour: number) => `2026-10-25T${String(hour).padStart(2, "0")}:00:00-03:00`;
const noTask = {
  name: null, kind: null, status: null, priority: null, startedAt: null, estimatedFinishAt: null, finishedAt: null,
  description: null, tags: null,
};

async function seedTask(ctx: ReturnType<typeof setupRequest>, name = "Trabalhar", extra: Partial<Parameters<typeof Event.create>[0]> = {}) {
  const event = Event.create({ userId: "user-1", name, startedAt: new Date("2026-10-25T12:00:00Z"), ...extra });
  await ctx.eventRepository.save(event);
  return event;
}

const candidate = (kind: EditCandidate["kind"], id: string, name: string): EditCandidate => ({ kind, id, name });
const updated = async (ctx: ReturnType<typeof setupRequest>) => ctx.store.entities("r1");

describe("passo de editar tarefas", () => {
  test("'parei de trabalhar' altera so o fim planejado da tarefa escolhido pelo JEV, num commit proprio", async () => {
    const ctx = setupRequest("parei de trabalhar");
    const event = await seedTask(ctx);
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [candidate("task", event.id, "Trabalhar")] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: event.id, estimatedFinishAt: iso(18) }], query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    const stored = await ctx.eventRepository.findById(event.id);
    expect(stored?.estimatedFinishAt?.toISOString()).toBe(new Date(iso(18)).toISOString());
    expect(stored?.name).toBe("Trabalhar");
    expect(stored?.revision).toBe(event.revision + 1);
    expect(await updated(ctx)).toMatchObject([{ kind: "task", id: event.id, operation: "update", summary: { name: "Trabalhar" } }]);
    expect(ctx.store.jobs.filter((job) => job.kind === "request-finalize")).toHaveLength(1);
    // O agente recebeu os candidatos que o JEV escolheu, e nada mais.
    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.gateway.calls[0]?.user).toContain(event.id);
  });

  test("mudar o local: o lugar dito vira o endereco achado no mapa; texto vazio tira o local", async () => {
    const ctx = setupRequest("a consulta vai ser no Hospital Mater Dei");
    const here = { latitude: -19.92, longitude: -43.94 };
    ctx.request.context = { screen: "chat", coordinates: here };
    ctx.places.addresses.set("Hospital Mater Dei", "Hospital Mater Dei Santo Agostinho, Rua Gonçalves Dias 3155, Belo Horizonte");
    const event = await seedTask(ctx, "Consulta", { location: "Consultório antigo" });
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [candidate("task", event.id, "Consulta")] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: event.id, location: "Hospital Mater Dei" }], query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.places.calls).toEqual([{ said: "Hospital Mater Dei", near: here }]);
    expect((await ctx.eventRepository.findById(event.id))?.location).toBe(
      "Hospital Mater Dei Santo Agostinho, Rua Gonçalves Dias 3155, Belo Horizonte",
    );

    const clearing = setupRequest("tira o local da consulta");
    const located = await seedTask(clearing, "Consulta", { location: "Consultório antigo" });
    const clear = await addStep(clearing, "s1", "task-edit", "one", { candidates: [candidate("task", located.id, "Consulta")] });
    clearing.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: located.id, location: "" }], query: null });

    await clearing.editWorker.run("task-edit", clear);

    expect(clearing.places.calls).toEqual([]);
    expect((await clearing.eventRepository.findById(located.id))?.location).toBe("");
  });

  test("concluir uma tarefa acompanhada: status e conclusao real", async () => {
    const ctx = setupRequest("já paguei o aluguel");
    const event = await seedTask(ctx, "Pagar o aluguel", { status: "todo", startedAt: undefined });
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [candidate("task", event.id, "Pagar o aluguel")] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: event.id, status: "done", finishedAt: iso(10) }], query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(await ctx.eventRepository.findById(event.id)).toMatchObject({ status: "done", finishedAt: new Date(iso(10)) });
  });

  test("tres tarefas no mesmo passo, um commit; os demais nao sao tocados", async () => {
    const ctx = setupRequest();
    const events = [await seedTask(ctx, "A", { status: "todo" }), await seedTask(ctx, "B", { status: "todo" }), await seedTask(ctx, "C", { status: "todo" })];
    const other = await seedTask(ctx, "Almoço");
    const payload = await addStep(ctx, "s1", "task-edit", "many", { candidates: events.map((event) => candidate("task", event.id, event.name)) });
    ctx.gateway.outputs.set("task_edit", { edits: events.map((event) => ({ ...noTask, id: event.id, priority: "high" })), query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.batchWriter.commits).toHaveLength(1);
    expect(ctx.batchWriter.commits[0]?.tasks.map((change) => change.op)).toEqual(["update", "update", "update"]);
    expect(await updated(ctx)).toHaveLength(3);
    expect((await ctx.eventRepository.findById(other.id))?.revision).toBe(other.revision);
  });

  test("nenhum candidato serve: o agente pede UMA consulta e e chamado de novo com o resultado", async () => {
    const ctx = setupRequest("terminei a reunião");
    const real = await seedTask(ctx, "Reunião");
    ctx.sql.run = async (input) => {
      ctx.sql.calls.push(input);
      return { ok: true, columns: ["id", "name"], rows: [[real.id, "Reunião"]], truncated: false };
    };
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [] });
    let round = 0;
    ctx.gateway.complete = async (input) => {
      ctx.gateway.calls.push(input);
      round += 1;
      return round === 1
        ? { modelName: "stub", value: { edits: [], query: { sql: "SELECT id, name FROM tasks" } } }
        : { modelName: "stub", value: { edits: [{ ...noTask, id: real.id, estimatedFinishAt: iso(11) }], query: null } };
    };

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.sql.calls).toEqual([{ userId: "user-1", sql: "SELECT id, name FROM tasks" }]);
    expect(ctx.gateway.calls).toHaveLength(2);
    expect(ctx.gateway.calls[1]?.user).toContain("Resultado da consulta");
    expect(ctx.store.stepRecords[0]?.status).toBe("done");
  });

  test("so uma rodada extra: depois da consulta, outra consulta nao e executada", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [] });
    ctx.gateway.complete = async (input) => {
      ctx.gateway.calls.push(input);
      return { modelName: "stub", value: { edits: [], query: { sql: "SELECT id FROM tasks" } } };
    };

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.sql.calls).toHaveLength(1);
    expect(ctx.gateway.calls).toHaveLength(2);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "not_found" });
  });

  test("id que nao veio dos candidatos nem da consulta e recusado, nada e gravado", async () => {
    const ctx = setupRequest();
    const event = await seedTask(ctx);
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: event.id, name: "Outro" }], query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "target_unknown" });
    expect(ctx.batchWriter.commits).toHaveLength(0);
  });

  test("um pedido ou passo do agente nunca e alvo de edicao", async () => {
    const ctx = setupRequest();
    const agentEvent = Event.create({ userId: "user-1", actor: "agent", kind: "request", status: "done", name: "pedido antigo" });
    await ctx.eventRepository.save(agentEvent);
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [candidate("task", agentEvent.id, "pedido antigo")] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: agentEvent.id, name: "Outro" }], query: null });

    await ctx.editWorker.run("task-edit", payload);

    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });

  test("consulta recusada pelo executor", async () => {
    const ctx = setupRequest("x", { ok: false, error: "so SELECT" });
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [] });
    ctx.gateway.outputs.set("task_edit", { edits: [], query: { sql: "DELETE FROM events" } });
    await ctx.editWorker.run("task-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "query_rejected" });
  });

  test("edicao sem nenhum campo novo falha com codigo, sem perguntar", async () => {
    const ctx = setupRequest();
    const event = await seedTask(ctx);
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [candidate("task", event.id, "Trabalhar")] });
    ctx.gateway.outputs.set("task_edit", { edits: [{ ...noTask, id: event.id }], query: null });
    await ctx.editWorker.run("task-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "nothing_to_change" });
  });

  test("modelo fora do ar: passo vermelho, sem repetir", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "task-edit", "one", { candidates: [] });
    ctx.gateway.failure = new FastStageError("timeout");
    await ctx.editWorker.run("task-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    expect(ctx.gateway.calls).toHaveLength(1);
  });
});

describe("passo de editar artefatos", () => {
  test("alterar o texto de um artefato de texto", async () => {
    const ctx = setupRequest();
    const artifact = Artifact.create({ userId: "user-1", name: "Ideia", data: { body: "Visão semanal" } });
    await ctx.artifactRepository.save(artifact);
    const payload = await addStep(ctx, "s1", "artifact-edit", "one", { candidates: [candidate("artifact", artifact.id, "Ideia")] });
    ctx.gateway.outputs.set("artifact_edit", { edits: [{ id: artifact.id, name: null, content: "Visão semanal e mensal", tags: null }], query: null });

    await ctx.editWorker.run("artifact-edit", payload);

    expect(ctx.store.stepRecords[0]?.status).toBe("done");
    expect((await ctx.artifactRepository.findById(artifact.id))?.data).toMatchObject({ body: "Visão semanal e mensal" });
    expect((await updated(ctx))[0]).toMatchObject({
      kind: "artifact", operation: "update", summary: { name: "Ideia", artifactType: "text", text: "Visão semanal e mensal" },
    });
  });

  test("so artefatos de texto tem texto editavel", async () => {
    const ctx = setupRequest();
    const sleep = Artifact.create({ userId: "user-1", type: "sleep", data: { trackedSleepTime: 400, score: 70 } });
    await ctx.artifactRepository.save(sleep);
    const payload = await addStep(ctx, "s1", "artifact-edit", "one", { candidates: [candidate("artifact", sleep.id, "Sono")] });
    ctx.gateway.outputs.set("artifact_edit", { edits: [{ id: sleep.id, name: null, content: "texto", tags: null }], query: null });
    await ctx.editWorker.run("artifact-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });
});
