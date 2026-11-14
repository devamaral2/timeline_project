import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import type { HermesTurnJobDto } from "@/lib/ai-automation/ai-automation";
import { useAgentChat } from "./use-agent-chat";

const job = (status: HermesTurnJobDto["status"], extra: Partial<HermesTurnJobDto> = {}): HermesTurnJobDto => ({
  id: "job-1",
  kind: "hermes-turn",
  status,
  ...extra,
});

function setup(automationApi: { start: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }) {
  const onEntitiesChanged = vi.fn();
  /** Mensagem comum vai pela rota de processo; aqui so importa que ela foi (ou nao) iniciada. */
  const processStart = vi.fn(async () => ({ processId: "p1" }));
  const processApi = { start: processStart, get: vi.fn(() => new Promise<never>(() => {})) };
  const hook = renderHook(() =>
    useAgentChat({ userId: "owner", onEntitiesChanged, automationApi, automationPollMs: 5, processApi }),
  );
  return { ...hook, processStart, onEntitiesChanged };
}

beforeEach(() => vi.clearAllMocks());

test("/hermes manda so a mensagem ao Hermes, acompanha o job e mostra a resposta", async () => {
  const start = vi.fn(async () => job("queued"));
  let release: (value: HermesTurnJobDto) => void = () => {};
  const get = vi.fn()
    .mockResolvedValueOnce(job("running"))
    .mockImplementationOnce(() => new Promise<HermesTurnJobDto>((resolve) => { release = resolve; }));
  const { result, onEntitiesChanged } = setup({ start, get });

  act(() => { result.current.send("/hermes crie uma nota do dia"); });

  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(result.current.pending).toMatchObject({ label: "Falando com o Hermes" });
  expect(onEntitiesChanged).not.toHaveBeenCalled();
  await act(async () => { release(job("succeeded", { result: { text: "Nota criada." } })); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(start).toHaveBeenCalledWith({ userId: "owner", text: "crie uma nota do dia", clientMessageId: expect.any(String) });
  expect(get).toHaveBeenCalledWith("job-1");
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages[0]).toMatchObject({ text: "/hermes crie uma nota do dia" });
  expect(result.current.messages[1]).toMatchObject({ text: "Nota criada." });
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("os passos do Hermes aparecem enquanto ele trabalha, ficam depois e vem antes da resposta", async () => {
  const start = vi.fn(async () => job("queued"));
  const working = [{ id: "c1", kind: "tool" as const, label: "Executou um comando", detail: "date", status: "running" as const }];
  const finished = [{ ...working[0], status: "done" as const, durationMs: 800 }];
  let release: (value: HermesTurnJobDto) => void = () => {};
  const get = vi.fn()
    .mockResolvedValueOnce(job("running", { steps: working }))
    .mockImplementationOnce(() => new Promise<HermesTurnJobDto>((resolve) => { release = resolve; }));
  const { result } = setup({ start, get });

  act(() => { result.current.send("/hermes que ano e hoje?"); });

  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps"]);
  expect(result.current.messages[1]).toMatchObject({ running: true, steps: working });

  await act(async () => { release(job("succeeded", { steps: finished, result: { text: "2026" } })); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps", "assistant"]);
  expect(result.current.messages[1]).toMatchObject({ running: false, steps: finished });
  expect(result.current.messages[2]).toMatchObject({ text: "2026" });
});

test("um turno que falha mantem os passos ja dados e mostra o erro", async () => {
  const start = vi.fn(async () => job("queued"));
  const steps = [{ id: "c1", kind: "tool" as const, label: "Leu um arquivo", status: "failed" as const }];
  const get = vi.fn(async () => job("failed", { errorCode: "unavailable", steps }));
  const { result } = setup({ start, get });

  act(() => { result.current.send("/hermes leia o arquivo"); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error" }));
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "hermes-steps", "error"]);
  expect(result.current.messages[1]).toMatchObject({ running: false });
});

test("um pedido comum segue pelo chat e nunca chama o Hermes", async () => {
  const start = vi.fn();
  const { result, processStart } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("almocei arroz e feijao"); });

  await waitFor(() => expect(processStart).toHaveBeenCalledTimes(1));
  expect(start).not.toHaveBeenCalled();
});

test("404 ao iniciar: a rota esta desligada no servidor e o chat avisa", async () => {
  const start = vi.fn(async () => { throw new ApiError(404, "POST /api/ai/automation -> 404"); });
  const { result } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("/hermes oi"); });

  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("desligado") });
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
  const { result, processStart } = setup({ start, get });

  act(() => { result.current.send("/hermes oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(result.current.hermesMode).toBe(true);

  act(() => { result.current.send("me diga como conectar ao google agenda"); });
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.pending).toBeNull());
  expect(start).toHaveBeenLastCalledWith({
    userId: "owner", text: "me diga como conectar ao google agenda", clientMessageId: expect.any(String),
  });

  act(() => { result.current.send("/app"); });
  expect(result.current.hermesMode).toBe(false);
  expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", text: expect.stringContaining("De volta") });

  act(() => { result.current.send("almocei arroz"); });
  await waitFor(() => expect(processStart).toHaveBeenCalledTimes(1));
  expect(start).toHaveBeenCalledTimes(2);
});

