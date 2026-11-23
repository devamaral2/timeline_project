import { act, renderHook, waitFor } from "@testing-library/react";
import type { AgentTaskStatus, RequestDto } from "@repo/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import { createFakeApi, type FakeApi } from "@/test/fake-api";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { useAgentChat } from "./use-agent-chat";

// A conversa fala com a API falsa: o authedFetch vira a API em memória (a mesma costura dos outros testes).
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

beforeEach(() => {
  api = createFakeApi({ areas: [requestsArea()] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
});

const requests = () => api.store.table<RequestDto>("requests");
const ids = () => [...requests().keys()];
const posts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests");
const bodyOf = (index: number) => posts()[index]?.body as Record<string, unknown>;
const clientIdOf = (index: number) => bodyOf(index).clientMessageId;

function setup() {
  const onEntitiesChanged = vi.fn();
  const hook = renderHook(() => useAgentChat({ userId: "u", onEntitiesChanged, processPollMs: 5 }));
  return { ...hook, onEntitiesChanged };
}

type Chat = { current: ReturnType<typeof useAgentChat> };

/** Manda uma mensagem e espera a API aceitá-la: devolve o id do pedido novo. */
async function ask(chat: Chat, text: string): Promise<string> {
  const before = requests().size;
  act(() => { chat.current.send(text); });
  await waitFor(() => expect(requests().size).toBe(before + 1));
  return ids().at(-1) as string;
}

const step = (id: string, label: string, status: AgentTaskStatus) => ({ id, agent: "task-create", label, status });

test("a caixa de processo acompanha os passos ate o fim e a agenda atualiza uma vez", async () => {
  const { result, onEntitiesChanged } = setup();
  const id = await ask(result, "comendo arroz, depois vou nadar");

  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "process"]));
  advanceRequest(api, id, { status: "running", steps: [step("s1", "Criando tarefas", "done"), step("s2", "Criando notas", "running")] });
  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "process", request: { status: "running" } }));
  expect(result.current.pending).toMatchObject({ label: "Realizando processos", requestId: id });
  expect(onEntitiesChanged).not.toHaveBeenCalled();

  advanceRequest(api, id, {
    status: "done",
    steps: [step("s1", "Criando tarefas", "done"), step("s2", "Criando notas", "done")],
    entities: [{ kind: "task", id: "e1", name: "Refeição", operation: "create", linkedTo: [] }],
  });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "process", request: { status: "done" } });
  expect(bodyOf(0)).toEqual({ userId: "u", text: "comendo arroz, depois vou nadar", clientMessageId: expect.any(String) });
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("consulta ou resposta sem entidades nao atualiza a agenda", async () => {
  const { result, onEntitiesChanged } = setup();
  const id = await ask(result, "qual a capital da França?");
  advanceRequest(api, id, { status: "done", message: "Paris." });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ request: { message: "Paris." } });
  expect(onEntitiesChanged).not.toHaveBeenCalled();
});

test("erro ao iniciar vira o erro de conexao com tentar de novo", async () => {
  api.failNext("POST", "/api/requests", 500);
  const { result } = setup();
  act(() => { result.current.send("oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({
    role: "error",
    text: "Não consegui conectar ao assistente. Tente de novo.",
    retryText: "oi",
  });
  expect(posts()).toHaveLength(1);
});

test("um pedido que falha mostra a mensagem do codigo do erro; tentar de novo abre um pedido novo", async () => {
  const { result } = setup();
  const id = await ask(result, "crie a tarefa");
  advanceRequest(api, id, { status: "failed", errorCode: "unavailable" });

  await waitFor(() => expect(result.current.pending).toBeNull());
  const error = result.current.messages.at(-1);
  expect(error).toMatchObject({
    role: "error",
    text: "A IA está indisponível agora. Tente de novo em instantes.",
    retryText: "crie a tarefa",
  });
  expect(result.current.messages.find((message) => message.role === "user")).toMatchObject({ failed: true });

  act(() => result.current.retry((error as { id: string }).id));
  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(clientIdOf(1)).not.toBe(clientIdOf(0));
  await waitFor(() => expect(requests().size).toBe(2));
});

test("reenviar a mesma mensagem depois de uma falha de rede nao abre um segundo pedido", async () => {
  // A API aceita o pedido, mas a resposta se perde na rede.
  let lost = false;
  net.authedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    const response = await api.authedFetch(path, init);
    if (lost || path !== "/api/requests" || init?.method !== "POST") return response;
    lost = true;
    throw new TypeError("Failed to fetch");
  });
  const { result } = setup();
  act(() => { result.current.send("crie a tarefa"); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error", retryText: "crie a tarefa" }));
  expect(requests().size).toBe(1);

  act(() => result.current.retry((result.current.messages.at(-1) as { id: string }).id));

  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(clientIdOf(1)).toBe(clientIdOf(0));
  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "process" }));
  expect(requests().size).toBe(1);
  expect(result.current.messages.filter((message) => message.role === "user")).toHaveLength(1);
});

