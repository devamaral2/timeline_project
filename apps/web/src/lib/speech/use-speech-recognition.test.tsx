import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useSpeechRecognition } from "./use-speech-recognition";

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 0;
  started = false;
  aborted = false;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.onend?.();
  }

  abort(): void {
    this.aborted = true;
  }

  emit(entries: Array<{ transcript: string; isFinal: boolean }>): void {
    const results = entries.map((entry) =>
      Object.assign([{ transcript: entry.transcript }], { isFinal: entry.isFinal }),
    );
    this.onresult?.({
      resultIndex: 0,
      results,
    } as unknown as SpeechRecognitionEvent);
  }
}

beforeEach(() => {
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reports support only after mounting", () => {
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }));

  expect(result.current.supported).toBe(true);
});

test("hides itself when the browser has no speech recognition", () => {
  vi.stubGlobal("SpeechRecognition", undefined);

  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }));

  expect(result.current.supported).toBe(false);
});

test("configures a pt-BR continuous session on start", () => {
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }));

  act(() => result.current.start());

  const recognition = FakeSpeechRecognition.instances[0];
  expect(recognition.started).toBe(true);
  expect(recognition.lang).toBe("pt-BR");
  expect(recognition.continuous).toBe(true);
  expect(recognition.interimResults).toBe(true);
  expect(result.current.listening).toBe(true);
});

test("exposes the interim transcript while listening", () => {
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }));

  act(() => result.current.start());
  act(() => FakeSpeechRecognition.instances[0].emit([{ transcript: "almocei arr", isFinal: false }]));

  expect(result.current.interim).toBe("almocei arr");
});

test("delivers the joined final transcript exactly once", () => {
  const onFinalTranscript = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript }));

  act(() => result.current.start());
  act(() =>
    FakeSpeechRecognition.instances[0].emit([
      { transcript: "almocei arroz", isFinal: true },
      { transcript: " e feijao", isFinal: true },
    ]),
  );
  act(() => result.current.stop());
  // O Chrome ainda dispara o onend depois do ultimo resultado: nao pode virar um segundo evento.
  act(() => FakeSpeechRecognition.instances[0].onend?.());

  expect(onFinalTranscript).toHaveBeenCalledTimes(1);
  expect(onFinalTranscript).toHaveBeenCalledWith("almocei arroz  e feijao");
  expect(result.current.listening).toBe(false);
});

test("does not create an event when nothing was heard", () => {
  const onFinalTranscript = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript }));

  act(() => result.current.start());
  act(() =>
    FakeSpeechRecognition.instances[0].onerror?.({
      error: "no-speech",
    } as SpeechRecognitionErrorEvent),
  );
  act(() => result.current.stop());

  expect(onFinalTranscript).not.toHaveBeenCalled();
  expect(result.current.error).toBe("Não ouvi nada. Tente de novo.");
});

test("translates a denied microphone permission", () => {
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }));

  act(() => result.current.start());
  act(() =>
    FakeSpeechRecognition.instances[0].onerror?.({
      error: "not-allowed",
    } as SpeechRecognitionErrorEvent),
  );

  expect(result.current.error).toBe("Permita o acesso ao microfone para gravar.");
});

test("aborts an in-flight session when the component unmounts", () => {
  const onFinalTranscript = vi.fn();
  const { result, unmount } = renderHook(() => useSpeechRecognition({ onFinalTranscript }));

  act(() => result.current.start());
  act(() => FakeSpeechRecognition.instances[0].emit([{ transcript: "oi", isFinal: true }]));
  unmount();

  expect(FakeSpeechRecognition.instances[0].aborted).toBe(true);
  expect(onFinalTranscript).not.toHaveBeenCalled();
});
