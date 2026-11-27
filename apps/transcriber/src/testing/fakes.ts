import type { AudioFile, AudioStore, Diarizer, WorkerApi, Whisper, YtDlp } from "../ports";
import { type RawComment, RequestFailure, type SpeakerTurn, type TimedText, type VideoMetadata } from "../types";

export const VIDEO_URL = "https://www.youtube.com/watch?v=abc123";

export function video(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    id: "abc123",
    title: "Conversa sobre café",
    channel: "Canal do Café",
    durationSeconds: 1000,
    description: "Descrição do vídeo",
    chapters: [{ startSeconds: 0, title: "Abertura" }],
    language: "pt",
    humanSubtitles: [],
    heatmap: [],
    audioBytesEstimate: null,
    ...overrides,
  };
}

export const SUBTITLES_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Bem-vindos ao programa.

00:00:05.000 --> 00:00:09.000
Hoje falamos de café.
`;

/** Um `yt-dlp` falso: cada método grava a chamada e devolve o que o teste configurou. */
export class FakeYtDlp implements YtDlp {
  calls: string[] = [];
  meta: VideoMetadata | Error = video();
  vtt: string | Error = SUBTITLES_VTT;
  audio: AudioFile | Error = { path: "/cache/abc123.webm", bytes: 10_000_000 };
  commentList: RawComment[] | Error = [];
  updateError: Error | null = null;

  async update() {
    this.calls.push("update");
    if (this.updateError) throw this.updateError;
  }
  async metadata() {
    this.calls.push("metadata");
    if (this.meta instanceof Error) throw this.meta;
    return this.meta;
  }
  async downloadAudio() {
    this.calls.push("downloadAudio");
    if (this.audio instanceof Error) throw this.audio;
    return this.audio;
  }
  async downloadSubtitles() {
    this.calls.push("downloadSubtitles");
    if (this.vtt instanceof Error) throw this.vtt;
    return this.vtt;
  }
  async comments() {
    this.calls.push("comments");
    if (this.commentList instanceof Error) throw this.commentList;
    return this.commentList;
  }
}

export class FakeWhisper implements Whisper {
  calls: { language: string | null }[] = [];
  texts: TimedText[] | Error = [
    { startSeconds: 0, endSeconds: 5, text: "Olá, bem-vindos." },
    { startSeconds: 5, endSeconds: 10, text: "Vamos falar de café." },
  ];
  async transcribe(_audio: AudioFile, language: string | null) {
    this.calls.push({ language });
    if (this.texts instanceof Error) throw this.texts;
    return this.texts;
  }
}

export class FakeDiarizer implements Diarizer {
  calls = 0;
  turns: SpeakerTurn[] | Error = [{ startSeconds: 0, endSeconds: 10, speaker: "SPEAKER_00" }];
  async diarize() {
    this.calls += 1;
    if (this.turns instanceof Error) throw this.turns;
    return this.turns;
  }
}

export class FakeAudioStore implements AudioStore {
  readonly dir = "/cache";
  cached = new Map<string, AudioFile>();
  async find(videoId: string) {
    return this.cached.get(videoId) ?? null;
  }
}

/** A API falsa: uma fila de reservas, e tudo o que o serviço mandou fica gravado. */
export class FakeWorkerApi implements WorkerApi {
  queue: import("@repo/contracts").TranscriptionReservation[] = [];
  renewals: import("@repo/contracts").TranscriptionLeaseInput[] = [];
  deliveries: import("@repo/contracts").TranscriptionDeliveryInput[] = [];
  nextError: Error | null = null;
  renewError: Error | null = null;
  /** Um erro por tentativa de entrega, na ordem; sem erro, a entrega vale. */
  deliverErrors: (Error | null)[] = [];

  async next() {
    if (this.nextError) throw this.nextError;
    return this.queue.shift() ?? null;
  }
  async renew(input: import("@repo/contracts").TranscriptionLeaseInput) {
    this.renewals.push(input);
    if (this.renewError) throw this.renewError;
    return { leaseExpiresAt: "2026-11-26T12:05:00.000Z" };
  }
  async deliver(input: import("@repo/contracts").TranscriptionDeliveryInput) {
    const error = this.deliverErrors.shift();
    if (error) throw error;
    this.deliveries.push(input);
    return input.outcome === "completed"
      ? ({ requestId: input.requestId, status: "running" } as const)
      : ({ requestId: input.requestId, status: "failed", code: input.code } as const);
  }
}

export function reservation(requestId = "req-1") {
  return { requestId, url: VIDEO_URL, leaseToken: "lease-1", leaseExpiresAt: "2026-11-26T12:05:00.000Z" };
}

export { RequestFailure };
