import type { SubtitleTrack, VideoMetadata } from "../types";

export type TextSource =
  /** A legenda feita por alguém, no idioma `language` (o código da legenda). */
  | { kind: "subtitles"; language: string }
  /** O Whisper; `language` é o idioma do vídeo, ou `null` para ele detectar. */
  | { kind: "whisper"; language: string | null };

const base = (code: string) => code.toLowerCase().split(/[-_]/)[0] ?? "";

/**
 * A legenda feita por alguém é mais fiel que a transcrição, então vale quando existe no idioma do vídeo. A legenda
 * automática do YouTube nunca é usada (ela nem chega aqui). Sem idioma conhecido não dá para saber se a legenda é do
 * que se fala ou uma tradução, então o Whisper decide.
 */
export function chooseTextSource(video: Pick<VideoMetadata, "language" | "humanSubtitles">): TextSource {
  const { language } = video;
  if (!language) return { kind: "whisper", language: null };

  const candidates = video.humanSubtitles.filter((track) => track.language !== "live_chat");
  const exact = candidates.find((track) => track.language.toLowerCase() === language.toLowerCase());
  const sameBase = candidates.find((track: SubtitleTrack) => base(track.language) === base(language));
  const chosen = exact ?? sameBase;
  return chosen ? { kind: "subtitles", language: chosen.language } : { kind: "whisper", language };
}
