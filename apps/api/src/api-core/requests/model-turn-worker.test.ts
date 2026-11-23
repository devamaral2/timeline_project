import type { AgentTraceDto } from "@repo/contracts";
import { expect, test, vi } from "vitest";
import { ModelRequestError, type ModelChatInput } from "../../infrastructure/model-agent/model-agent";
import { RetryableJobError } from "../../infrastructure/jobs/jobs.service";
import { MODEL_OFF_MESSAGE, ModelTurnWorker } from "./model-turn-worker";
import { toRequestDto } from "./request-view";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";

const trace = (status: AgentTraceDto["status"], toolStatus: "running" | "done" | "failed" = "done"): AgentTraceDto => ({
  route: "model", status, fields: [{ label: "Modelo", value: "claude-opus-5-5" }],
  entries: [
    { id: "request", kind: "request", label: "Pedido", status: "done" },
    { id: "toolu_1", kind: "tool", label: "Criou uma tarefa", source: "create_task", status: toolStatus },
  ],
});

const SELECTION = { provider: "openai", model: "gpt-6.2-sol", effort: "high" } as const;

// 2026-11-18 14:30 em Sao Paulo.
const NOW = new Date("2026-11-18T17:30:00.000Z");

function setup(chat?: (input: ModelChatInput) => Promise<{ text: string; trace: AgentTraceDto }>) {
  const store = new InMemoryRequestStore();
  const first = store.seed({ id: "01FIRST", prompt: "oi", route: "steps", status: "done", answer: "Olá! Em que posso ajudar?" });
  store.seed({ id: "01LOST", prompt: "isso falhou", route: "model", status: "failed", sessionId: first.id });
  const request = store.seed({ id: "01NEXT", prompt: "crie uma tarefa", route: "model", status: "queued", sessionId: first.id, model: SELECTION });
  // Outro usuario na mesma sessao nao entra na conversa.
  store.seed({ id: "01ALIEN", prompt: "segredo", route: "model", status: "done", answer: "x", userId: "outro", sessionId: first.id });
  const agent = chat ? { chat: vi.fn(chat) } : undefined;
  const progress = vi.fn(async () => {});
  const signal = new AbortController().signal;
  return {
    store, request, agent, progress,
    run: (id = request.id) => new ModelTurnWorker(store, agent, () => NOW).run(id, { signal, progress }),
  };
}

test("as trocas anteriores da sessao vao junto, so as respondidas; a resposta e o rastro ficam no pedido", async () => {
  const { store, agent, progress, run } = setup(async (input) => {
    input.onTrace?.(trace("running", "running"));
    return { text: "Feito.", trace: trace("done") };
  });

  await run();

  expect(agent?.chat).toHaveBeenCalledWith(expect.objectContaining({
    selection: SELECTION,
    text: "crie uma tarefa",
    history: [{ role: "user", text: "oi" }, { role: "assistant", text: "Olá! Em que posso ajudar?" }],
    context: expect.stringContaining("2026-11-18T14:30:00-03:00"),
  }));
  expect(progress).toHaveBeenCalledWith({ trace: trace("running", "running") });
  expect(store.require("01NEXT")).toMatchObject({ status: "done", answer: "Feito.", trace: trace("done") });
  // Sem passos gravados: a lista do chat sai do rastro.
  expect(toRequestDto(store.require("01NEXT"), [], []).steps).toEqual([
    { id: "toolu_1", agent: "create_task", label: "Criou uma tarefa", status: "done" },
  ]);
});

test("o primeiro pedido de uma sessao vai sem historico", async () => {
  const { agent, run, store } = setup(async () => ({ text: "ok", trace: trace("done") }));
  store.require("01FIRST").route = "model";
  store.require("01FIRST").status = "queued";
  store.require("01FIRST").model = SELECTION;
  await run("01FIRST");
  expect(agent?.chat).toHaveBeenCalledWith(expect.objectContaining({ text: "oi", history: [] }));
});

test("sem nenhuma chave de provedor o pedido termina com o aviso, sem tentar de novo", async () => {
  const { store, run } = setup();
  await run();
  expect(store.require("01NEXT")).toMatchObject({ status: "failed", errorCode: "unavailable", answer: MODEL_OFF_MESSAGE });
});

test("pedido de outra rota ou ja terminado nao chega ao modelo", async () => {
  const { agent, run, store } = setup(async () => ({ text: "ok", trace: trace("done") }));
  store.require("01NEXT").route = "hermes";
  await run();
  await run("01FIRST");
  expect(agent?.chat).not.toHaveBeenCalled();
});

test("falha definitiva termina o pedido com o ultimo rastro; a que a fila repete deixa o pedido aberto", async () => {
  const definitive = setup(async (input) => {
    input.onTrace?.(trace("failed", "failed"));
    throw new ModelRequestError("recusou");
  });
  await expect(definitive.run()).rejects.toBeInstanceOf(ModelRequestError);
  expect(definitive.store.require("01NEXT")).toMatchObject({ status: "failed", errorCode: "unavailable", trace: trace("failed", "failed") });

  const retried = setup(async () => { throw new RetryableJobError("429"); });
  await expect(retried.run()).rejects.toBeInstanceOf(RetryableJobError);
  expect(retried.store.require("01NEXT").status).toBe("running");
});
