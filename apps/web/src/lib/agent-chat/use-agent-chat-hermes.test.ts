import { act, renderHook, waitFor } from "@testing-library/react";
import type { RequestDto } from "@repo/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { useAgentChat } from "./use-agent-chat";

// O Hermes conversa pela API de pedidos: a API falsa recebe o authedFetch, como nos outros testes do chat.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

/** A API falsa com o Hermes ligado ou desligado (`AI_AUTOMATION`). */
function serve(hermes: "on" | "off") {
  api = createFakeApi({ areas: [requestsArea({ hermes })] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
}

const requests = () => api.store.table<RequestDto>("requests");
const ids = () => [...requests().keys()];
const hermesPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests/hermes");
const stepsPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests");
const bodyOf = (index: number) => hermesPosts()[index]?.body as Record<string, unknown>;

function setup() {
  const onEntitiesChanged = vi.fn();
  const hook = renderHook(() => useAgentChat({ userId: "owner", onEntitiesChanged, processPollMs: 5 }));
  return { ...hook, onEntitiesChanged };
}

type Chat = { current: ReturnType<typeof useAgentChat> };

/** Manda uma mensagem e espera a API aceitá-la e o cliente acompanhar o pedido: devolve o id do pedido novo. */
async function ask(chat: Chat, text: string): Promise<string> {
  const before = requests().size;
  act(() => { chat.current.send(text); });
  await waitFor(() => expect(requests().size).toBe(before + 1));
  await waitFor(() => expect(chat.current.pending?.requestId).toBe(ids().at(-1)));
  return ids().at(-1) as string;
}

const thinking = (status: "running" | "done") => ({
  route: "hermes" as const,
  status,
  fields: [],
  entries: [{ id: "c1", kind: "tool" as const, label: "Executou um comando", summary: "date", status }],
});

beforeEach(() => {
  serve("on");
});

test("/hermes abre um pedido na rota do Hermes, com o id da mensagem, e mostra a resposta", async () => {
  const { result, onEntitiesChanged } = setup();
  const id = await ask(result, "/hermes crie uma nota do dia");

  expect(bodyOf(0)).toEqual({ userId: "owner", text: "crie uma nota do dia", clientMessageId: expect.any(String) });
  expect(stepsPosts()).toHaveLength(0);
  expect(result.current.pending).toMatchObject({ label: "Falando com o Hermes", requestId: id });

  advanceRequest(api, id, { status: "completed", message: "Nota criada." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages[0]).toMatchObject({ text: "/hermes crie uma nota do dia" });
  expect(result.current.messages[1]).toMatchObject({ text: "Nota criada.", entities: [] });
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("os passos do Hermes aparecem enquanto ele trabalha, ficam depois e vem antes da resposta", async () => {
  const { result } = setup();
  const id = await ask(result, "/hermes que ano e hoje?");

  advanceRequest(api, id, { status: "running", trace: thinking("running") });
  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps"]));
  expect(result.current.messages[1]).toMatchObject({
    running: true,
    steps: [{ id: "c1", kind: "tool", label: "Executou um comando", detail: "date", status: "running" }],
  });

  advanceRequest(api, id, { status: "completed", trace: thinking("done"), message: "2026" });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps", "assistant"]);
  expect(result.current.messages[1]).toMatchObject({ running: false, steps: [{ status: "done" }] });
  expect(result.current.messages[2]).toMatchObject({ text: "2026" });
});

test("um pedido que falha mantem os passos ja dados e mostra o erro", async () => {
  const { result } = setup();
  const id = await ask(result, "/hermes leia o arquivo");
  advanceRequest(api, id, { status: "running", trace: thinking("running") });
  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps"]));

  advanceRequest(api, id, { status: "failed", errorCode: "unavailable", trace: thinking("running") });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error" }));
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps", "error"]);
  expect(result.current.messages[1]).toMatchObject({ running: false });
  expect(result.current.messages.at(-1)).toMatchObject({ retryText: "/hermes leia o arquivo", text: expect.stringContaining("indisponível") });
  expect(result.current.pending).toBeNull();
});

test("um pedido comum segue pelo chat e nunca vai ao Hermes", async () => {
  const { result } = setup();
  await ask(result, "almocei arroz e feijao");

  expect(stepsPosts()).toHaveLength(1);
  expect(hermesPosts()).toHaveLength(0);
});

test("Hermes desligado: a API responde nao encontrado, o chat avisa e sai do modo Hermes", async () => {
  serve("off");
  const { result, onEntitiesChanged } = setup();

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(hermesPosts()).toHaveLength(1);
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("desligado") });
  expect(result.current.agentMode).toBeNull();
  expect(onEntitiesChanged).not.toHaveBeenCalled();
});

test("Hermes desligado no modo Hermes: avisa e volta ao assistente da agenda", async () => {
  serve("off");
  const { result } = setup();
  act(() => { result.current.send("/hermes"); });
  expect(result.current.agentMode).toBe("hermes");

  act(() => { result.current.send("me diga como conectar ao google agenda"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.agentMode).toBeNull();
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("desligado") });
});

test("reenviar a mensagem depois de uma falha de rede nao manda uma segunda ao Hermes", async () => {
  // A API aceita o pedido, mas a resposta se perde na rede.
  net.authedFetch.mockImplementationOnce(async (path: string, init?: RequestInit) => {
    await api.authedFetch(path, init);
    throw new TypeError("Failed to fetch");
  });
  const { result } = setup();
  act(() => { result.current.send("/hermes crie a tarefa"); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error", retryText: "/hermes crie a tarefa" }));
  expect(requests().size).toBe(1);

  act(() => result.current.retry((result.current.messages.at(-1) as { id: string }).id));

  await waitFor(() => expect(hermesPosts()).toHaveLength(2));
  expect(bodyOf(1)).toMatchObject({ clientMessageId: bodyOf(0).clientMessageId });
  expect(requests().size).toBe(1);
  expect(result.current.messages.filter((message) => message.role === "user")).toHaveLength(1);
});

test("a sessao e o primeiro pedido: a mensagem seguinte ao Hermes manda o id dele como sessionId", async () => {
  const { result } = setup();
  const first = await ask(result, "/hermes oi");
  advanceRequest(api, first, { status: "completed", message: "Oi." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  await ask(result, "e amanha?");

  expect(bodyOf(0)).not.toHaveProperty("sessionId");
  expect(bodyOf(1)).toMatchObject({ sessionId: first, text: "e amanha?" });
});

test("depois de /hermes, as mensagens seguintes continuam com o Hermes ate /app", async () => {
  const { result } = setup();
  const first = await ask(result, "/hermes oi");
  advanceRequest(api, first, { status: "completed", message: "Oi." });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.agentMode).toBe("hermes");

  const second = await ask(result, "me diga como conectar ao google agenda");
  expect(hermesPosts()).toHaveLength(2);
  expect(stepsPosts()).toHaveLength(0);
  advanceRequest(api, second, { status: "completed", message: "Pelo menu do Google." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  act(() => { result.current.send("/app"); });
  expect(result.current.agentMode).toBeNull();
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("De volta") });

  await ask(result, "almocei arroz");
  expect(stepsPosts()).toHaveLength(1);
  expect(hermesPosts()).toHaveLength(2);
});

test("/hermes sozinho so liga o modo, sem chamar o servidor", () => {
  const { result } = setup();

  act(() => { result.current.send("/hermes"); });

  expect(result.current.agentMode).toBe("hermes");
  expect(result.current.pending).toBeNull();
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages.at(-1)).toMatchObject({ text: expect.stringContaining("/app") });
  expect(api.calls).toHaveLength(0);
});

test("nova conversa sai do modo Hermes e limpa a sessao", async () => {
  const { result } = setup();
  const first = await ask(result, "/hermes oi");
  advanceRequest(api, first, { status: "completed", message: "Oi." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  act(() => result.current.startNewConversation());

  expect(result.current.agentMode).toBeNull();
  expect(result.current.messages).toEqual([]);
  await ask(result, "outra conversa");
  expect(stepsPosts()).toHaveLength(1);
});

test("sessao expirada ao iniciar vira erro de sessao", async () => {
  net.authedFetch.mockImplementation(async () => { throw new ApiError(401, "POST /api/requests/hermes -> 401"); });
  const { result } = setup();

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: expect.stringContaining("sessão") }));
});

test("o rastro do Hermes abre ao enviar, cresce enquanto roda e fecha com a resposta", async () => {
  const { result } = setup();
  const id = await ask(result, "/hermes que horas sao?");

  expect(result.current.traces).toEqual([{ id: result.current.messages[0]?.id, request: "que horas sao?", route: "hermes", running: true, trace: null }]);

  advanceRequest(api, id, { status: "running", trace: thinking("running") });
  await waitFor(() => expect(result.current.traces).toEqual([
    { id: result.current.messages[0]?.id, request: "que horas sao?", route: "hermes", running: true, trace: thinking("running") },
  ]));

  advanceRequest(api, id, { status: "completed", trace: thinking("done"), message: "18h" });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.traces).toEqual([
    { id: result.current.messages[0]?.id, request: "que horas sao?", route: "hermes", running: false, trace: thinking("done") },
  ]);

  act(() => { result.current.startNewConversation(); });
  expect(result.current.traces).toEqual([]);
});

test("um pedido do Hermes que falha deixa o rastro parado; tentar de novo o tira junto com o pedido", async () => {
  const { result } = setup();
  const id = await ask(result, "/hermes oi");
  advanceRequest(api, id, { status: "failed", errorCode: "unavailable" });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.traces).toMatchObject([{ request: "oi", route: "hermes", running: false, trace: null }]);
  const failedId = result.current.traces[0]?.id;

  act(() => { result.current.retry(`${failedId}-error`); });
  await waitFor(() => expect(hermesPosts()).toHaveLength(2));
  await waitFor(() => expect(result.current.traces).toHaveLength(1));
  expect(result.current.traces[0]?.id).not.toBe(failedId);
  expect(ids()).toHaveLength(2);
});
