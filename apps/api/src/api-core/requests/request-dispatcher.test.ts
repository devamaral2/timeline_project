import type { ModelSelection } from "@repo/contracts";
import { describe, expect, test } from "vitest";
import { JevUnavailableError } from "./jev.client";
import type { EditCandidate } from "./request-candidates";
import { dispatchConfig } from "./request-config";
import { RequestDispatcher, type RequestDispatcherOptions } from "./request-dispatcher";
import { parseFallbackCommand } from "./request-steps";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";
import { confident, dispatchAnswers, scriptedJev } from "./testing/request-test-kit";

const MODEL: ModelSelection = { provider: "anthropic", model: "claude-opus-5-5", effort: "medium" };

function setup(respond: Parameters<typeof scriptedJev>[0], options: RequestDispatcherOptions = {}) {
  const store = new InMemoryRequestStore();
  store.seed({ id: "r1", prompt: "pedido", status: "queued" });
  const jev = scriptedJev(respond);
  return { store, jev, dispatcher: new RequestDispatcher(store, jev.client, options) };
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
  test("uma chamada so, com as tres perguntas de sim ou nao e nada mais", async () => {
    const { dispatcher, jev } = setup(() => dispatchAnswers("write"));
    await dispatcher.run("r1");
    expect(jev.ask).toHaveBeenCalledTimes(1);
    const asked = jev.ask.mock.calls[0]?.[2] as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(asked)).toEqual(["query", "write", "config"]);
    for (const question of Object.values(asked)) expect(Object.keys(question.criteria)).toEqual(["yes", "no"]);
  });

  test("so consultar vai ao agente de consulta ao banco", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers("query"));
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["query"]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["request-step"]);
    expect(store.require("r1")).toMatchObject({
      route: "steps", status: "running", dispatch: { model: "jev-test", route: "query", uncertain: [] },
    });
  });

  test("so criar ou atualizar vai ao agente unico de escrita, num passo so", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers("write"));
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["entity"]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["request-step"]);
    expect(store.require("r1")).toMatchObject({ route: "steps", status: "running", dispatch: { route: "write" } });
    expect(store.require("r1").dispatch?.fallbackReason).toBeUndefined();
  });

  test("configuracao do app vai ao modo modelo: o pedido muda de rota e guarda o modelo que responde", async () => {
    const asked: string[] = [];
    const { store, dispatcher } = setup(() => dispatchAnswers("config"), {
      model: async (userId) => {
        asked.push(userId);
        return MODEL;
      },
    });
    await dispatcher.run("r1");
    expect(asked).toEqual([store.require("r1").userId]);
    expect(store.stepRecords).toEqual([]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["model-turn"]);
    expect(store.require("r1")).toMatchObject({ route: "model", status: "queued", model: MODEL, dispatch: { route: "config" } });
  });

  test("configuracao num pedido que ja traz a escolha do usuario responde com o modelo dele, nao com o padrao", async () => {
    const chosen: ModelSelection = { provider: "openai", model: "gpt-6.2-sol", effort: "high" };
    const { store, dispatcher } = setup(() => dispatchAnswers("config"), { model: async () => MODEL });
    store.require("r1").model = chosen;
    await dispatcher.run("r1");
    expect(store.require("r1")).toMatchObject({ route: "model", model: chosen });
  });

  test("a escolha do usuario nao abre o modo modelo para quem ele nao vale", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers("config"), { model: async () => undefined });
    store.require("r1").model = MODEL;
    await dispatcher.run("r1");
    expect(store.require("r1")).toMatchObject({ route: "hermes", dispatch: { fallbackReason: "model_unavailable" } });
  });

  test.each([
    ["sem o modo modelo neste ambiente", {}],
    ["o modo modelo nao vale para este usuario", { model: async () => undefined }],
  ])("configuracao com %s vai ao Hermes", async (_, options: RequestDispatcherOptions) => {
    const { store, dispatcher } = setup(() => dispatchAnswers("config"), options);
    await dispatcher.run("r1");
    expect(store.jobs.map((job) => job.kind)).toEqual(["hermes-turn"]);
    expect(store.require("r1")).toMatchObject({ route: "hermes", dispatch: { route: "config", fallbackReason: "model_unavailable" } });
  });

  test("tres respostas nao: e uma tarefa de agente e vai ao Hermes, sem passo e sem motivo de fallback", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers());
    await dispatcher.run("r1");
    expect(store.stepRecords).toEqual([]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["hermes-turn"]);
    expect(store.require("r1")).toMatchObject({ route: "hermes", status: "queued", dispatch: { uncertain: [] } });
    expect(store.require("r1").dispatch?.route).toBeUndefined();
    expect(store.require("r1").dispatch?.fallbackReason).toBeUndefined();
  });

  test("um sim incerto nao escolhe destino: o pedido vai ao Hermes", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers(undefined, { write: confident("yes", dispatchConfig.minCertainty) }));
    await dispatcher.run("r1");
    expect(store.stepRecords).toEqual([]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["hermes-turn"]);
    expect(store.require("r1")).toMatchObject({ route: "hermes", dispatch: { fallbackReason: "uncertain", uncertain: ["write"] } });
  });

  test("mais de um sim nao escolhe destino, mesmo com os dois certos: o pedido mistura coisas e vai ao Hermes", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers("write", { query: confident("yes") }));
    await dispatcher.run("r1");
    expect(store.stepRecords).toEqual([]);
    expect(store.require("r1")).toMatchObject({ route: "hermes", dispatch: { fallbackReason: "uncertain", uncertain: ["query", "write"] } });
  });

  test("um nao incerto nas outras perguntas nao atrapalha o sim certo", async () => {
    const { store, dispatcher } = setup(() => dispatchAnswers("write", { query: confident("no", 0.4) }));
    await dispatcher.run("r1");
    expect(store.stepRecords.map((step) => step.agent)).toEqual(["entity"]);
  });

  test.each([
    ["sem chave", new JevUnavailableError("no_api_key"), "jev_no_api_key"],
    ["provedor fora", new JevUnavailableError("provider"), "jev_provider"],
  ])("JEV indisponivel (%s) vai ao Hermes", async (_, error, reason) => {
    const { store, dispatcher } = setup(() => error);
    await dispatcher.run("r1");
    expect(store.jobs.map((job) => job.kind)).toEqual(["hermes-turn"]);
    expect(store.require("r1").dispatch).toMatchObject({ fallbackReason: reason });
  });

  test("pedido com o prefixo fallback: vai direto ao Hermes, sem consultar o JEV", async () => {
    // O JEV reconheceria uma criacao; com o prefixo ele nem e chamado.
    const { store, dispatcher, jev } = setup(() => dispatchAnswers("write"));

    store.require("r1").forceFallback = true;
    await dispatcher.run("r1");

    expect(jev.ask).not.toHaveBeenCalled();
    expect(store.stepRecords).toEqual([]);
    expect(store.jobs.map((job) => job.kind)).toEqual(["hermes-turn"]);
    expect(store.require("r1")).toMatchObject({ route: "hermes", status: "queued" });
    expect(store.require("r1").dispatch).toEqual({ answers: {}, uncertain: [], fallbackReason: "forced" });
  });

  test("so despacha pedidos que ainda esperam despacho", async () => {
    const { store, dispatcher, jev } = setup(() => dispatchAnswers("write"));
    store.require("r1").status = "running";
    await dispatcher.run("r1");
    expect(jev.ask).not.toHaveBeenCalled();
    expect(store.stepRecords).toHaveLength(0);
  });
});

