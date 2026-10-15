import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { VoiceEventButton } from "./VoiceEventButton";

const { voice, get, list, cancel } = vi.hoisted(() => ({ voice: vi.fn(), get: vi.fn(), list: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/ai-jobs/ai-jobs", async (original) => ({
  ...await original<typeof import("@/lib/ai-jobs/ai-jobs")>(),
  aiJobs: { voice, get, list, cancel },
}));
vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: { userId: "user-1" }, ready: true }),
}));
const completed = { id: "j1", kind: "transcript-event", status: "succeeded" };

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
  fireEvent.click(screen.getByRole("button", { name: "Gravar evento por voz" }));
  const recognition = FakeSpeechRecognition.instances.at(-1);
  act(() => recognition?.emitFinal(transcript));
  fireEvent.click(screen.getByRole("button", { name: "Parar gravação" }));
}

beforeEach(() => {
  localStorage.clear();
  voice.mockReset().mockResolvedValue(completed);
  get.mockReset().mockResolvedValue(completed);
  cancel.mockReset().mockResolvedValue({ ...completed, status: "cancelled" });
  list.mockReset().mockResolvedValue([]);
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("renders nothing when the browser has no speech recognition", () => {
  vi.stubGlobal("SpeechRecognition", undefined);

  render(<VoiceEventButton onCreated={vi.fn()} />);

  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("posts the transcript to the voice route and refreshes when it lands", async () => {
  const onCreated = vi.fn();
  render(<VoiceEventButton onCreated={onCreated} />);

  speak("comecei a estudar ingles");

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(voice).toHaveBeenCalledWith("comecei a estudar ingles", expect.any(String));
});

test("shows the pending chip while the agent works", async () => {
  voice.mockReturnValue(new Promise(() => {}));
  render(<VoiceEventButton onCreated={vi.fn()} />);

  speak("almocei arroz e feijao");

  expect(await screen.findByText("Criando evento...")).toBeInTheDocument();
});

test("never keeps two creations in flight at the same time", async () => {
  const resolvers: Array<(value: unknown) => void> = [];
  voice.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  render(<VoiceEventButton onCreated={vi.fn()} />);

  speak("almocei arroz e feijao");
  await waitFor(() => expect(voice).toHaveBeenCalledTimes(1));
  speak("comecei a estudar ingles");

  // Em paralelo, o evento lento gravaria depois do rapido e o fecharia com um finishedAt
  // anterior ao seu startedAt, corrompendo a timeline.
  expect(voice).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Criando 2 eventos...")).toBeInTheDocument();

  await act(async () => {
    resolvers[0](completed);
  });

  await waitFor(() => expect(voice).toHaveBeenCalledTimes(2));
});

test("offers a retry when the agent fails", async () => {
  voice.mockResolvedValueOnce({ ...completed, status: "failed" })
    .mockResolvedValueOnce(completed);
  const onCreated = vi.fn();
  render(<VoiceEventButton onCreated={onCreated} />);

  speak("comecei a estudar ingles");

  expect(await screen.findByText("Não foi possível criar o evento.")).toBeInTheDocument();
  expect(onCreated).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
});

test("lost submission response retries with the same request id, then only polls the accepted job", async () => {
  vi.useFakeTimers();
  voice.mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce({ ...completed, status: "queued" });
  const onCreated = vi.fn();
  render(<VoiceEventButton onCreated={onCreated} />);
  speak("almocei arroz");
  await act(async () => {});
  const firstRequest = voice.mock.calls[0];
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(voice.mock.calls[1]).toEqual(firstRequest);
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(get).toHaveBeenCalledWith("j1");
  expect(voice).toHaveBeenCalledTimes(2);
  expect(onCreated).toHaveBeenCalledTimes(1);
});

test("reload recovers pending owned voice jobs without submitting again", async () => {
  vi.useFakeTimers();
  list.mockResolvedValue([{ ...completed, status: "running", createdAt: "2026-01-01",
    request: { text: "almocei arroz", clientMessageId: "original-voice-id" } }]);
  const onCreated = vi.fn();
  render(<VoiceEventButton onCreated={onCreated} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(get).toHaveBeenCalledWith("j1");
  expect(voice).not.toHaveBeenCalled();
  expect(onCreated).toHaveBeenCalledTimes(1);
});

test("explicit voice cancel targets the accepted job, not another submission", async () => {
  voice.mockResolvedValue({ ...completed, status: "queued" });
  render(<VoiceEventButton onCreated={vi.fn()} />);
  speak("almocei arroz");
  await waitFor(() => expect(voice).toHaveBeenCalledTimes(1));
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Cancelar evento por voz" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledWith("j1"));
  expect(voice).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Pedido cancelado.")).toBeInTheDocument();
});
