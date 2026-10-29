import { describe, expect, test } from "vitest";
import { JevUnavailableError } from "./jev-process.client";
import { orient } from "./process-finalizer";
import { toProcessView } from "./process-view";
import { addStep, confident, result, scriptedJev, setupProcess } from "./testing/process-test-kit";

const iso = (hour: number) => `2026-10-25T${String(hour).padStart(2, "0")}:00:00-03:00`;
const evt = (name: string, kind: string, hour: number) =>
  ({ name, kind, startedAt: iso(hour), finishedAt: null, description: null, tags: [] });

/** O exemplo-guia ate os passos concluidos: tres eventos e uma nota de refeicao, cada um no seu passo. */
async function guideExample() {
  const ctx = setupProcess("comendo 300g de arroz com 200g de feijão, depois vou nadar na praia...");
  const events = await addStep(ctx, "s-events", "event-create", "many");
  const notes = await addStep(ctx, "s-notes", "note-create");
  ctx.gateway.outputs.set("event_create", { events: [
    evt("Refeição", "meal", 12), evt("Nadar na praia", "training", 13), evt("Voltar para casa", "routine", 15),
  ] });
  ctx.gateway.outputs.set("note_create", { notes: [
    { type: "meal", name: "Arroz e feijão", content: "300g de arroz, 200g de feijão" },
  ] });
  return { ctx, events, notes };
}

describe("fila de finalizacao", () => {
  test("eventos concluidos primeiro: nada a vincular e o processo segue aberto", async () => {
    const { ctx, events } = await guideExample();
    await ctx.worker.run("event-create", events);
    const jev = scriptedJev(() => result({}));

    await ctx.finalizer(jev.client).run(events);

    expect(jev.ask).not.toHaveBeenCalled();
    expect(ctx.store.entityRecords.every((entity) => entity.finalized)).toBe(true);
    expect(ctx.store.processes.get("p1")?.status).toBe("running");
  });

  test("a nota de refeicao concluida e vinculada ao evento da refeicao e o processo fecha", async () => {
    const { ctx, events, notes } = await guideExample();
    await ctx.worker.run("event-create", events);
    await ctx.finalizer(scriptedJev(() => result({})).client).run(events);
    await ctx.worker.run("note-create", notes);

    const jev = scriptedJev((questions) => {
      const criteria = (questions.link as { criteria: Record<string, string> }).criteria;
      const meal = Object.entries(criteria).find(([, text]) => text.includes("Refeição"));
      return result({ link: confident(meal?.[0] ?? "none") });
    });
    await ctx.finalizer(jev.client).run(notes);

    // O JEV viu o pedido, a nota e os tres eventos (e "nenhum").
    const [, state, questions] = jev.ask.mock.calls[0] as unknown as [unknown, Record<string, string>, { link: { criteria: Record<string, string> } }];
    expect(state.message).toContain("300g de arroz");
    expect(state.entity).toContain("300g de arroz, 200g de feijão");
    expect(Object.keys(questions.link.criteria)).toEqual(["none", "c1", "c2", "c3"]);

    const note = ctx.store.entityRecords.find((entity) => entity.kind === "note");
    const meal = ctx.store.entityRecords.find((entity) => entity.summary.name === "Refeição");
    expect(note?.links).toEqual([{ from: { kind: "note", id: note?.id }, to: { kind: "event", id: meal?.id } }]);

    const stored = await ctx.eventRepository.findById(meal?.id as string);
    expect(stored?.noteLinks.map((link) => link.noteId)).toEqual([note?.id]);
    // Os outros eventos ficaram sem nota.
    const swim = ctx.store.entityRecords.find((entity) => entity.summary.name === "Nadar na praia");
    expect((await ctx.eventRepository.findById(swim?.id as string))?.noteLinks).toEqual([]);

    expect(ctx.store.processes.get("p1")).toMatchObject({ status: "completed", response: { failedSteps: [] } });
  });

  test("a ordem de termino nao importa: nota primeiro, evento depois, e o vinculo acontece quando o evento chega", async () => {
    const { ctx, events, notes } = await guideExample();
    await ctx.worker.run("note-create", notes);
    await ctx.finalizer(scriptedJev(() => result({})).client).run(notes);
    await ctx.worker.run("event-create", events);

    // Cada evento que chega e comparado com a nota; so a refeicao "pertence" a ela.
    const jev = scriptedJev((_questions, state) =>
      result({ link: confident(String(state.entity).includes("Refeição") ? "c1" : "none") }));
    await ctx.finalizer(jev.client).run(events);

    expect(jev.ask).toHaveBeenCalledTimes(3);
    const note = ctx.store.entityRecords.find((entity) => entity.kind === "note");
    const meal = ctx.store.entityRecords.find((entity) => entity.summary.name === "Refeição");
    expect(meal?.links).toEqual([{ from: { kind: "note", id: note?.id }, to: { kind: "event", id: meal?.id } }]);
    expect(ctx.store.entityRecords.filter((entity) => entity.kind === "event" && entity.links.length > 0)).toHaveLength(1);
    expect((await ctx.eventRepository.findById(meal?.id as string))?.noteLinks.map((link) => link.noteId)).toEqual([note?.id]);
  });

  test("resposta incerta ou JEV fora do ar: entidade finalizada sem vinculo, nada some", async () => {
    for (const reply of [
      () => result({ link: confident("c1", 0.9) }),
      () => new JevUnavailableError("provider"),
    ]) {
      const { ctx, events, notes } = await guideExample();
      await ctx.worker.run("event-create", events);
      await ctx.worker.run("note-create", notes);
      await ctx.finalizer(scriptedJev(reply).client).run(notes);

      expect(ctx.store.entityRecords.find((entity) => entity.kind === "note")).toMatchObject({ finalized: true, links: [] });
      expect(ctx.batchWriter.commits).toHaveLength(2);
    }
  });

  test("o JEV escolhe 'nenhum': sem vinculo", async () => {
    const { ctx, events, notes } = await guideExample();
    await ctx.worker.run("event-create", events);
    await ctx.worker.run("note-create", notes);
    await ctx.finalizer(scriptedJev(() => result({ link: confident("none") })).client).run(notes);
    expect(ctx.store.entityRecords.find((entity) => entity.kind === "note")?.links).toEqual([]);
  });

  test("passo que falhou nao trava o processo: ele fecha com a falha registrada", async () => {
    const { ctx, events, notes } = await guideExample();
    await ctx.worker.run("event-create", events);
    ctx.gateway.outputs.delete("note_create");
    await ctx.worker.run("note-create", notes);
    const jev = scriptedJev(() => result({}));
    await ctx.finalizer(jev.client).run(events);
    await ctx.finalizer(jev.client).run(notes);

    expect(ctx.store.processes.get("p1")).toMatchObject({
      status: "completed", response: { failedSteps: [{ agent: "note-create", errorCode: "internal" }] },
    });
  });

  test("todos os passos falharam: processo falhou", async () => {
    const { ctx, events } = await guideExample();
    ctx.gateway.outputs.delete("event_create");
    await ctx.worker.run("event-create", events);
    ctx.store.stepRecords.splice(1);
    await ctx.finalizer(scriptedJev(() => result({})).client).run(events);
    expect(ctx.store.processes.get("p1")?.status).toBe("failed");
  });
});

