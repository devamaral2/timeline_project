import { expect, test } from "vitest";
import type { EventCommandParsingGateway, ParsedEventCommand } from "../events/gateways/event-command-parsing.gateway";
import { createEventsKit } from "../events/testing/in-memory-events-kit";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";
import { VoiceEventWorker } from "./voice-event-worker";

const ACCEPTED = new Date("2026-10-25T15:00:00Z");

function setup(command: Partial<ParsedEventCommand> | Error = {}) {
  const kit = createEventsKit({ clock: () => ACCEPTED });
  const store = new InMemoryRequestStore(() => ACCEPTED, kit.database);
  const request = store.seed({ id: "v1", prompt: "comecei a estudar", route: "voice", status: "queued" });
  const calls: string[] = [];
  const parsing: EventCommandParsingGateway = {
    parseCommand: async ({ text }) => {
      calls.push(text);
      if (command instanceof Error) throw command;
      return { input: { name: "Estudar", kind: "common", tags: [] }, schedule: {}, modelProvider: "stub", modelName: "stub", ...command };
    },
  };
  const said: string[] = [];
  const places = { resolve: async (text: string) => { said.push(text); return `${text}, Rua Um 10, Belo Horizonte`; } };
  const worker = new VoiceEventWorker({ store, parsing, createEvent: kit.createEvent, batchWriter: kit.batchWriter, places });
  return { kit, store, request, calls, worker, said };
}

test("a fala vira um evento de pessoa, com a frase na descricao, e o pedido termina apontando para ele", async () => {
  const { kit, store, calls, worker } = setup();

  await worker.run("v1");

  expect(calls).toEqual(["comecei a estudar"]);
  const [event] = kit.database.events;
  expect(event).toMatchObject({ actor: "human", userId: "user-1", name: "Estudar", description: "comecei a estudar", startedAt: ACCEPTED });
  expect(store.require("v1").status).toBe("done");
  expect(await store.entities("v1")).toMatchObject([{ kind: "event", id: event?.id, operation: "create", stepId: "v1", finalized: true }]);
  // Uma transacao so: o evento e o fim do pedido saem do mesmo lote.
  expect(kit.batchWriter.commits).toHaveLength(1);
});

test("a janela dita na fala e resolvida a partir do instante em que o pedido foi aceito", async () => {
  const { kit, worker } = setup({ schedule: { startOffsetMinutes: -20, durationMinutes: 60 } });
  await worker.run("v1");
  expect(kit.database.events[0]).toMatchObject({
    startedAt: new Date("2026-10-25T14:40:00Z"), estimatedFinishAt: new Date("2026-10-25T15:40:00Z"),
  });
});

test("o lugar citado na fala vira o endereco achado no mapa; sem lugar citado, o mapa nao e consultado", async () => {
  const located = setup({ place: "clinica saude emocional" });
  await located.worker.run("v1");
  expect(located.said).toEqual(["clinica saude emocional"]);
  expect(located.kit.database.events[0]?.location).toBe("clinica saude emocional, Rua Um 10, Belo Horizonte");

  const plain = setup();
  await plain.worker.run("v1");
  expect(plain.said).toEqual([]);
  expect(plain.kit.database.events[0]?.location).toBe("");
});

test("refeicao falada: o evento nasce com o alimento a espera dos nutrientes", async () => {
  const { kit, worker } = setup({ input: { kind: "meal", artifacts: [{ type: "food", data: { inputText: "arroz e feijão" } }], tags: [] } });
  await worker.run("v1");
  const [event] = kit.database.events;
  expect(event?.kind).toBe("meal");
  expect(kit.database.artifactsOf(event as never)).toMatchObject([{ type: "food", data: { description: "arroz e feijão", generation: { status: "pending" } } }]);
});

test("falha do modelo sobe para a fila sem gravar nada: quem marca o pedido como falho e a fila", async () => {
  const { kit, store, worker } = setup(new Error("OpenRouter request failed with status 500"));
  await expect(worker.run("v1")).rejects.toThrow("status 500");
  expect(kit.database.events).toHaveLength(0);
  expect(store.require("v1").status).toBe("running");
});

test("pedido cancelado nao chama o modelo; cancelado no meio, o evento nao e gravado", async () => {
  const cancelled = setup();
  await cancelled.store.cancel("v1");
  await cancelled.worker.run("v1");
  expect(cancelled.calls).toEqual([]);

  const racing = setup();
  const original = racing.kit.createEvent.prepare.bind(racing.kit.createEvent);
  racing.kit.createEvent.prepare = async (...args) => {
    await racing.store.cancel("v1");
    return original(...args);
  };
  await expect(racing.worker.run("v1")).rejects.toThrow("no longer open");
  expect(racing.store.require("v1").status).toBe("cancel");
});
