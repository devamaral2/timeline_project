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

test("does not repeat a final result the browser delivers more than once", () => {
  const onFinalTranscript = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript }));

  act(() => result.current.start());
  // `results` e cumulativo: o Chrome reentrega o mesmo final a cada evento seguinte, e no
  // Android o `resultIndex` fica em zero. Doze reentregas repetiam a frase doze vezes.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    act(() =>
      FakeSpeechRecognition.instances[0].emit([
        { transcript: "vou lavar o carro amanha", isFinal: true },
      ]),
    );
  }
  act(() => result.current.stop());

  expect(onFinalTranscript).toHaveBeenCalledTimes(1);
  expect(onFinalTranscript).toHaveBeenCalledWith("vou lavar o carro amanha");
});

test("keeps an earlier final when the browser appends a new one", () => {
  const onFinalTranscript = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript }));

  act(() => result.current.start());
  act(() =>
    FakeSpeechRecognition.instances[0].emit([
      { transcript: "vou lavar o carro", isFinal: true },
    ]),
  );
  act(() =>
    FakeSpeechRecognition.instances[0].emit([
      { transcript: "vou lavar o carro", isFinal: true },
      { transcript: " amanha", isFinal: true },
    ]),
  );
  act(() => result.current.stop());

  expect(onFinalTranscript).toHaveBeenCalledWith("vou lavar o carro  amanha");
});

test("does not create an task when nothing was heard", () => {
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

test("shows everything heard so far, closed phrases and the one still coming", () => {
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }));

  act(() => result.current.start());
  act(() =>
    FakeSpeechRecognition.instances[0].emit([
      { transcript: "comprar pão", isFinal: true },
      { transcript: "e lei", isFinal: false },
    ]),
  );

  expect(result.current.heard).toBe("comprar pão e lei");
});

test("starts listening as it mounts when asked to", () => {
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn(), autoStart: true }));

  expect(FakeSpeechRecognition.instances).toHaveLength(1);
  expect(FakeSpeechRecognition.instances[0].started).toBe(true);
  expect(result.current.listening).toBe(true);
});

test("cancel turns the microphone off and delivers nothing", () => {
  const onFinalTranscript = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript }));

  act(() => result.current.start());
  act(() => FakeSpeechRecognition.instances[0].emit([{ transcript: "oi", isFinal: true }]));
  act(() => result.current.cancel());

  expect(FakeSpeechRecognition.instances[0].aborted).toBe(true);
  expect(result.current.listening).toBe(false);
  expect(result.current.heard).toBe("");
  expect(onFinalTranscript).not.toHaveBeenCalled();

  // O microfone pode ser ligado de novo depois.
  act(() => result.current.start());
  expect(FakeSpeechRecognition.instances).toHaveLength(2);
});

test("hands over what was said when the voice stops for long enough", () => {
  vi.useFakeTimers();
  try {
    const onFinalTranscript = vi.fn();
    const onSilenceTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript, onSilenceTranscript, silenceMs: 1500 }));

    act(() => result.current.start());
    act(() => FakeSpeechRecognition.instances[0].emit([{ transcript: "o que tenho hoje", isFinal: false }]));
    act(() => { vi.advanceTimersByTime(1400); });
    expect(onSilenceTranscript).not.toHaveBeenCalled();

    // Voltou a falar: a contagem recomeca.
    act(() => FakeSpeechRecognition.instances[0].emit([{ transcript: "o que tenho hoje de manhã", isFinal: true }]));
    act(() => { vi.advanceTimersByTime(1400); });
    expect(onSilenceTranscript).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(200); });
    expect(onSilenceTranscript).toHaveBeenCalledTimes(1);
    expect(onSilenceTranscript).toHaveBeenCalledWith("o que tenho hoje de manhã");
    expect(onFinalTranscript).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("does not cut the session before anything was heard", () => {
  vi.useFakeTimers();
  try {
    const onSilenceTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn(), onSilenceTranscript, silenceMs: 1500 }));

    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(result.current.listening).toBe(true);
    expect(onSilenceTranscript).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("a tap on stop still uses the regular transcript callback", () => {
  const onFinalTranscript = vi.fn();
  const onSilenceTranscript = vi.fn();
  const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript, onSilenceTranscript, silenceMs: 1500 }));

  act(() => result.current.start());
  act(() => FakeSpeechRecognition.instances[0].emit([{ transcript: "oi", isFinal: true }]));
  act(() => result.current.stop());

  expect(onFinalTranscript).toHaveBeenCalledWith("oi");
  expect(onSilenceTranscript).not.toHaveBeenCalled();
});