describe("explicacao da falha", () => {
  /** O processo fecha na ultima finalizacao a rodar, seja de passo concluido ou de passo que falhou. */
  async function withFailedNotes(explanation?: string) {
    const { ctx, events, notes } = await guideExample();
    if (explanation) ctx.gateway.outputs.set("failure_explainer", { message: explanation });
    await ctx.worker.run("event-create", events);
    ctx.gateway.outputs.delete("note_create");
    await ctx.worker.run("note-create", notes);
    const jev = scriptedJev(() => result({}));
    await ctx.finalizer(jev.client).run(events);
    return { ctx, notes, finalize: () => ctx.finalizer(jev.client).run(notes) };
  }

  test("so quando algum passo falha, uma chamada curta diz o que falhou e o que deu certo", async () => {
    const { ctx, finalize } = await withFailedNotes("Criei os eventos, mas não consegui criar a nota.");

    await finalize();

    const call = ctx.gateway.calls.find((candidate) => candidate.schemaName === "failure_explainer");
    expect(call?.user).toContain("Criando notas (código: internal)");
    expect(call?.user).toContain("Criando eventos");
    const process = ctx.store.require("p1");
    expect(process).toMatchObject({ status: "completed", response: { explanation: "Criei os eventos, mas não consegui criar a nota." } });
    expect(toProcessView(process, ctx.store.stepRecords, []).message).toBe("Criei os eventos, mas não consegui criar a nota.");
  });

  test("se a explicacao tambem falha, vale a linha predefinida", async () => {
    const { ctx, finalize } = await withFailedNotes();
    await finalize();
    const process = ctx.store.require("p1");
    expect(process.response?.explanation).toBeUndefined();
    expect(toProcessView(process, ctx.store.stepRecords, []).message).toBe("Não consegui concluir: criando notas.");
  });

  test("sucesso total nunca chama o modelo de explicacao", async () => {
    const { ctx, events, notes } = await guideExample();
    await ctx.worker.run("event-create", events);
    await ctx.worker.run("note-create", notes);
    const jev = scriptedJev(() => result({ link: confident("none") }));
    await ctx.finalizer(jev.client).run(events);
    await ctx.finalizer(jev.client).run(notes);
    expect(ctx.store.require("p1").status).toBe("completed");
    expect(ctx.gateway.calls.some((call) => call.schemaName === "failure_explainer")).toBe(false);
  });
});

describe("series na finalizacao", () => {
  test("a primeira ocorrencia de uma serie nao e vinculada a nota: o vinculo valeria para um dia so", async () => {
    const ctx = setupProcess("corrida toda segunda, e anota que preciso de tênis");
    const series = await addStep(ctx, "s-series", "recurring-event-create");
    const notes = await addStep(ctx, "s-notes", "note-create");
    ctx.gateway.outputs.set("recurring_event_create", { series: [{
      name: "Corrida", kind: "training", description: null, tags: [], frequency: "weekly", interval: null, weekdays: ["mon"],
      monthDay: null, month: null, timeOfDay: "07:00", durationMinutes: null, startsOn: null, endsOn: null,
    }] });
    ctx.gateway.outputs.set("note_create", { notes: [{ type: "text", name: "Tênis", content: "Preciso de tênis" }] });
    await ctx.worker.run("recurring-event-create", series);
    await ctx.worker.run("note-create", notes);
    const jev = scriptedJev(() => result({ link: confident("c1") }));

    await ctx.finalizer(jev.client).run(series);
    await ctx.finalizer(jev.client).run(notes);

    expect(jev.ask).not.toHaveBeenCalled();
    expect(ctx.store.entityRecords.every((entity) => entity.finalized && entity.links.length === 0)).toBe(true);
  });
});

describe("sentido do vinculo", () => {
  test("nota aponta para tarefa e evento; tarefa aponta para evento", () => {
    const note = { kind: "note" as const };
    const task = { kind: "task" as const };
    const event = { kind: "event" as const };
    expect(orient(event, note)).toEqual({ from: note, to: event });
    expect(orient(task, note)).toEqual({ from: note, to: task });
    expect(orient(event, task)).toEqual({ from: task, to: event });
  });
});
