import type { TranscriptionChapter, TranscriptionFailureCode } from "@repo/contracts";

/** Um trecho do gráfico de mais assistidos do YouTube: `value` vai de 0 a 1. */
export interface HeatmapBin {
  startSeconds: number;
  endSeconds: number;
  value: number;
}

/** Uma legenda que o yt-dlp listou para o vídeo (só as feitas por alguém entram aqui). */
export interface SubtitleTrack {
  /** O código de idioma como o YouTube o escreve: `pt`, `pt-BR`, `en`. */
  language: string;
}

/** Os metadados de um vídeo que o serviço usa; o resto do JSON do yt-dlp é descartado. */
export interface VideoMetadata {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number;
  description: string;
  chapters: TranscriptionChapter[];
  /** O idioma falado no vídeo, quando o YouTube o informa. */
  language: string | null;
  /** Só as legendas feitas por alguém. A legenda automática nunca entra. */
  humanSubtitles: SubtitleTrack[];
  heatmap: HeatmapBin[];
  /** O tamanho estimado do melhor áudio, em bytes, quando o YouTube o informa. */
  audioBytesEstimate: number | null;
}

/** Uma fala com tempo, antes de ter falante. */
export interface TimedText {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

/** Um trecho em que a voz de um falante foi ouvida (a saída do pyannote). */
export interface SpeakerTurn {
  startSeconds: number;
  endSeconds: number;
  /** O rótulo bruto do pyannote (`SPEAKER_00`). */
  speaker: string;
}

/** Um comentário como o yt-dlp o devolve, já reduzido ao que o serviço lê. */
export interface RawComment {
  author: string;
  text: string;
  likes: number;
  /** Segundos desde 1970; ausente quando o yt-dlp não soube a data. */
  timestamp: number | null;
  /** Respostas não entram: só os comentários de primeiro nível. */
  isReply: boolean;
}

/** Um pedido que o serviço decidiu encerrar com falha, com o código que a API entende. */
export class RequestFailure extends Error {
  constructor(
    readonly code: TranscriptionFailureCode,
    /** O motivo por extenso, só para o log; nunca vai à API. */
    detail: string,
  ) {
    super(detail);
    this.name = "RequestFailure";
  }
}
