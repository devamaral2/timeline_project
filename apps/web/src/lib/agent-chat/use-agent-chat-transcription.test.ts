import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { requestsArea } from "@/test/fake-api/requests";
import { transcriptionArea } from "@/test/fake-api/transcription";
import { useAgentChat } from "./use-agent-chat";

// Um link de vídeo do YouTube sozinho vai direto ao pedido de transcrição (spec #39), sem o agente de roteamento.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;
const VIDEO = "https://youtu.be/dQw4w9WgXcQ";

const transcriptionPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/tasks/transcription-requests");
const stepsPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests");
const hermesPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests/hermes");

beforeEach(() => {
  api = createFakeApi({ areas: [requestsArea({ hermes: "on" }), transcriptionArea] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
});

function setup() {
  const onEntitiesChanged = vi.fn();
  const hook = renderHook(() => useAgentChat({ userId: "owner", onEntitiesChanged, processPollMs: 5 }));
  return { ...hook, onEntitiesChanged };
}

test("uma mensagem que é só um link de vídeo pede a transcrição e diz que o vídeo entrou na fila", async () => {
  const { result, onEntitiesChanged } = setup();
  act(() => { result.current.send(`  ${VIDEO}  `); });

  await waitFor(() => expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]));
  expect(transcriptionPosts().map((call) => call.body)).toEqual([{ url: VIDEO }]);
  expect(stepsPosts()).toHaveLength(0);
  expect(result.current.messages[1]).toMatchObject({
    text: expect.stringContaining("entrou na fila de transcrição"),
    entities: [{ kind: "task", id: "leitura-diaria", change: "updated", label: "Leitura diária" }],
  });
  expect(result.current.pending).toBeNull();
  expect(result.current.traces).toEqual([]);
  expect(onEntitiesChanged).toHaveBeenCalledTimes(1);
});

test("pedir de novo o mesmo vídeo diz que ele já estava na fila", async () => {
  const { result } = setup();
  act(() => { result.current.send(VIDEO); });
  await waitFor(() => expect(result.current.pending).toBeNull());
  act(() => { result.current.send(VIDEO); });
  await waitFor(() => expect(result.current.messages).toHaveLength(4));

  expect(result.current.messages[3]).toMatchObject({ role: "assistant", text: expect.stringContaining("já estava na fila") });
});

test("enquanto o pedido é gravado, o chat fica ocupado e a linha de status diz o que acontece", async () => {
  const { result } = setup();
  act(() => { result.current.send(VIDEO); });

  expect(result.current.pending).toMatchObject({ label: "Pedindo a transcrição" });
  await waitFor(() => expect(result.current.pending).toBeNull());
});

test("um link no meio do texto segue para o agente de sempre", async () => {
  const { result } = setup();
  act(() => { result.current.send(`resuma ${VIDEO}`); });

  await waitFor(() => expect(stepsPosts()).toHaveLength(1));
  expect(transcriptionPosts()).toHaveLength(0);
});

test("um link que não é de vídeo (canal) segue para o agente de sempre", async () => {
  const { result } = setup();
  act(() => { result.current.send("https://www.youtube.com/@canal"); });

  await waitFor(() => expect(stepsPosts()).toHaveLength(1));
  expect(transcriptionPosts()).toHaveLength(0);
});

test("no modo Hermes o link vai ao Hermes, não à transcrição", async () => {
  const { result } = setup();
  act(() => { result.current.send("/hermes"); });
  await waitFor(() => expect(result.current.agentMode).toBe("hermes"));
  act(() => { result.current.send(VIDEO); });

  await waitFor(() => expect(hermesPosts()).toHaveLength(1));
  expect(transcriptionPosts()).toHaveLength(0);
});

test("a API recusar o link mostra um aviso claro e 'Tentar de novo' pede outra vez", async () => {
  const { result } = setup();
  api.failNext("POST", "/api/tasks/transcription-requests", 400);
  act(() => { result.current.send(VIDEO); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error" }));
  expect(result.current.messages.at(-1)).toMatchObject({ text: "Esse link não é de um vídeo do YouTube.", retryText: VIDEO });
  expect(result.current.pending).toBeNull();

  const errorId = result.current.messages.at(-1)?.id as string;
  act(() => { result.current.retry(errorId); });
  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant" }));
  expect(transcriptionPosts()).toHaveLength(2);
});

test("falha de rede ao pedir mostra o erro de conexão", async () => {
  const { result } = setup();
  api.failNext("POST", "/api/tasks/transcription-requests", 500);
  act(() => { result.current.send(VIDEO); });

  await waitFor(() => expect(result.current.messages.at(-1)).toMatchObject({ role: "error", text: expect.stringContaining("conectar") }));
});