test("/hermes sozinho so liga o modo, sem chamar o servidor", async () => {
  const start = vi.fn();
  const { result } = setup({ start, get: vi.fn() });

  act(() => { result.current.send("/hermes"); });

  expect(result.current.hermesMode).toBe(true);
  expect(result.current.pending).toBeNull();
  expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.current.messages.at(-1)).toMatchObject({ text: expect.stringContaining("/app") });
  expect(start).not.toHaveBeenCalled();
});

test("/app fora do modo Hermes e um pedido comum", async () => {
  const { result, processStart } = setup({ start: vi.fn(), get: vi.fn() });

  act(() => { result.current.send("/app"); });

  await waitFor(() => expect(processStart).toHaveBeenCalledTimes(1));
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


test("o rastro do turno acompanha o job: abre ao enviar, cresce enquanto roda e fecha com a resposta", async () => {
  const start = vi.fn(async () => job("queued"));
  const working = {
    route: "hermes" as const, status: "running" as const, fields: [],
    entries: [{ id: "c1", kind: "tool" as const, label: "Executou um comando", status: "running" as const }],
  };
  const finished = { ...working, status: "done" as const, durationMs: 900, entries: [{ ...working.entries[0], status: "done" as const }] };
  let release: (value: HermesTurnJobDto) => void = () => {};
  const get = vi.fn()
    .mockResolvedValueOnce(job("running", { trace: working }))
    .mockImplementationOnce(() => new Promise<HermesTurnJobDto>((resolve) => { release = resolve; }));
  const { result } = setup({ start, get });

  act(() => { result.current.send("/hermes que horas sao?"); });

  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(result.current.traces).toEqual([
    { id: result.current.messages[0]?.id, request: "que horas sao?", route: "hermes", running: true, trace: working },
  ]);

  await act(async () => { release(job("succeeded", { trace: finished, result: { text: "18h" } })); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.traces).toEqual([
    { id: result.current.messages[0]?.id, request: "que horas sao?", route: "hermes", running: false, trace: finished },
  ]);

  act(() => { result.current.startNewConversation(); });
  expect(result.current.traces).toEqual([]);
});

test("um turno que falha deixa o rastro parado; tentar de novo o tira junto com o pedido", async () => {
  const start = vi.fn(async () => job("queued"));
  const get = vi.fn().mockResolvedValue(job("failed", { errorCode: "unavailable" }));
  const { result } = setup({ start, get });

  act(() => { result.current.send("/hermes oi"); });
  await waitFor(() => expect(result.current.pending).toBeNull());

  expect(result.current.traces).toMatchObject([{ request: "oi", running: false, trace: null }]);
  const failedId = result.current.traces[0]?.id;

  get.mockImplementation(() => new Promise<never>(() => {}));
  act(() => { result.current.retry(`${failedId}-error`); });
  await waitFor(() => expect(result.current.traces).toHaveLength(1));
  expect(result.current.traces[0]?.id).not.toBe(failedId);
});
