import { describe, expect, test } from "vitest";
import { JevUnavailableError } from "./jev-process.client";
import { dispatchConfig } from "./process-config";
import { ProcessDispatcher } from "./process-dispatcher";
import { InMemoryProcessStore } from "./testing/in-memory-process-store";
import type { CandidateQuery, EditCandidate } from "./process-candidates";
import { confident, result, scriptedJev } from "./testing/process-test-kit";

const NONE = (name: string) => (name === "query" ? "no" : "none");

/** Todas as perguntas respondidas "nenhum", com as escolhas combinadas por cima. */
function answers(overrides: Record<string, ReturnType<typeof confident>> = {}) {
  const all: Record<string, ReturnType<typeof confident>> = {};
  for (const name of Object.keys(dispatchConfig.questions)) all[name] = confident(NONE(name));
  return result({ ...all, ...overrides });
}

function setup(respond: Parameters<typeof scriptedJev>[0]) {
  const store = new InMemoryProcessStore();
  store.seed({ id: "p1", prompt: "pedido", status: "dispatching" });
  const jev = scriptedJev(respond);
  return { store, jev, dispatcher: new ProcessDispatcher(store, jev.client) };
}

describe("despacho pelo JEV de entrada", () => {
  test("o exemplo-guia aciona a fila de eventos (vários) e a de notas (uma), de uma vez", async () => {
    const { store, dispatcher, jev } = setup(() => answers({
      event_create: confident("many"), note_create: confident("one"),
    }));

    await dispatcher.run("p1");

    expect(store.stepRecords.map((step) => [step.agent, step.expected])).toEqual([
      ["event-create", "many"], ["note-create", "one"],
    ]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["process-event-create", "process-note-create"]);
    expect(store.processes.get("p1")?.status).toBe("running");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    // Uma unica chamada leva todas as perguntas de operacao x entidade e a consulta.
    expect(Object.keys(jev.ask.mock.calls[0][2])).toEqual(Object.keys(dispatchConfig.questions));
    expect(store.dispatch).toMatchObject({ model: "jev-test", uncertain: [], unsupported: [] });
  });

  test("nenhuma operacao reconhecida vai ao fallback", async () => {
    const { store, dispatcher } = setup(() => answers());
    await dispatcher.run("p1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["process-fallback"]);
    expect(store.dispatch).toMatchObject({ fallbackReason: "no_step" });
  });

  test("toda pergunta de operacao do JEV tem agente: nenhum pedido reconhecido sobra sem fila", async () => {
    const { store, dispatcher } = setup(() => answers({
      recurring_event_create: confident("one"), recurring_task_create: confident("many"),
      recurring_event_edit: confident("one"), recurring_task_edit: confident("one"),
    }));
    await dispatcher.run("p1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual([
      "recurring-event-create", "recurring-event-edit", "recurring-task-create", "recurring-task-edit",
    ]);
    expect(store.dispatch).toMatchObject({ unsupported: [] });
  });

  test("consulta pura aciona a fila de consulta", async () => {
    const { store, dispatcher } = setup(() => answers({ query: confident("yes") }));
    await dispatcher.run("p1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["query"]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["process-query"]);
  });

  test("resposta incerta em qualquer pergunta manda ao fallback", async () => {
    const { store, dispatcher } = setup(() => answers({
      event_create: confident("one"), note_create: confident("one", 0.9),
    }));
    await dispatcher.run("p1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(store.dispatch).toMatchObject({ fallbackReason: "uncertain", uncertain: ["note_create"] });
  });

  test.each([
    ["sem chave", new JevUnavailableError("no_api_key"), "jev_no_api_key"],
    ["provedor fora", new JevUnavailableError("provider"), "jev_provider"],
  ])("JEV indisponivel (%s) vai ao fallback", async (_, error, reason) => {
    const { store, dispatcher } = setup(() => error);
    await dispatcher.run("p1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(store.dispatch).toMatchObject({ fallbackReason: reason });
  });

  test("so despacha processos que ainda esperam despacho", async () => {
    const { store, dispatcher, jev } = setup(() => answers({ event_create: confident("one") }));
    store.require("p1").status = "running";
    await dispatcher.run("p1");
    expect(jev.ask).not.toHaveBeenCalled();
    expect(store.stepRecords).toHaveLength(0);
  });
});

describe("candidatos de edicao escolhidos pelo JEV", () => {
  const shortlist: EditCandidate[] = [
    { kind: "event", id: "e1", name: "Reunião", eventKind: "routine" },
    { kind: "event", id: "e2", name: "Almoço", eventKind: "meal" },
    { kind: "task", id: "t1", name: "Pagar o aluguel", status: "todo" },
    { kind: "task", id: "t2", name: "Ligar para o dentista", status: "todo" },
    { kind: "note", id: "n1", name: "Ideia", noteType: "text" },
  ];

  /** Primeira chamada: despacho. Segunda: uma pergunta binaria por candidato. */
  function twoStage(chosen: Record<string, ReturnType<typeof confident>>) {
    const query: CandidateQuery = { shortlist: async () => shortlist };
    const store = new InMemoryProcessStore();
    store.seed({ id: "p1", prompt: "terminei a reunião e paguei o aluguel", status: "dispatching" });
    const jev = scriptedJev((questions) => {
      if ("c1" in questions) return result(chosen);
      return answers({ event_edit: confident("one"), task_edit: confident("one") });
    });
    return { store, jev, dispatcher: new ProcessDispatcher(store, jev.client, query), query };
  }

  test("o servidor lista os candidatos dos tipos pedidos e o JEV escolhe; cada passo recebe os do seu tipo", async () => {
    const calls: string[][] = [];
    const { store, jev, dispatcher, query } = twoStage({
      c1: confident("edit"), c2: confident("keep"), c3: confident("edit"), c4: confident("keep"),
    });
    query.shortlist = async (input) => {
      calls.push([...input.kinds]);
      return shortlist.filter((candidate) => input.kinds.includes(candidate.kind));
    };

    await dispatcher.run("p1");

    expect(calls).toEqual([["event", "task"]]);
    expect(jev.ask).toHaveBeenCalledTimes(2);
    const second = jev.ask.mock.calls[1][2] as Record<string, { instructions: string; criteria: Record<string, string> }>;
    expect(Object.keys(second)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(second.c1.instructions).toContain("Reunião");
    expect(Object.keys(second.c1.criteria)).toEqual(["edit", "keep"]);
    expect(store.stepRecords.map((step) => [step.agent, step.input?.candidates?.map((candidate) => candidate.id)])).toEqual([
      ["event-edit", ["e1"]], ["task-edit", ["t1"]],
    ]);
    expect(store.dispatch).toMatchObject({ candidates: { shortlisted: 4, selected: 2 } });
  });

  test("pedido so de criacao nunca lista candidatos nem faz a segunda chamada", async () => {
    const { store, jev } = twoStage({});
    jev.ask.mockImplementation(async () => answers({ event_create: confident("one") }));
    const query = { shortlist: async () => { throw new Error("nao devia listar"); } };
    await new ProcessDispatcher(store, jev.client, query).run("p1");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["event-create"]);
  });

  test("resposta incerta sobre um candidato nao o escolhe", async () => {
    const { store, dispatcher } = twoStage({ c1: confident("edit", 0.9), c2: confident("edit") });
    await dispatcher.run("p1");
    expect(store.stepRecords[0].input?.candidates?.map((candidate) => candidate.id)).toEqual(["e2"]);
  });

  test("JEV dos candidatos fora do ar: o passo de edicao nasce sem candidatos e pode consultar", async () => {
    const store = new InMemoryProcessStore();
    store.seed({ id: "p1", prompt: "terminei a reunião", status: "dispatching" });
    const jev = scriptedJev((questions) => ("c1" in questions ? new JevUnavailableError("provider") : answers({ event_edit: confident("one") })));
    await new ProcessDispatcher(store, jev.client, { shortlist: async () => shortlist }).run("p1");
    expect(store.stepRecords).toMatchObject([{ agent: "event-edit", input: undefined }]);
    expect(store.dispatch).toMatchObject({ candidates: { shortlisted: 5, selected: 0 } });
  });

  test("series: o servidor lista as recorrencias e cada agente recebe so as do seu alvo", async () => {
    const series: EditCandidate[] = [
      { kind: "recurrence", target: "event", id: "r1", name: "Corrida", cadence: "toda segunda às 07:00" },
      { kind: "recurrence", target: "task", id: "r2", name: "Pagar o aluguel", cadence: "todo dia 5" },
    ];
    const store = new InMemoryProcessStore();
    store.seed({ id: "p1", prompt: "mude a corrida para as 8h e o aluguel para o dia 10", status: "dispatching" });
    const kinds: string[][] = [];
    const jev = scriptedJev((questions) => ("c1" in questions
      ? result({ c1: confident("edit"), c2: confident("edit") })
      : answers({ recurring_event_edit: confident("one"), recurring_task_edit: confident("one") })));
    await new ProcessDispatcher(store, jev.client, {
      shortlist: async (input) => { kinds.push([...input.kinds]); return series; },
    }).run("p1");

    expect(kinds).toEqual([["recurrence"]]);
    expect(store.stepRecords.map((step) => [step.agent, step.input?.candidates?.map((candidate) => candidate.id)])).toEqual([
      ["recurring-event-edit", ["r1"]], ["recurring-task-edit", ["r2"]],
    ]);
    const asked = jev.ask.mock.calls[1][2] as Record<string, { instructions: string }>;
    expect(asked.c1.instructions).toContain("toda segunda");
  });

  test("lista vazia: segue sem a segunda chamada", async () => {
    const store = new InMemoryProcessStore();
    store.seed({ id: "p1", prompt: "terminei a reunião", status: "dispatching" });
    const jev = scriptedJev(() => answers({ event_edit: confident("one") }));
    await new ProcessDispatcher(store, jev.client, { shortlist: async () => [] }).run("p1");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["event-edit"]);
  });
});
