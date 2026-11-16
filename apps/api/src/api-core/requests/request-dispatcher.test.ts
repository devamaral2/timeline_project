import { describe, expect, test } from "vitest";
import { JevUnavailableError } from "./jev.client";
import { dispatchConfig } from "./request-config";
import { RequestDispatcher } from "./request-dispatcher";
import { parseFallbackCommand } from "./request-steps";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";
import type { CandidateQuery, EditCandidate } from "./request-candidates";
import { confident, result, scriptedJev } from "./testing/request-test-kit";

const NONE = (name: string) => (name === "query" ? "no" : "none");

/** Todas as perguntas respondidas "nenhum", com as escolhas combinadas por cima. */
function answers(overrides: Record<string, ReturnType<typeof confident>> = {}) {
  const all: Record<string, ReturnType<typeof confident>> = {};
  for (const name of Object.keys(dispatchConfig.questions)) all[name] = confident(NONE(name));
  return result({ ...all, ...overrides });
}

function setup(respond: Parameters<typeof scriptedJev>[0]) {
  const store = new InMemoryRequestStore();
  store.seed({ id: "r1", prompt: "pedido", status: "queued" });
  const jev = scriptedJev(respond);
  return { store, jev, dispatcher: new RequestDispatcher(store, jev.client) };
}

describe("comando fallback:", () => {
  test("o prefixo sai e fica so o pedido, com qualquer caixa e espaco", () => {
    expect(parseFallbackCommand("fallback: qual a capital da França?")).toBe("qual a capital da França?");
    expect(parseFallbackCommand("  Fallback :almoço ao meio-dia\ne um texto ")).toBe("almoço ao meio-dia\ne um texto");
    expect(parseFallbackCommand("FALLBACK:x")).toBe("x");
  });

  test("sem pedido, ou fora do comeco da mensagem, nao e comando", () => {
    expect(parseFallbackCommand("fallback:")).toBeNull();
    expect(parseFallbackCommand("fallback:   ")).toBeNull();
    expect(parseFallbackCommand("fallback sem dois pontos")).toBeNull();
    expect(parseFallbackCommand("use o fallback: crie um texto")).toBeNull();
  });
});

describe("despacho pelo JEV de entrada", () => {
  test("o exemplo-guia aciona a fila de eventos (vários) e a de artefatos (uma), de uma vez", async () => {
    const { store, dispatcher, jev } = setup(() => answers({
      event_create: confident("many"), artifact_create: confident("one"),
    }));

    await dispatcher.run("r1");

    expect(store.stepRecords.map((step) => [step.agent, step.expected])).toEqual([
      ["event-create", "many"], ["artifact-create", "one"],
    ]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["request-step", "request-step"]);
    expect(store.require("r1").status).toBe("running");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    // Uma unica chamada leva todas as perguntas de operacao x entidade e a consulta.
    expect(Object.keys(jev.ask.mock.calls[0]?.[2] ?? {})).toEqual(Object.keys(dispatchConfig.questions));
    expect(store.require("r1").dispatch).toMatchObject({ model: "jev-test", uncertain: [], unsupported: [] });
  });

  test("nenhuma operacao reconhecida vai ao fallback", async () => {
    const { store, dispatcher } = setup(() => answers());
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["request-fallback"]);
    // Fallback do despacho: chamada unica, sem rodada.
    expect(store.stepRecords[0]?.input).toBeUndefined();
    expect(store.require("r1").dispatch).toMatchObject({ fallbackReason: "no_step" });
  });

  test("toda pergunta de operacao do JEV tem agente: nenhum pedido reconhecido sobra sem fila", async () => {
    const { store, dispatcher } = setup(() => answers({
      recurring_event_create: confident("many"), recurring_event_edit: confident("one"),
    }));
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual([
      "recurring-event-create", "recurring-event-edit",
    ]);
    expect(store.require("r1").dispatch).toMatchObject({ unsupported: [] });
  });

  test("consulta pura aciona a fila de consulta", async () => {
    const { store, dispatcher } = setup(() => answers({ query: confident("yes") }));
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["query"]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["request-step"]);
  });

  test("resposta incerta em qualquer pergunta manda ao fallback", async () => {
    const { store, dispatcher } = setup(() => answers({
      event_create: confident("one"), artifact_create: confident("one", 0.9),
    }));
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(store.require("r1").dispatch).toMatchObject({ fallbackReason: "uncertain", uncertain: ["artifact_create"] });
  });

  test.each([
    ["sem chave", new JevUnavailableError("no_api_key"), "jev_no_api_key"],
    ["provedor fora", new JevUnavailableError("provider"), "jev_provider"],
  ])("JEV indisponivel (%s) vai ao fallback", async (_, error, reason) => {
    const { store, dispatcher } = setup(() => error);
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    expect(store.require("r1").dispatch).toMatchObject({ fallbackReason: reason });
  });

  test("pedido com o prefixo fallback: vai direto ao fallback, sem consultar o JEV", async () => {
    // O JEV reconheceria uma criacao; com o prefixo ele nem e chamado.
    const { store, dispatcher, jev } = setup(() => answers({ event_create: confident("one") }));

    store.require("r1").forceFallback = true;
    await dispatcher.run("r1");

    expect(jev.ask).not.toHaveBeenCalled();
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["fallback"]);
    // So o comando liga o laco: o passo ja nasce na rodada 1.
    expect(store.stepRecords[0]?.input).toEqual({ round: 1 });
    expect(store.jobs.map((job) => job.kind)).toEqual(["request-fallback"]);
    expect(store.require("r1").status).toBe("running");
    expect(store.require("r1").dispatch).toEqual({ answers: {}, uncertain: [], unsupported: [], fallbackReason: "forced" });
  });

  test("so despacha pedidos que ainda esperam despacho", async () => {
    const { store, dispatcher, jev } = setup(() => answers({ event_create: confident("one") }));
    store.require("r1").status = "running";
    await dispatcher.run("r1");
    expect(jev.ask).not.toHaveBeenCalled();
    expect(store.stepRecords).toHaveLength(0);
  });
});

