import type { TranscriptionHotMoment } from "@repo/contracts";
import type { HeatmapBin } from "../types";

/** A fração inicial do vídeo que não conta: o começo sempre é o pico, porque todo mundo começa por ali. */
export const IGNORED_LEADING_FRACTION = 0.05;
/** A nota (0 a 1) a partir da qual um trecho conta como muito assistido. */
export const HOT_THRESHOLD = 0.6;
export const MAX_HOT_MOMENTS = 3;

/**
 * Do gráfico de mais assistidos do YouTube, tira os picos: descarta o começo, junta os trechos vizinhos acima do
 * limiar (a nota do momento é a maior entre eles) e fica com os 3 de maior nota, em ordem de tempo. O gráfico não
 * é API oficial e some em vídeos com poucas visualizações; sem ele, a lista sai vazia.
 */
export function pickHotMoments(heatmap: HeatmapBin[], durationSeconds: number): TranscriptionHotMoment[] {
  const cutoff = durationSeconds * IGNORED_LEADING_FRACTION;
  const bins = heatmap.filter((bin) => bin.startSeconds >= cutoff && bin.value >= HOT_THRESHOLD);

  const moments: TranscriptionHotMoment[] = [];
  for (const bin of bins) {
    const last = moments.at(-1);
    if (last && bin.startSeconds <= last.endSeconds) {
      last.endSeconds = Math.max(last.endSeconds, bin.endSeconds);
      last.score = Math.max(last.score, bin.value);
    } else {
      moments.push({ startSeconds: bin.startSeconds, endSeconds: bin.endSeconds, score: bin.value });
    }
  }

  return moments
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HOT_MOMENTS)
    .sort((a, b) => a.startSeconds - b.startSeconds);
}