describe("candidatos do agente de escrita", () => {
  const shortlist: EditCandidate[] = [
    { kind: "task", id: "e1", name: "Reunião", taskKind: "common" },
    { kind: "artifact", id: "a1", name: "Lista de compras", artifactType: "text" },
    { kind: "recurrence", id: "s1", name: "Corrida", cadence: "toda segunda às 07:00" },
  ];

  test("o servidor lista tarefas, artefatos e series e entrega a lista inteira ao agente: o JEV nao escolhe nada", async () => {
    const kinds: string[][] = [];
    const { store, dispatcher, jev } = setup(() => dispatchAnswers("write"), {
      candidates: {
        shortlist: async (input) => {
          kinds.push([...input.kinds]);
          return shortlist;
        },
      },
    });

    await dispatcher.run("r1");

    expect(kinds).toEqual([["task", "artifact", "recurrence"]]);
    // A unica chamada ao JEV e a do destino.
    expect(jev.ask).toHaveBeenCalledTimes(1);
    expect(store.stepRecords[0]?.input?.candidates).toEqual(shortlist);
    expect(store.require("r1").dispatch).toMatchObject({ candidates: { shortlisted: 3, selected: 3 } });
  });

  test("consulta e configuracao nunca listam candidatos", async () => {
    const candidates = { shortlist: async () => { throw new Error("nao devia listar"); } };
    for (const route of ["query", "config"] as const) {
      const { store, dispatcher } = setup(() => dispatchAnswers(route), { candidates, model: async () => MODEL });
      await dispatcher.run("r1");
      expect(store.require("r1").dispatch?.candidates).toBeUndefined();
    }
  });

  test("lista vazia ou lista que falhou: o passo nasce sem candidatos e o agente ainda pode consultar", async () => {
    const empty = setup(() => dispatchAnswers("write"), { candidates: { shortlist: async () => [] } });
    await empty.dispatcher.run("r1");
    expect(empty.store.stepRecords).toMatchObject([{ agent: "entity" }]);
    expect(empty.store.stepRecords[0]?.input).toBeUndefined();

    const broken = setup(() => dispatchAnswers("write"), { candidates: { shortlist: async () => { throw new Error("banco fora"); } } });
    await broken.dispatcher.run("r1");
    expect(broken.store.stepRecords).toMatchObject([{ agent: "entity" }]);
    expect(broken.store.stepRecords[0]?.input).toBeUndefined();
  });
});