test("a mensagem seguinte manda o id do primeiro pedido como sessao", async () => {
  const { result } = setup();
  const first = await ask(result, "o que tenho hoje?");
  advanceRequest(api, first, { status: "done", message: "Um treino." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  await ask(result, "e amanhã?");
  expect(bodyOf(0)).not.toHaveProperty("sessionId");
  expect(bodyOf(1)).toMatchObject({ sessionId: first });
});

test("comecar uma conversa nova desfaz a sessao", async () => {
  const { result } = setup();
  const first = await ask(result, "primeira");
  advanceRequest(api, first, { status: "done", message: "Ok." });
  await waitFor(() => expect(result.current.pending).toBeNull());

  act(() => result.current.startNewConversation());
  await ask(result, "outra conversa");
  expect(bodyOf(1)).not.toHaveProperty("sessionId");
});

test("cancelar pelo chat cancela o pedido na API; a mensagem nao vira falha", async () => {
  const { result } = setup();
  const id = await ask(result, "crie uma nota");
  await waitFor(() => expect(result.current.pending).toMatchObject({ requestId: id }));

  act(() => result.current.cancel());

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(requests().get(id)).toMatchObject({ status: "cancel" });
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: "Pedido cancelado.", retryText: "crie uma nota" });
  expect(result.current.messages.find((message) => message.role === "user")).not.toHaveProperty("failed", true);
});

test("sessao expirada ao acompanhar o pedido", async () => {
  net.authedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET" && path.startsWith("/api/requests/")) throw new ApiError(401, "expired");
    return api.authedFetch(path, init);
  });
  const { result } = setup();
  act(() => { result.current.send("oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: "Sua sessão acabou. Entre de novo para continuar." });
});

test("falhas seguidas ao consultar o pedido viram conexao perdida; tentar de novo retoma o mesmo pedido", async () => {
  let broken = true;
  net.authedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (broken && (init?.method ?? "GET") === "GET" && path.startsWith("/api/requests/")) throw new ApiError(500, "down");
    return api.authedFetch(path, init);
  });
  const { result } = setup();
  act(() => { result.current.send("oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", retryText: "oi" });

  broken = false;
  act(() => result.current.retry((result.current.messages.at(-1) as { id: string }).id));

  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(clientIdOf(1)).toBe(clientIdOf(0));
  expect(requests().size).toBe(1);
  const id = ids()[0] as string;
  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "process" }));
  advanceRequest(api, id, { status: "done", message: "Pronto." });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ request: { message: "Pronto." } });
});

test("o rastro do pedido abre com a mensagem, segue cada consulta e para de girar no fim", async () => {
  const trace = (status: "running" | "done") => ({
    route: "steps" as const, status, fields: [],
    entries: [{ id: "s1", kind: "agent" as const, label: "Criando tarefas", status }],
  });
  const { result } = setup();
  const id = await ask(result, "almoço ao meio-dia");

  advanceRequest(api, id, { status: "running", trace: trace("running") });
  await waitFor(() => expect(result.current.traces).toEqual([
    {
      id: result.current.messages[0]?.id,
      request: "almoço ao meio-dia",
      route: "steps",
      running: true,
      trace: expect.objectContaining({ status: "running" }),
    },
  ]));

  advanceRequest(api, id, { status: "done", trace: trace("done") });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.traces).toMatchObject([{ running: false, trace: { status: "done" } }]);
});

test("um servidor que nao manda rastro deixa o pedido na aba, sem detalhes", async () => {
  const { result } = setup();
  const id = await ask(result, "almoço ao meio-dia");
  advanceRequest(api, id, { status: "done" });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.traces).toMatchObject([{ request: "almoço ao meio-dia", running: false, trace: null }]);
});

test("o fallback e o Hermes: o pedido que muda para a rota dele troca a caixa de processo pela conversa do Hermes", async () => {
  const { result, onEntitiesChanged } = setup();
  const id = await ask(result, "me conta uma piada");
  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "process"]));

  const tool = { id: "t1", kind: "tool" as const, label: "Pensou numa piada", status: "running" as const };
  advanceRequest(api, id, { route: "hermes", status: "running", trace: { route: "hermes", status: "running", fields: [], entries: [tool] } });
  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps"]));
  expect(result.current.pending).toMatchObject({ label: "Falando com o Hermes", requestId: id });
  expect(result.current.traces[0]).toMatchObject({ route: "hermes", running: true });

  advanceRequest(api, id, {
    route: "hermes", status: "done", message: "Era uma vez…",
    trace: { route: "hermes", status: "done", fields: [], entries: [{ ...tool, status: "done" }] },
  });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps", "assistant"]);
  expect(result.current.messages.at(-1)).toMatchObject({ text: "Era uma vez…" });
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("o fallback com o Hermes desligado mostra o aviso do servidor", async () => {
  const { result } = setup();
  const id = await ask(result, "me conta uma piada");
  advanceRequest(api, id, { route: "hermes", status: "failed", errorCode: "unavailable", message: "O Hermes está desligado." });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: "O Hermes está desligado.", retryText: "me conta uma piada" });
});
