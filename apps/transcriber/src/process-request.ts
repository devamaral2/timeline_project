import type { TranscriptionFailureCode, TranscriptionResult, TranscriptionStage } from "@repo/contracts";
import { latestComments } from "./pipeline/comments";
import { classifyFailure } from "./pipeline/failure";
import { pickHotMoments } from "./pipeline/hot-moments";
import { checkAudioSize, checkDuration } from "./pipeline/limits";
import { matchSpeakers } from "./pipeline/speakers";
import { chooseTextSource } from "./pipeline/text-source";
import { parseVtt } from "./pipeline/vtt";
import { errorMessage } from "./error-message";
import type { Logger } from "./logger";
import { AbortedError, type AudioFile, type AudioStore, type Diarizer, type Whisper, type YtDlp } from "./ports";
import { RequestFailure, type TimedText, type VideoMetadata } from "./types";

export interface Limits {
  maxDurationSeconds: number;
  maxAudioBytes: number;
}

export interface ProcessDeps {
  ytdlp: YtDlp;
  whisper: Whisper;
  diarizer: Diarizer;
  audio: AudioStore;
  log: Logger;
  limits: Limits;
  /** Anuncia a etapa que começa; o serviço a manda à API ao renovar o lease. */
  report(stage: TranscriptionStage, percent: number): Promise<void>;
  now(): Date;
}

export type ProcessOutcome =
  | { kind: "completed"; result: TranscriptionResult }
  /** O pedido não tem como dar certo; `detail` é só para o log. */
  | { kind: "failed"; code: TranscriptionFailureCode; detail: string }
  /** Interrompido de fora: nada se entrega, e o lease vencido devolve o pedido à fila. */
  | { kind: "abandoned" };

/** O motivo de recusa quando não sobra fala: nem legenda, nem Whisper, nem falantes com texto. */
const NO_SPEECH = "o vídeo não tem fala para transcrever";

/**
 * Espera um trabalho que pode falhar sem derrubar o pedido: se falhou por interrupção de fora, a interrupção segue
 * (`AbortedError`); do contrário, avisa no log e continua com a lista vazia.
 */
function orEmpty<T>(work: Promise<T[]>, deps: ProcessDeps, signal: AbortSignal, warning: string): Promise<T[]> {
  return work.catch((cause) => {
    if (signal.aborted) throw new AbortedError();
    deps.log.warn(`${warning}: ${errorMessage(cause)}`);
    return [];
  });
}

/** A porcentagem em que cada etapa começa. O Whisper é a etapa longa, então ocupa o meio. */
const STAGE_PERCENT: Record<TranscriptionStage, number> = { metadata: 0, download: 10, transcription: 25, speakers: 75, comments: 90 };

/**
 * Leva um pedido do endereço do vídeo ao resultado que a API espera: metadados, recusas, áudio, texto (legenda de
 * alguém ou Whisper), falantes, picos e comentários. Nunca lança: o que deu errado vira `failed` com um código
 * fechado, e a interrupção vira `abandoned`.
 */
export async function processRequest(url: string, deps: ProcessDeps, signal: AbortSignal): Promise<ProcessOutcome> {
  const step = async (stage: TranscriptionStage) => {
    if (signal.aborted) throw new AbortedError();
    await deps.report(stage, STAGE_PERCENT[stage]);
  };

  try {
    await step("metadata");
    deps.log.info("lendo os metadados");
    const meta = await deps.ytdlp.metadata(url, signal);
    deps.log.info(`"${meta.title}", ${Math.round(meta.durationSeconds)} s, canal ${meta.channel || "desconhecido"}`);
    throwIfRefused(checkDuration(meta.durationSeconds, deps.limits.maxDurationSeconds));
    throwIfRefused(checkAudioSize(meta.audioBytesEstimate, deps.limits.maxAudioBytes));

    await step("download");
    const audio = await obtainAudio(url, meta, deps, signal);

    await step("transcription");
    const { texts, source } = await obtainText(url, meta, audio, deps, signal);
    if (texts.length === 0) throw new RequestFailure("no_audio", NO_SPEECH);

    await step("speakers");
    const turns = await orEmpty(
      deps.diarizer.diarize(audio, signal), deps, signal, "não foi possível separar os falantes, tudo vai como Falante 1",
    );
    const segments = matchSpeakers(texts, turns);
    if (segments.length === 0) throw new RequestFailure("no_audio", NO_SPEECH);

    await step("comments");
    const comments = await orEmpty(deps.ytdlp.comments(url, signal), deps, signal, "sem os comentários");
    if (signal.aborted) throw new AbortedError();

    return {
      kind: "completed",
      result: {
        video: {
          title: meta.title,
          channel: meta.channel,
          durationSeconds: meta.durationSeconds,
          description: meta.description,
          chapters: meta.chapters,
        },
        source,
        segments,
        hotMoments: pickHotMoments(meta.heatmap, meta.durationSeconds),
        comments: latestComments(comments, deps.now()),
      },
    };
  } catch (cause) {
    if (signal.aborted || cause instanceof AbortedError) return { kind: "abandoned" };
    const failure = classifyFailure(cause);
    return { kind: "failed", code: failure.code, detail: failure.message };
  }
}

const throwIfRefused = (failure: RequestFailure | null) => {
  if (failure) throw failure;
};

async function obtainAudio(url: string, meta: VideoMetadata, deps: ProcessDeps, signal: AbortSignal): Promise<AudioFile> {
  const cached = await deps.audio.find(meta.id);
  const audio =
    cached ??
    (await deps.ytdlp.downloadAudio({ url, videoId: meta.id, dir: deps.audio.dir, maxBytes: deps.limits.maxAudioBytes }, signal));
  deps.log.info(cached ? "áudio já estava no cache" : `áudio baixado (${audio.bytes} bytes)`);
  throwIfRefused(checkAudioSize(audio.bytes, deps.limits.maxAudioBytes));
  return audio;
}

async function obtainText(
  url: string,
  meta: VideoMetadata,
  audio: AudioFile,
  deps: ProcessDeps,
  signal: AbortSignal,
): Promise<{ texts: TimedText[]; source: TranscriptionResult["source"] }> {
  const choice = chooseTextSource(meta);
  if (choice.kind === "subtitles") {
    deps.log.info(`usando a legenda feita por alguém (${choice.language})`);
    const texts = await orEmpty(
      deps.ytdlp.downloadSubtitles({ url, language: choice.language }, signal).then(parseVtt),
      deps, signal, "legenda inutilizável, vai para o Whisper",
    );
    if (texts.length > 0) return { texts, source: "subtitles" };
    deps.log.warn("a legenda não trouxe falas, vai para o Whisper");
  }
  deps.log.info("transcrevendo com o Whisper");
  const language = choice.kind === "whisper" ? choice.language : meta.language;
  return { texts: await deps.whisper.transcribe(audio, language, signal), source: "whisper" };
}
