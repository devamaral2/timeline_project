import type { AgentTraceDto } from "@repo/contracts";
import { expect, test, vi } from "vitest";
import { HermesRequestError, type HermesChatInput } from "../../infrastructure/hermes/hermes.client";
import { RetryableJobError } from "../../infrastructure/jobs/jobs.service";
import { HermesTurnWorker } from "./hermes-turn-worker";
import { toRequestDto } from "./request-view";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";

const trace = (status: AgentTraceDto["status"], toolStatus: "running" | "done" | "failed" = "done"): AgentTraceDto => ({
  route: "hermes", status, fields: [{ label: "Modelo", value: "m" }],
  entries: [
    { id: "request", kind: "request", label: "Pedido", status: "done" },
    { id: "c1", kind: "tool", label: "Criou um evento", source: "mcp_braid_create_event", status: toolStatus },
  ],
});

function setup(chat?: (input: HermesChatInput) => Promise<{ text: string; trace: AgentTraceDto }>) {
  const store = new InMemoryRequestStore();
  const first = store.seed({ id: "01FIRST", prompt: "oi", route: "hermes", status: "done" });
  const request = store.seed({ id: "01NEXT", prompt: "crie um evento", route: "hermes", status: "queued", sessionId: first.id });
  const hermes = chat ? { chat: vi.fn(chat) } : undefined;
  const progress = vi.fn(async () => {});
  const signal = new AbortController().signal;
  return { store, request, hermes, progress, run: (id = request.id) => new HermesTurnWorker(store, hermes).run(id, { signal, progress }) };
}

test("a mensagem vai na sessao do primeiro pedido; a resposta e o rastro ficam no pedido, que termina", async () => {
  const { store, hermes, progress, run } = setup(async (input) => {
    input.onTrace?.(trace("running", "running"));
    return { text: "Feito.", trace: trace("done") };
  });

  await run();

  expect(hermes?.chat).toHaveBeenCalledWith(expect.objectContaining({ text: "crie um evento", sessionId: "braid-user-1-01FIRST" }));
  expect(progress).toHaveBeenCalledWith({ trace: trace("running", "running") });
  expect(store.require("01NEXT")).toMatchObject({ status: "done", answer: "Feito.", trace: trace("done") });
  // Sem passos gravados: a lista do chat sai do rastro.
  expect(toRequestDto(store.require("01NEXT"), [], []).steps).toEqual([
    { id: "c1", agent: "mcp_braid_create_event", label: "Criou um evento", status: "done" },
  ]);
});

test("o primeiro pedido de uma sessao usa o proprio id como sessao do Hermes", async () => {
  const { hermes, run, store } = setup(async () => ({ text: "ok", trace: trace("done") }));
  store.require("01FIRST").status = "queued";
  await run("01FIRST");
  expect(hermes?.chat).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "braid-user-1-01FIRST" }));
});

test("o rastro e escrito no progresso no maximo uma vez por intervalo, e uma escrita que falha nao quebra o turno", async () => {
  const { store, progress, run } = setup(async (input) => {
    for (let index = 0; index < 5; index += 1) input.onTrace?.(trace("running"));
    return { text: "ok", trace: trace("done") };
  });
  progress.mockRejectedValue(new Error("db down"));

  await run();

  expect(progress).toHaveBeenCalledTimes(1);
  expect(store.require("01NEXT").status).toBe("done");
});

test("falha definitiva do Hermes: o pedido falha com um codigo seguro e o ultimo rastro, e o erro sobe para a fila", async () => {
  const { store, run } = setup(async (input) => {
    input.onTrace?.(trace("failed", "failed"));
    throw new HermesRequestError("Hermes responded 500 with a secret");
  });

  await expect(run()).rejects.toBeInstanceOf(HermesRequestError);

  const request = store.require("01NEXT");
  expect(request).toMatchObject({ status: "failed", errorCode: "unavailable", trace: trace("failed", "failed") });
  expect(request.answer).toBeUndefined();
});

test("erro que a fila ainda vai tentar de novo nao encerra o pedido", async () => {
  const { store, run } = setup(async () => { throw new RetryableJobError("Hermes responded 503"); });
  await expect(run()).rejects.toBeInstanceOf(RetryableJobError);
  expect(store.require("01NEXT").status).toBe("running");
});

test("sem o Hermes configurado o pedido falha em vez de esperar", async () => {
  const { store, run } = setup();
  await expect(run()).rejects.toThrow("Hermes is not configured");
  expect(store.require("01NEXT").status).toBe("failed");
});

test("pedido cancelado ou ja terminado nao chama o Hermes", async () => {
  const { store, hermes, run } = setup(async () => ({ text: "ok", trace: trace("done") }));
  await store.cancel("01NEXT");
  await run();
  expect(hermes?.chat).not.toHaveBeenCalled();
});
