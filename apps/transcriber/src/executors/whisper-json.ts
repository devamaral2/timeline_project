import type { TimedText } from "../types";
import { isRecord, num, text } from "./json-guards";

/** Lê o JSON do `whisper-cli -oj`: uma lista `transcription` de `{ offsets: { from, to } (ms), text }`. */
export function parseWhisperJson(json: unknown): TimedText[] {
  const list = isRecord(json) ? json.transcription : undefined;
  if (!Array.isArray(list)) throw new Error("o whisper.cpp não devolveu uma transcrição");
  return list.flatMap((entry): TimedText[] => {
    if (!isRecord(entry)) return [];
    const offsets = isRecord(entry.offsets) ? entry.offsets : {};
    const from = num(offsets.from);
    const to = num(offsets.to);
    const spoken = text(entry.text).trim();
    if (from === null || to === null || !spoken) return [];
    // `[MÚSICA]`, `(aplausos)`: o Whisper anota sons; não é fala, e a transcrição guarda só o que foi dito.
    if (/^[[(].*[\])]$/.test(spoken)) return [];
    return [{ startSeconds: from / 1000, endSeconds: to / 1000, text: spoken }];
  });
}
