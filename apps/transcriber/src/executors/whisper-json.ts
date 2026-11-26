import type { TimedText } from "../types";

/** Lê o JSON do `whisper-cli -oj`: uma lista `transcription` de `{ offsets: { from, to } (ms), text }`. */
export function parseWhisperJson(json: unknown): TimedText[] {
  const list = (json as { transcription?: unknown } | null)?.transcription;
  if (!Array.isArray(list)) throw new Error("o whisper.cpp não devolveu uma transcrição");
  return list.flatMap((entry: { offsets?: { from?: unknown; to?: unknown }; text?: unknown }) => {
    const from = entry?.offsets?.from;
    const to = entry?.offsets?.to;
    const spoken = typeof entry?.text === "string" ? entry.text.trim() : "";
    if (typeof from !== "number" || typeof to !== "number" || !spoken) return [];
    // `[MÚSICA]`, `(aplausos)`: o Whisper anota sons; não é fala, e a transcrição guarda só o que foi dito.
    if (/^[[(].*[\])]$/.test(spoken)) return [];
    return [{ startSeconds: from / 1000, endSeconds: to / 1000, text: spoken }];
  });
}
