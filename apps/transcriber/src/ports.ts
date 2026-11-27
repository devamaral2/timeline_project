import type {
  TranscriptionDeliveryInput,
  TranscriptionDeliveryResult,
  TranscriptionLeaseInput,
  TranscriptionLeaseResult,
  TranscriptionReservation,
} from "@repo/contracts";
import type { RawComment, SpeakerTurn, TimedText, VideoMetadata } from "./types";

/**
 * As três ferramentas externas ficam atrás destas portas: o serviço só conhece o que elas devolvem. As reais
 * (`executors/`) rodam `yt-dlp`, `whisper-cli` e `pyannote`; os testes usam executores falsos.
 */
export interface YtDlp {
  /** Atualiza o próprio `yt-dlp`; o YouTube muda com frequência. */
  update(signal: AbortSignal): Promise<void>;
  metadata(url: string, signal: AbortSignal): Promise<VideoMetadata>;
  /** Baixa só o áudio para `dir/<videoId>.<ext>`. Passando de `maxBytes`, lança `RequestFailure("too_large")`. */
  downloadAudio(input: { url: string; videoId: string; dir: string; maxBytes: number }, signal: AbortSignal): Promise<AudioFile>;
  /** O texto WebVTT da legenda feita por alguém no idioma `language`. */
  downloadSubtitles(input: { url: string; language: string }, signal: AbortSignal): Promise<string>;
  /** Os comentários mais recentes (a quantidade que o yt-dlp devolver; quem filtra é o serviço). */
  comments(url: string, signal: AbortSignal): Promise<RawComment[]>;
}

export interface Whisper {
  /** `language` é o do vídeo, ou `null` para o Whisper detectar. */
  transcribe(audio: AudioFile, language: string | null, signal: AbortSignal): Promise<TimedText[]>;
}

export interface Diarizer {
  diarize(audio: AudioFile, signal: AbortSignal): Promise<SpeakerTurn[]>;
}

export interface AudioFile {
  path: string;
  bytes: number;
}

/** O áudio baixado, guardado pelo id do vídeo. */
export interface AudioStore {
  readonly dir: string;
  find(videoId: string): Promise<AudioFile | null>;
}

/** As três operações do serviço local na API (`/api/transcription-worker/*`). */
export interface WorkerApi {
  /** `null` quando a fila está vazia (204). */
  next(): Promise<TranscriptionReservation | null>;
  renew(input: TranscriptionLeaseInput): Promise<TranscriptionLeaseResult>;
  deliver(input: TranscriptionDeliveryInput): Promise<TranscriptionDeliveryResult>;
}

/** O lease não é mais nosso (venceu, ou o pedido foi cancelado): a API devolveu 409. O pedido já voltou à fila. */
export class LeaseLostError extends Error {
  constructor() {
    super("o lease do pedido foi perdido");
    this.name = "LeaseLostError";
  }
}

/** A API recusou o corpo da entrega por tamanho (413 do gateway). */
export class DeliveryTooLargeError extends Error {
  constructor() {
    super("a entrega passou do tamanho que o gateway aceita");
    this.name = "DeliveryTooLargeError";
  }
}

/** A chave foi recusada (401/403): revogada, errada ou sem a permissão. Repetir não adianta. */
export class WorkerAuthError extends Error {
  constructor(readonly status: number) {
    super(`a API recusou a chave de dispositivo (HTTP ${status})`);
    this.name = "WorkerAuthError";
  }
}

/** O trabalho foi interrompido de fora (desligamento, lease perdido): o pedido volta à fila sozinho. */
export class AbortedError extends Error {
  constructor() {
    super("trabalho interrompido");
    this.name = "AbortedError";
  }
}
