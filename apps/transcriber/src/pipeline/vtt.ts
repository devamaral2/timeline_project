import type { TimedText } from "../types";

const CUE_TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&lrm;": "", "&rlm;": "" };

function toSeconds(hours: string | undefined, minutes: string, seconds: string, millis: string | undefined): number {
  const fraction = millis ? Number(millis.padEnd(3, "0")) / 1000 : 0;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + fraction;
}

function clean(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|lrm|rlm|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/** Lê uma legenda WebVTT (a feita por alguém, baixada pelo yt-dlp) em falas com tempo. */
export function parseVtt(source: string): TimedText[] {
  const blocks = source.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const cues: TimedText[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeIndex = lines.findIndex((line) => CUE_TIME.test(line));
    if (timeIndex < 0 || timeIndex > 1) continue;
    const match = CUE_TIME.exec(lines[timeIndex] ?? "");
    if (!match) continue;
    const text = clean(lines.slice(timeIndex + 1).join(" "));
    if (!text) continue;
    cues.push({
      startSeconds: toSeconds(match[1], match[2] ?? "0", match[3] ?? "0", match[4]),
      endSeconds: toSeconds(match[5], match[6] ?? "0", match[7] ?? "0", match[8]),
      text,
    });
  }
  return cues;
}
