import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { VoiceEventButton } from "./VoiceEventButton";

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => "test-token" } }),
}));
vi.mock("@/lib/firebase/client-app", () => ({
  getClientApp: () => ({}),
}));

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

  render(<VoiceEventButton onCreated={vi.fn()} />);

  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("posts the transcript to the voice route and refreshes when it lands", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
  vi.stubGlobal("fetch", fetchMock);
  const onCreated = vi.fn();
  render(<VoiceEventButton onCreated={onCreated} />);

  speak("comecei a estudar ingles");

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/events/voice",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      body: JSON.stringify({ transcript: "comecei a estudar ingles" }),
    }),
  );
});

test("shows the pending chip while the agent works", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(<VoiceEventButton onCreated={vi.fn()} />);

  speak("almocei arroz e feijao");

  expect(await screen.findByText("Criando evento...")).toBeInTheDocument();
});

test("never keeps two creations in flight at the same time", async () => {
  const resolvers: Array<(value: unknown) => void> = [];
  const fetchMock = vi
    .fn()
    .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  vi.stubGlobal("fetch", fetchMock);
  render(<VoiceEventButton onCreated={vi.fn()} />);

  speak("almocei arroz e feijao");
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  speak("comecei a estudar ingles");

  // Em paralelo, o evento lento gravaria depois do rapido e o fecharia com um finishedAt
  // anterior ao seu startedAt, corrompendo a timeline.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Criando 2 eventos...")).toBeInTheDocument();

  await act(async () => {
    resolvers[0]({ ok: true, status: 201 });
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

test("offers a retry when the agent fails", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 502 })
    .mockResolvedValueOnce({ ok: true, status: 201 });
  vi.stubGlobal("fetch", fetchMock);
  const onCreated = vi.fn();
  render(<VoiceEventButton onCreated={onCreated} />);

  speak("comecei a estudar ingles");

  expect(await screen.findByText("O agente não respondeu. Tente de novo.")).toBeInTheDocument();
  expect(onCreated).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
});
