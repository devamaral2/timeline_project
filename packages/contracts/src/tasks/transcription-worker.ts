/**
 * O contrato do serviço local de transcrição com a API (spec #39). Três
 * operações, todas sob `/api/transcription-worker/*` e autenticadas pela chave
 * de dispositivo: reservar o próximo pedido, renovar o lease com o progresso e
 * entregar o resultado ou a falha. Quem as chama é `apps/transcriber`; quem
 * lê a entrega é a formatação com o Haiku.
 */

/** Em que etapa o serviço local está; vai no progresso que renova o lease. */
export type TranscriptionStage = "metadata" | "download" | "transcription" | "speakers" | "comments";

/** O motivo fechado de um pedido que não deu certo. Nunca a mensagem crua do `yt-dlp`. */
export type TranscriptionFailureCode = "too_large" | "private" | "unavailable" | "no_audio" | "failed";

/** `POST /api/transcription-worker/next`: o pedido reservado. A resposta é 204, sem corpo, quando a fila está vazia. */
export interface TranscriptionReservation {
  /** A tarefa de agente `save_content_with_transcription`. */
  requestId: string;
  /** O endereço canônico do vídeo (`https://www.youtube.com/watch?v=ID`). */
  url: string;
  /** A prova do lease: vai em toda renovação e na entrega. */
  leaseToken: string;
  /** Quando o lease vence se não for renovado (ISO 8601). */
  leaseExpiresAt: string;
}

/** `POST /api/transcription-worker/lease`: renova o lease e diz onde o serviço está. */
export interface TranscriptionLeaseInput {
  requestId: string;
  leaseToken: string;
  stage: TranscriptionStage;
  /** 0 a 100. */
  percent: number;
}

export interface TranscriptionLeaseResult {
  /** O novo vencimento (ISO 8601). */
  leaseExpiresAt: string;
}

export interface TranscriptionChapter {
  startSeconds: number;
  title: string;
}

export interface TranscriptionVideo {
  title: string;
  channel: string;
  durationSeconds: number;
  description: string;
  chapters: TranscriptionChapter[];
}

/** Uma fala: o rótulo do falante ("Falante 1") é o que a voz separou, não um nome. */
export interface TranscriptionSegment {
  startSeconds: number;
  endSeconds: number;
  speaker: string;
  text: string;
}

/** Um momento dos mais assistidos, já filtrado: sem o começo do vídeo e com os trechos vizinhos juntos. */
export interface TranscriptionHotMoment {
  startSeconds: number;
  endSeconds: number;
  /** 0 a 1. */
  score: number;
}

export interface TranscriptionComment {
  author: string;
  text: string;
  likes: number;
  /** ISO 8601. */
  publishedAt: string;
}

/** O que o serviço local colheu de um vídeo. */
export interface TranscriptionResult {
  video: TranscriptionVideo;
  /** De onde veio o texto: legenda feita por alguém, ou o Whisper. */
  source: "subtitles" | "whisper";
  segments: TranscriptionSegment[];
  hotMoments: TranscriptionHotMoment[];
  /** Os mais recentes, no máximo 50. */
  comments: TranscriptionComment[];
}

/** `POST /api/transcription-worker/deliver`: o resultado ou a falha do pedido. */
export type TranscriptionDeliveryInput =
  | { requestId: string; leaseToken: string; outcome: "completed"; result: TranscriptionResult }
  | { requestId: string; leaseToken: string; outcome: "failed"; code: TranscriptionFailureCode };

/**
 * Como a API ficou com o pedido: `running` (o resultado foi aceito e a formatação
 * começa) ou `failed`, com o código. Uma entrega acima do teto também volta
 * `failed` com `too_large`: o pedido está encerrado, o serviço não deve repeti-la.
 */
export type TranscriptionDeliveryResult =
  | { requestId: string; status: "running" }
  | { requestId: string; status: "failed"; code: TranscriptionFailureCode };
