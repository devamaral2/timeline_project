import type { SpeakerTurn } from "../types";
import { isRecord, num, text } from "./json-guards";

/** Lê o JSON que `python/diarize.py` imprime: `[{ start, end, speaker }]`, em segundos. */
export function parseDiarization(stdout: string): SpeakerTurn[] {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error("o script de separação de falantes não devolveu uma lista");
  const list: unknown = JSON.parse(stdout.slice(start));
  if (!Array.isArray(list)) throw new Error("o script de separação de falantes não devolveu uma lista");
  return list.flatMap((turn): SpeakerTurn[] => {
    if (!isRecord(turn)) return [];
    const from = num(turn.start);
    const to = num(turn.end);
    const speaker = text(turn.speaker);
    return from === null || to === null || speaker === "" ? [] : [{ startSeconds: from, endSeconds: to, speaker }];
  });
}
