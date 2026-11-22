import { act, renderHook, waitFor } from "@testing-library/react";
import type { ModelOptionsDto, RequestDto } from "@repo/contracts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, modelOptionsFixture, requestFixture, requestsArea } from "@/test/fake-api/requests";
import { MODEL_SELECTION_KEY } from "./model-selection";
import { useAgentChat } from "./use-agent-chat";

// O modo modelo conversa pela API de pedidos, como o Hermes (ADR 0019).
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

/** A API falsa com o modo modelo ligado ou desligado (nenhuma chave de provedor); o Hermes fica ligado. */
function serve(model: "on" | "off", modelOptions?: ModelOptionsDto) {
  api = createFakeApi({ areas: [requestsArea({ hermes: "on", model, modelOptions })] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
}

const requests = () => api.store.table<RequestDto>("requests");
const ids = () => [...requests().keys()];
const posts = (path: string) => api.calls.filter((call) => call.method === "POST" && call.pathname === path);
const modelPosts = () => posts("/api/requests/model");
const optionsCalls = () => api.calls.filter((call) => call.method === "GET" && call.pathname === "/api/requests/model/options");
const stored = () => JSON.parse(window.localStorage.getItem(MODEL_SELECTION_KEY) ?? "null");

function setup() {
  const onEntitiesChanged = vi.fn();
  const hook = renderHook(() => useAgentChat({ userId: "owner", onEntitiesChanged, processPollMs: 5 }));
  return { ...hook, onEntitiesChanged };
}

type Chat = { current: ReturnType<typeof useAgentChat> };

async function ask(chat: Chat, text: string): Promise<string> {
  const before = requests().size;
  act(() => { chat.current.send(text); });
  await waitFor(() => expect(requests().size).toBe(before + 1));
  await waitFor(() => expect(chat.current.pending?.requestId).toBe(ids().at(-1)));
  return ids().at(-1) as string;
}

/** Entra no modo (sem mensagem) e espera o aviso de entrada. */
async function enter(chat: Chat, command: string) {
  act(() => { chat.current.send(command); });
  await waitFor(() => expect(chat.current.pending).toBeNull());
}

const working = (status: "running" | "done") => ({
  route: "model" as const,
  status,
  fields: [],
  entries: [
    { id: "thought-1", kind: "thought" as const, label: "Pensou", status: "done" as const, sections: [{ title: "Raciocínio", text: "Ver a agenda de amanhã." }] },
    { id: "toolu_1", kind: "tool" as const, label: "Listou a agenda", source: "list_agenda_tasks", status },
  ],
});

beforeEach(() => {
  window.localStorage.clear();
  serve("on");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("/claude abre um pedido na rota do modelo com a escolha, mostra os passos e a resposta, e a agenda atualiza", async () => {
  const { result, onEntitiesChanged } = setup();
  const id = await ask(result, "/claude o que tenho amanhã?");

  expect(modelPosts()[0]?.body).toEqual({
    userId: "owner",
    text: "o que tenho amanhã?",
    clientMessageId: expect.any(String),
    model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
  });
  expect(posts("/api/requests")).toHaveLength(0);
  expect(result.current.agentMode).toBe("model");
  expect(result.current.pending).toMatchObject({ label: "Falando com Sonnet 5.5", requestId: id });

  advanceRequest(api, id, { status: "running", trace: working("running") });
  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps"]));
  expect(result.current.messages[1]).toMatchObject({
    running: true,
    steps: [
      { kind: "thought", label: "Pensou", detail: "Ver a agenda de amanhã.", status: "done" },
      { kind: "tool", label: "Listou a agenda", status: "running" },
    ],
  });

  advanceRequest(api, id, { status: "done", trace: working("done"), message: "Amanhã você tem dentista às 9h." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps", "assistant"]);
  expect(result.current.messages[2]).toMatchObject({
    text: "Amanhã você tem dentista às 9h.",
    model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
  });
  expect(result.current.traces).toEqual([expect.objectContaining({ id: result.current.messages[0]?.id, route: "model", running: false })]);
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("/modelo sozinho so liga o modo; as mensagens seguintes vao ao modelo, na mesma sessao, ate /app", async () => {
  const { result } = setup();
  await enter(result, "/modelo");
  expect(result.current.agentMode).toBe("model");
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages.at(-1)).toMatchObject({
    text: "Agora você está falando com Sonnet 5.5 (Anthropic). Escreva /app para voltar ao assistente da agenda.",
  });
  expect(modelPosts()).toHaveLength(0);
  expect(optionsCalls()).toHaveLength(1);

  const first = await ask(result, "oi");
  advanceRequest(api, first, { status: "done", message: "Oi!" });
  await waitFor(() => expect(result.current.pending).toBeNull());
  const second = await ask(result, "e amanhã?");

  expect(modelPosts()[0]?.body).not.toHaveProperty("sessionId");
  expect(modelPosts()[1]?.body).toMatchObject({ text: "e amanhã?", sessionId: first });
  expect(optionsCalls()).toHaveLength(1);
  advanceRequest(api, second, { status: "done", message: "Nada marcado." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  act(() => { result.current.send("/app"); });
  expect(result.current.agentMode).toBeNull();
});

test("/openai e /openrouter ja escolhem o provedor, com o modelo padrao dele, e a escolha fica no aparelho", async () => {
  const { result } = setup();
  await enter(result, "/openai");
  expect(result.current.model.selection).toEqual({ provider: "openai", model: "gpt-6.2-sol", effort: "medium" });
  expect(result.current.messages.at(-1)).toMatchObject({ text: expect.stringContaining("GPT 6.2 Sol (OpenAI)") });
  expect(stored().current).toEqual({ provider: "openai", model: "gpt-6.2-sol", effort: "medium" });

  await ask(result, "oi");
  expect(modelPosts()[0]?.body).toMatchObject({ model: { provider: "openai", model: "gpt-6.2-sol", effort: "medium" } });
  advanceRequest(api, ids()[0] as string, { status: "done", message: "Oi." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  await ask(result, "/openrouter e agora?");
  expect(modelPosts()[1]?.body).toMatchObject({ text: "e agora?", model: { provider: "openrouter", model: "google/gemini-4-neon" } });
});

test("/modelo mantem a escolha salva; /claude troca so o provedor e retoma o modelo que ele tinha", async () => {
  window.localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify({
    current: { provider: "openai", model: "gpt-6.2-mini", effort: "high" },
    models: { openai: "gpt-6.2-mini", anthropic: "claude-opus-5-5" },
  }));
  const { result } = setup();
  await enter(result, "/modelo");
  expect(result.current.model.selection).toEqual({ provider: "openai", model: "gpt-6.2-mini", effort: "high" });

  await enter(result, "/claude");
  expect(result.current.model.selection).toEqual({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" });
});

test("provedor sem chave neste ambiente: o chat avisa, nao entra no modo e nao envia", async () => {
  serve("on", modelOptionsFixture({ providers: [modelOptionsFixture().providers[0] as never] }));
  const { result } = setup();

  act(() => { result.current.send("/openai oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: "A OpenAI não está ligada neste ambiente." });
  expect(result.current.agentMode).toBeNull();
  expect(modelPosts()).toHaveLength(0);

  act(() => { result.current.send("/openrouter"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ text: "O OpenRouter não está ligado neste ambiente." });
  expect(result.current.agentMode).toBeNull();
});

test("sem nenhum provedor (opcoes 404): o chat avisa e sai do modo", async () => {
  serve("off");
  const { result, onEntitiesChanged } = setup();

  act(() => { result.current.send("/claude oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(optionsCalls()).toHaveLength(1);
  expect(modelPosts()).toHaveLength(0);
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: "O modo modelo está desligado neste ambiente." });
  expect(result.current.agentMode).toBeNull();
  expect(onEntitiesChanged).not.toHaveBeenCalled();
});

test("a escolha guardada vale contra as opcoes: provedor desconhecido volta ao padrao, modelo desconhecido ao padrao do provedor", async () => {
  window.localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify({
    current: { provider: "openai", model: "gpt-antigo", effort: "max" },
    models: {},
  }));
  const first = setup();
  await enter(first.result, "/modelo");
  expect(first.result.current.model.selection).toEqual({ provider: "openai", model: "gpt-6.2-sol", effort: "max" });
  first.unmount();

  serve("on", modelOptionsFixture({ providers: [modelOptionsFixture().providers[0] as never] }));
  const second = setup();
  await enter(second.result, "/modelo");
  expect(second.result.current.model.selection).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" });
});

test("trocar o provedor, o modelo e o esforco vale na hora, vai no proximo pedido e fica no aparelho", async () => {
  const { result } = setup();
  await enter(result, "/modelo");

  act(() => result.current.model.chooseModel("claude-opus-5-5"));
  act(() => result.current.model.chooseEffort("max"));
  act(() => result.current.model.chooseProvider("openai"));
  act(() => result.current.model.chooseModel("gpt-6.2-mini"));
  act(() => result.current.model.chooseProvider("anthropic"));
  expect(result.current.model.selection).toEqual({ provider: "anthropic", model: "claude-opus-5-5", effort: "max" });
  expect(stored()).toEqual({
    current: { provider: "anthropic", model: "claude-opus-5-5", effort: "max" },
    models: { anthropic: "claude-opus-5-5", openai: "gpt-6.2-mini" },
  });

  // Um modelo fora da lista do provedor atual nao entra.
  act(() => result.current.model.chooseModel("gpt-6.2-sol"));
  expect(result.current.model.selection?.model).toBe("claude-opus-5-5");

  await ask(result, "oi");
  expect(modelPosts()[0]?.body).toMatchObject({ model: { provider: "anthropic", model: "claude-opus-5-5", effort: "max" } });
});

test("sem armazenamento no aparelho a conversa segue com a escolha padrao", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
  const { result } = setup();

  await enter(result, "/modelo");
  act(() => result.current.model.chooseEffort("high"));

  expect(result.current.agentMode).toBe("model");
  expect(result.current.model.selection).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" });
});

test("trocar de /hermes para /claude muda o destino sem perder a sessao", async () => {
  const { result } = setup();
  const first = await ask(result, "/hermes oi");
  advanceRequest(api, first, { status: "done", message: "Oi." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  await ask(result, "/claude e você?");

  expect(result.current.agentMode).toBe("model");
  expect(posts("/api/requests/hermes")).toHaveLength(1);
  expect(modelPosts()[0]?.body).toMatchObject({ text: "e você?", sessionId: first });
});

test("nova conversa sai do modo modelo e le as opcoes de novo ao voltar", async () => {
  const { result } = setup();
  await enter(result, "/modelo");

  act(() => result.current.startNewConversation());
  expect(result.current.agentMode).toBeNull();
  expect(result.current.model.options).toBeNull();

  await enter(result, "/modelo");
  expect(optionsCalls()).toHaveLength(2);
});

test("um pedido ao modelo que ficou aberto volta a ser acompanhado ao abrir o chat", async () => {
  api.store.table<RequestDto>("requests").set("01M7RVND35K7C0SC20A693SNSQ", requestFixture({
    id: "01M7RVND35K7C0SC20A693SNSQ",
    route: "model",
    status: "running",
    text: "resuma minha semana",
    model: { provider: "openai", model: "gpt-6.2-sol", effort: "low" },
  }));
  api.store.table<string>("requestOwners").set("01M7RVND35K7C0SC20A693SNSQ", "owner");
  const { result } = setup();

  await act(async () => { await result.current.recover(); });

  expect(result.current.pending).toMatchObject({ label: expect.stringContaining("Falando com"), requestId: "01M7RVND35K7C0SC20A693SNSQ" });
  advanceRequest(api, "01M7RVND35K7C0SC20A693SNSQ", { status: "done", message: "Semana tranquila." });
  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: "Semana tranquila.", model: { provider: "openai" } }));
});