describe("candidatos de edicao escolhidos pelo JEV", () => {
  const shortlist: EditCandidate[] = [
    { kind: "event", id: "e1", name: "Reunião", eventKind: "common" },
    { kind: "event", id: "e2", name: "Almoço", eventKind: "meal" },
    { kind: "artifact", id: "a1", name: "Lista de compras", artifactType: "text" },
    { kind: "artifact", id: "a2", name: "Ideia", artifactType: "text" },
    { kind: "recurrence", id: "s1", name: "Corrida", cadence: "toda segunda às 07:00" },
  ];

  /** Primeira chamada: despacho. Segunda: uma pergunta binaria por candidato. */
  function twoStage(chosen: Record<string, ReturnType<typeof confident>>) {
    const query: CandidateQuery = { shortlist: async () => shortlist };
    const store = new InMemoryRequestStore();
    store.seed({ id: "r1", prompt: "terminei a reunião e acrescente leite na lista", status: "queued" });
    const jev = scriptedJev((questions) => {
      if ("c1" in questions) return result(chosen);
      return answers({ event_edit: confident("one"), artifact_edit: confident("one") });
    });
    return { store, jev, dispatcher: new RequestDispatcher(store, jev.client, query), query };
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

    await dispatcher.run("r1");

    expect(calls).toEqual([["event", "artifact"]]);
    expect(jev.ask).toHaveBeenCalledTimes(2);
    const second = jev.ask.mock.calls[1]?.[2] as Record<string, { instructions: string; criteria: Record<string, string> }>;
    expect(Object.keys(second)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(second.c1?.instructions).toContain("Reunião");
    expect(Object.keys(second.c1?.criteria ?? {})).toEqual(["edit", "keep"]);
    expect(store.stepRecords.map((step) => [step.agent, step.input?.candidates?.map((candidate) => candidate.id)])).toEqual([
      ["event-edit", ["e1"]], ["artifact-edit", ["a1"]],
    ]);
    expect(store.require("r1").dispatch).toMatchObject({ candidates: { shortlisted: 4, selected: 2 } });
  });

  test("pedido so de criacao nunca lista candidatos nem faz a segunda chamada", async () => {
    const { store, jev } = twoStage({});
    jev.ask.mockImplementation(async () => answers({ event_create: confident("one") }));
    const query = { shortlist: async () => { throw new Error("nao devia listar"); } };
    await new RequestDispatcher(store, jev.client, query).run("r1");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["event-create"]);
  });

  test("resposta incerta sobre um candidato nao o escolhe", async () => {
    const { store, dispatcher } = twoStage({ c1: confident("edit", 0.9), c2: confident("edit") });
    await dispatcher.run("r1");
    expect(store.stepRecords[0]?.input?.candidates?.map((candidate) => candidate.id)).toEqual(["e2"]);
  });

  test("JEV dos candidatos fora do ar: o passo de edicao nasce sem candidatos e pode consultar", async () => {
    const store = new InMemoryRequestStore();
    store.seed({ id: "r1", prompt: "terminei a reunião", status: "queued" });
    const jev = scriptedJev((questions) => ("c1" in questions ? new JevUnavailableError("provider") : answers({ event_edit: confident("one") })));
    await new RequestDispatcher(store, jev.client, { shortlist: async () => shortlist }).run("r1");
    expect(store.stepRecords).toMatchObject([{ agent: "event-edit" }]);
    expect(store.stepRecords[0]?.input).toBeUndefined();
    expect(store.require("r1").dispatch).toMatchObject({ candidates: { shortlisted: 5, selected: 0 } });
  });

  test("series: o servidor lista as recorrencias e o agente de series recebe as escolhidas", async () => {
    const series: EditCandidate[] = [
      { kind: "recurrence", id: "s1", name: "Corrida", cadence: "toda segunda às 07:00" },
      { kind: "recurrence", id: "s2", name: "Pagar o aluguel", cadence: "todo dia 5" },
    ];
    const store = new InMemoryRequestStore();
    store.seed({ id: "r1", prompt: "mude a corrida para as 8h e o aluguel para o dia 10", status: "queued" });
    const kinds: string[][] = [];
    const jev = scriptedJev((questions) => ("c1" in questions
      ? result({ c1: confident("edit"), c2: confident("edit") })
      : answers({ recurring_event_edit: confident("many") })));
    await new RequestDispatcher(store, jev.client, {
      shortlist: async (input) => { kinds.push([...input.kinds]); return series; },
    }).run("r1");

    expect(kinds).toEqual([["recurrence"]]);
    expect(store.stepRecords.map((step) => [step.agent, step.input?.candidates?.map((candidate) => candidate.id)])).toEqual([
      ["recurring-event-edit", ["s1", "s2"]],
    ]);
    const asked = jev.ask.mock.calls[1]?.[2] as Record<string, { instructions: string }>;
    expect(asked.c1?.instructions).toContain("toda segunda");
  });

  test("lista vazia: segue sem a segunda chamada", async () => {
    const store = new InMemoryRequestStore();
    store.seed({ id: "r1", prompt: "terminei a reunião", status: "queued" });
    const jev = scriptedJev(() => answers({ event_edit: confident("one") }));
    await new RequestDispatcher(store, jev.client, { shortlist: async () => [] }).run("r1");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["event-edit"]);
  });
});
