import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RequestDto, RequestEntityDto } from "@repo/contracts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, requestFixture, requestsArea } from "@/test/fake-api/requests";
import { VoiceTaskButton } from "./VoiceTaskButton";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));
vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: { userId: "user-1" }, ready: true }),
}));

let api: FakeApi;
const requests = () => api.store.table<RequestDto>("requests");
const voicePosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests/voice");
const lastRequestId = () => [...requests().keys()].at(-1) as string;
const createdTask: RequestEntityDto = { kind: "task", id: "ev-9", name: "Estudar inglês", operation: "create", linkedTo: [] };

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 0;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start(): void {}

  stop(): void {
    this.onend?.();
  }

  abort(): void {}

  emitFinal(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal: true })],
    } as unknown as SpeechRecognitionEvent);
  }
}

/** Grava uma frase completa: aperta o botao, fala e aperta de novo para parar. */
function speak(transcript: string): void {
  fireEvent.click(screen.getByRole("button", { name: "Gravar tarefa por voz" }));
  const recognition = FakeSpeechRecognition.instances.at(-1);
  act(() => recognition?.emitFinal(transcript));
  fireEvent.click(screen.getByRole("button", { name: "Parar gravação" }));
}

beforeEach(() => {
  localStorage.clear();
  api = createFakeApi({ areas: [requestsArea()] });
  net.authedFetch.mockReset().mockImplementation(api.authedFetch);
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("renders nothing when the browser has no speech recognition", () => {
  vi.stubGlobal("SpeechRecognition", undefined);

  render(<VoiceTaskButton onCreated={vi.fn()} />);

  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("sends the transcript as a voice request and hands the created task over when it is done", async () => {
  const onCreated = vi.fn();
  render(<VoiceTaskButton onCreated={onCreated} />);

  speak("comecei a estudar ingles");

  await waitFor(() => expect(voicePosts()).toHaveLength(1));
  expect(voicePosts()[0]?.body).toEqual({ transcript: "comecei a estudar ingles", clientMessageId: expect.any(String) });
  advanceRequest(api, lastRequestId(), { status: "completed", entities: [createdTask] });

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdTask), { timeout: 4000 });
}, 15000);

test("shows the pending chip while the agent works", async () => {
  render(<VoiceTaskButton onCreated={vi.fn()} />);

  speak("almocei arroz e feijao");

  expect(await screen.findByText("Criando tarefa...")).toBeInTheDocument();
});

test("never keeps two creations in flight at the same time", async () => {
  const onCreated = vi.fn();
  render(<VoiceTaskButton onCreated={onCreated} />);

  speak("almocei arroz e feijao");
  await waitFor(() => expect(voicePosts()).toHaveLength(1));
  speak("comecei a estudar ingles");

  // O segundo pedido só segue depois que o primeiro termina: duas tarefas em paralelo se fechariam na ordem errada.
  expect(await screen.findByText("Criando 2 tarefas...")).toBeInTheDocument();
  expect(voicePosts()).toHaveLength(1);

  advanceRequest(api, lastRequestId(), { status: "completed", entities: [createdTask] });
  await waitFor(() => expect(voicePosts()).toHaveLength(2), { timeout: 4000 });
});

test("shows the failure message of a voice request that fails, and retries with a new request", async () => {
  const onCreated = vi.fn();
  render(<VoiceTaskButton onCreated={onCreated} />);

  speak("comecei a estudar ingles");
  await waitFor(() => expect(voicePosts()).toHaveLength(1));
  advanceRequest(api, lastRequestId(), { status: "failed", errorCode: "internal", message: "Não consegui criar a tarefa: a fala ficou vaga." });

  expect(await screen.findByText("Não consegui criar a tarefa: a fala ficou vaga.", {}, { timeout: 4000 })).toBeInTheDocument();
  expect(onCreated).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
  await waitFor(() => expect(voicePosts()).toHaveLength(2));
  expect(voicePosts()[1]?.body).not.toEqual(voicePosts()[0]?.body);
  advanceRequest(api, lastRequestId(), { status: "completed", entities: [createdTask] });

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1), { timeout: 4000 });
}, 15000);

test("a lost submission response is retried with the same message id, and the accepted request is then polled", async () => {
  let lost = true;
  net.authedFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === "/api/requests/voice" && lost) {
      lost = false;
      return Promise.reject(new TypeError("offline"));
    }
    return api.authedFetch(path, init);
  });
  const onCreated = vi.fn();
  render(<VoiceTaskButton onCreated={onCreated} />);

  speak("almocei arroz");
  expect(await screen.findByText("Reconectando — seu pedido continua salvo.")).toBeInTheDocument();

  // A tentativa perdida não chegou à API falsa: conta-se no mock de rede, que vê as duas tentativas.
  const sent = () => net.authedFetch.mock.calls.filter(([path]) => path === "/api/requests/voice");
  await waitFor(() => expect(sent()).toHaveLength(2), { timeout: 4000 });
  expect(sent()[1]?.[1]).toEqual(sent()[0]?.[1]);
  expect(requests().size).toBe(1);
  advanceRequest(api, lastRequestId(), { status: "completed", entities: [createdTask] });

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1), { timeout: 6000 });
}, 15000);

test("reload recovers the open voice request without submitting it again", async () => {
  const open = requestFixture({ id: "R0000000000000000000000002", route: "voice", status: "running", text: "almocei arroz" });
  requests().set(open.id, open);
  const onCreated = vi.fn();
  render(<VoiceTaskButton onCreated={onCreated} />);

  expect(await screen.findByText("Criando tarefa...")).toBeInTheDocument();
  advanceRequest(api, open.id, { status: "completed", entities: [createdTask] });

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdTask), { timeout: 4000 });
  expect(voicePosts()).toHaveLength(0);
});

test("explicit voice cancel targets the accepted request, not another submission", async () => {
  render(<VoiceTaskButton onCreated={vi.fn()} />);
  speak("almocei arroz");
  await waitFor(() => expect(requests().size).toBe(1));

  fireEvent.click(screen.getByRole("button", { name: "Cancelar tarefa por voz" }));

  expect(await screen.findByText("Pedido cancelado.", {}, { timeout: 4000 })).toBeInTheDocument();
  expect(api.calls.filter((call) => call.method === "POST" && call.pathname === `/api/requests/${lastRequestId()}/cancel`)).toHaveLength(1);
  expect(voicePosts()).toHaveLength(1);
});
