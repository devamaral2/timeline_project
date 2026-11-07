import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import type { HermesTurnJobDto } from "@/lib/ai-automation/ai-automation";
import type { AgentChatEvent } from "./agent-chat-client";
import { useAgentChat } from "./use-agent-chat";

const job = (status: HermesTurnJobDto["status"], extra: Partial<HermesTurnJobDto> = {}): HermesTurnJobDto => ({
  id: "job-1",
  kind: "hermes-turn",
  status,
  ...extra,
});

function setup(automationApi: { start: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } | null) {
  const client = { send: vi.fn(async () => {}), cancel: vi.fn(), close: vi.fn() };
  const onEntitiesChanged = vi.fn();
  const createClient = (_options: { onEvent: (event: AgentChatEvent) => void }) => client;
  const hook = renderHook(() =>
    useAgentChat({ userId: "owner", createClient, onEntitiesChanged, automationApi, automationPollMs: 5 }),
  );
  return { ...hook, client, onEntitiesChanged };
}

beforeEach(() => vi.clearAllMocks());

test("/hermes manda so a mensagem ao Hermes, acompanha o job e mostra a resposta", async () => {
  const start = vi.fn(async () => job("queued"));
  let release: (value: HermesTurnJobDto) => void = () => {};
  const get = vi.fn()
    .mockResolvedValueOnce(job("running"))
    .mockImplementationOnce(() => new Promise<HermesTurnJobDto>((resolve) => { release = resolve; }));
  const { result, client, onEntitiesChanged } = setup({ start, get });

  act(() => { result.current.send("/hermes crie uma nota do dia"); });

  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(result.current.pending).toMatchObject({ label: "Falando com o Hermes" });
  expect(onEntitiesChanged).not.toHaveBeenCalled();
  await act(async () => { release(job("succeeded", { result: { text: "Nota criada." } })); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(start).toHaveBeenCalledWith({ userId: "owner", text: "crie uma nota do dia", clientMessageId: expect.any(String) });
  expect(get).toHaveBeenCalledWith("job-1");
  expect(client.send).not.toHaveBeenCalled();
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages[0]).toMatchObject({ text: "/hermes crie uma nota do dia" });
  expect(result.current.messages[1]).toMatchObject({ text: "Nota criada." });
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("um pedido comum segue pelo chat e nunca chama o Hermes", async () => {
  const start = vi.fn();
  const { result, client } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("almocei arroz e feijao"); });

  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
  expect(start).not.toHaveBeenCalled();
});

test("404 ao iniciar: a rota esta desligada no servidor e o chat avisa", async () => {
  const start = vi.fn(async () => { throw new ApiError(404, "POST /api/ai/automation -> 404"); });
  const { result, client } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("desligado") });
  expect(client.send).not.toHaveBeenCalled();
});

test("job que falhou vira erro com o pedido para tentar de novo", async () => {
  const start = vi.fn(async () => job("queued"));
  const get = vi.fn(async () => job("failed", { errorCode: "unavailable" }));
  const { result, onEntitiesChanged } = setup({ start, get });

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error" }));
  expect(result.current.messages.at(-1)).toMatchObject({ retryText: "/hermes oi", text: expect.stringContaining("indisponível") });
  expect(result.current.pending).toBeNull();
  expect(onEntitiesChanged).not.toHaveBeenCalled();
});

test("sessao expirada ao iniciar vira erro de sessao", async () => {
  const start = vi.fn(async () => { throw new ApiError(401, "POST /api/ai/automation -> 401"); });
  const { result } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: expect.stringContaining("sessão") }));
});

test("depois de /hermes, as mensagens seguintes continuam com o Hermes ate /app", async () => {
  const start = vi.fn(async () => job("queued"));
  const get = vi.fn(async () => job("succeeded", { result: { text: "resposta do hermes" } }));
  const { result, client } = setup({ start, get });

  act(() => { result.current.send("/hermes oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.hermesMode).toBe(true);

  act(() => { result.current.send("me diga como conectar ao google agenda"); });
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(start).toHaveBeenLastCalledWith({
    userId: "owner", text: "me diga como conectar ao google agenda", clientMessageId: expect.any(String),
  });
  expect(client.send).not.toHaveBeenCalled();

  act(() => { result.current.send("/app"); });
  expect(result.current.hermesMode).toBe(false);
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("De volta") });

  act(() => { result.current.send("almocei arroz"); });
  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
  expect(start).toHaveBeenCalledTimes(2);
});

test("/hermes sozinho so liga o modo, sem chamar o servidor", async () => {
  const start = vi.fn();
  const { result, client } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("/hermes"); });

  expect(result.current.hermesMode).toBe(true);
  expect(result.current.pending).toBeNull();
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages.at(-1)).toMatchObject({ text: expect.stringContaining("/app") });
  expect(start).not.toHaveBeenCalled();
  expect(client.send).not.toHaveBeenCalled();
});

test("/app fora do modo Hermes e um pedido comum", async () => {
  const { result, client } = setup({ start: vi.fn(), get: vi.fn() });

  act(() => { result.current.send("/app"); });

  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
  expect(result.current.hermesMode).toBe(false);
});

test("nova conversa sai do modo Hermes", async () => {
  const { result } = setup({ start: vi.fn(), get: vi.fn() });
  act(() => { result.current.send("/hermes"); });
  expect(result.current.hermesMode).toBe(true);

  act(() => { result.current.startNewConversation(); });

  expect(result.current.hermesMode).toBe(false);
  expect(result.current.messages).toEqual([]);
});

test("404 no modo Hermes: avisa e volta ao assistente da agenda", async () => {
  const start = vi.fn(async () => { throw new ApiError(404, "POST /api/ai/automation -> 404"); });
  const { result } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.hermesMode).toBe(false);
});

test("sem a rota (automationApi nulo) o /hermes e um pedido comum", async () => {
  const { result, client } = setup(null);

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
});

test("parar nao se aplica ao Hermes", async () => {
  const start = vi.fn(async () => job("queued"));
  const get = vi.fn(async () => job("running"));
  const { result, client } = setup({ start, get });

  act(() => { result.current.send("/hermes demore"); });
  await waitFor(() => expect(result.current.pending).toMatchObject({ label: "Falando com o Hermes" }));
  act(() => { result.current.cancel(); });

  expect(client.cancel).not.toHaveBeenCalled();
  expect(result.current.pending).toMatchObject({ label: "Falando com o Hermes" });
});
