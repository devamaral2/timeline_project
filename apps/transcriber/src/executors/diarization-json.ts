import type { SpeakerTurn } from "../types";

/** Lê o JSON que `python/diarize.py` imprime: `[{ start, end, speaker }]`, em segundos. */
export function parseDiarization(stdout: string): SpeakerTurn[] {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error("o script de separação de falantes não devolveu uma lista");
  const list: unknown = JSON.parse(stdout.slice(start));
  if (!Array.isArray(list)) throw new Error("o script de separação de falantes não devolveu uma lista");
  return list.flatMap((turn: { start?: unknown; end?: unknown; speaker?: unknown }) =>
    typeof turn?.start === "number" && typeof turn.end === "number" && typeof turn.speaker === "string"
      ? [{ startSeconds: turn.start, endSeconds: turn.end, speaker: turn.speaker }]
      : [],
  );
}
