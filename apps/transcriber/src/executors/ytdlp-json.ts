import type { HeatmapBin, RawComment, SubtitleTrack, VideoMetadata } from "../types";

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function chaptersOf(value: unknown): VideoMetadata["chapters"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((chapter) => {
    if (!isRecord(chapter)) return [];
    const start = num(chapter.start_time);
    return start === null ? [] : [{ startSeconds: start, title: text(chapter.title) }];
  });
}

function heatmapOf(value: unknown): HeatmapBin[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((bin) => {
    if (!isRecord(bin)) return [];
    const start = num(bin.start_time);
    const end = num(bin.end_time);
    const score = num(bin.value);
    return start === null || end === null || score === null ? [] : [{ startSeconds: start, endSeconds: end, value: score }];
  });
}

/** Só `subtitles`, que o yt-dlp reserva para as legendas feitas por alguém; `automatic_captions` é de propósito ignorado. */
function humanSubtitlesOf(value: unknown): SubtitleTrack[] {
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .filter((language) => language !== "live_chat")
    .map((language) => ({ language }));
}

/** O tamanho do melhor áudio (maior taxa de bits entre os formatos só de áudio), quando o YouTube o informa. */
function audioBytesOf(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const audio = value
    .filter(isRecord)
    .filter((format) => format.vcodec === "none" && format.acodec !== "none")
    .sort((a, b) => (num(b.abr) ?? 0) - (num(a.abr) ?? 0));
  const best = audio[0];
  return best ? (num(best.filesize) ?? num(best.filesize_approx)) : null;
}

/** Reduz a saída de `yt-dlp -j` aos campos que o serviço usa. */
export function parseMetadata(json: unknown): VideoMetadata {
  if (!isRecord(json) || typeof json.id !== "string" || json.id.length === 0) {
    throw new Error("a resposta do yt-dlp não descreve um vídeo");
  }
  return {
    id: json.id,
    title: text(json.title),
    channel: text(json.channel) || text(json.uploader),
    durationSeconds: num(json.duration) ?? 0,
    description: text(json.description),
    chapters: chaptersOf(json.chapters),
    language: text(json.language) || null,
    humanSubtitles: humanSubtitlesOf(json.subtitles),
    heatmap: heatmapOf(json.heatmap),
    audioBytesEstimate: audioBytesOf(json.formats),
  };
}

/** Os comentários de `yt-dlp -j --write-comments`. Sem lista (comentários desligados), vazio. */
export function parseComments(json: unknown): RawComment[] {
  if (!isRecord(json) || !Array.isArray(json.comments)) return [];
  return json.comments.flatMap((comment) => {
    if (!isRecord(comment)) return [];
    const parent = text(comment.parent);
    return [
      {
        author: text(comment.author),
        text: text(comment.text),
        likes: num(comment.like_count) ?? 0,
        timestamp: num(comment.timestamp),
        isReply: parent !== "" && parent !== "root",
      },
    ];
  });
}
