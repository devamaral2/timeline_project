import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import type { AiProcessDto } from "@/lib/api/contracts";
import type { AgentChatEvent } from "./agent-chat-client";
import { useAgentChat } from "./use-agent-chat";

const base = { title: "Realizando processos:", entities: [] as AiProcessDto["entities"] };
const running: AiProcessDto = {
  ...base, id: "p1", status: "running",
  steps: [
    { id: "s1", agent: "event-create", label: "Criando eventos", status: "succeeded" },
    { id: "s2", agent: "note-create", label: "Criando notas", status: "running" },
  ],
};
const done: AiProcessDto = {
  ...running, status: "completed",
  steps: running.steps.map((step) => ({ ...step, status: "succeeded" as const })),
  entities: [{ kind: "event", id: "e1", name: "Refeição", operation: "create", linkedTo: [] }],
};

function setup(processApi: { start: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }) {
  const client = { send: vi.fn(async () => {}), cancel: vi.fn(), close: vi.fn() };
  const onEntitiesChanged = vi.fn();
  let emit: (event: AgentChatEvent) => void = () => {};
  // Estavel de proposito: um `createClient` novo a cada render recria o cliente e zera o pedido em andamento.
  const createClient = (options: { onEvent: (event: AgentChatEvent) => void }) => { emit = options.onEvent; return client; };
  const hook = renderHook(() => useAgentChat({ userId: "u", createClient, onEntitiesChanged, processApi, processPollMs: 5 }));
  return { ...hook, client, onEntitiesChanged, emit: (event: AgentChatEvent) => act(() => emit(event)) };
}

beforeEach(() => vi.clearAllMocks());

test("a caixa de processo acompanha os passos ate o fim e a agenda atualiza uma vez", async () => {
  const start = vi.fn(async () => ({ processId: "p1" }));
  let release: (view: AiProcessDto) => void = () => {};
  const get = vi.fn()
    .mockResolvedValueOnce(running)
    .mockImplementationOnce(() => new Promise<AiProcessDto>((resolve) => { release = resolve; }))
    .mockResolvedValue(done);
  const { result, client, onEntitiesChanged } = setup({ start, get });

  act(() => { result.current.send("comendo arroz, depois vou nadar"); });

  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "process"]));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(result.current.pending).toMatchObject({ label: "Realizando processos" });
  expect(result.current.messages.at(-1)).toMatchObject({ process: { status: "running" } });
  expect(onEntitiesChanged).not.toHaveBeenCalled();
  await act(async () => { release(done); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  const box = result.current.messages.at(-1);
  expect(box).toMatchObject({ role: "process", process: { status: "completed" } });
  expect(start).toHaveBeenCalledWith({ userId: "u", text: "comendo arroz, depois vou nadar", context: undefined });
  expect(client.send).not.toHaveBeenCalled();
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("consulta ou resposta sem entidades nao atualiza a agenda", async () => {
  const start = vi.fn(async () => ({ processId: "p1" }));
  const get = vi.fn(async () => ({ ...done, entities: [], message: "Paris." }));
  const { result, onEntitiesChanged } = setup({ start, get });
  act(() => { result.current.send("qual a capital da França?"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ process: { message: "Paris." } });
  expect(onEntitiesChanged).not.toHaveBeenCalled();
});

test("404 ao iniciar: a rota por processo esta desligada, o chat segue pelo caminho de sempre e nao tenta de novo", async () => {
  const start = vi.fn(async () => { throw new ApiError(404, "POST /api/ai/process -> 404"); });
  const { result, client, emit } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("primeira"); });
  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
  const first = (client.send.mock.calls[0] as unknown as [{ id: string; text: string }])[0];
  expect(first.text).toBe("primeira");
  expect(result.current.messages.map((message) => message.role)).toEqual(["user"]);

  // O servidor responde pelo chat de sempre; a proxima mensagem nem passa pela rota por processo.
  emit({ type: "reply", id: first.id, conversationId: "c1", assistantSeq: 2, agentResponse: "Ok", entities: [], createdEntities: [], updatedEntities: [], deletedEntities: [] });
  await waitFor(() => expect(result.current.pending).toBeNull());
  act(() => { result.current.send("segunda"); });
  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(2));
  expect(start).toHaveBeenCalledTimes(1);
});

test("erro ao iniciar vira o erro de conexao com tentar de novo", async () => {
  const start = vi.fn(async () => { throw new ApiError(500, "boom"); });
  const { result, client } = setup({ start, get: vi.fn() });
  act(() => { result.current.send("oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", retryText: "oi" });
  expect(client.send).not.toHaveBeenCalled();
});

test("sessao expirada ao acompanhar o processo", async () => {
  const start = vi.fn(async () => ({ processId: "p1" }));
  const get = vi.fn(async () => { throw new ApiError(401, "expired"); });
  const { result } = setup({ start, get });
  act(() => { result.current.send("oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: "Sua sessão acabou. Entre de novo para continuar." });
});

test("falhas seguidas ao consultar o processo viram conexao perdida", async () => {
  const start = vi.fn(async () => ({ processId: "p1" }));
  const get = vi.fn(async () => { throw new ApiError(500, "down"); });
  const { result } = setup({ start, get });
  act(() => { result.current.send("oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(get).toHaveBeenCalledTimes(5);
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", retryText: "oi" });
});

test("cancelar nao se aplica a um processo ja entregue as filas", async () => {
  const start = vi.fn(async () => ({ processId: "p1" }));
  const get = vi.fn(async () => running);
  const { result, client } = setup({ start, get });
  act(() => { result.current.send("oi"); });
  await waitFor(() => expect(result.current.messages.some((message) => message.role === "process")).toBe(true));
  act(() => { result.current.cancel(); });
  expect(client.cancel).not.toHaveBeenCalled();
  expect(result.current.pending?.cancelling).toBeUndefined();
});
