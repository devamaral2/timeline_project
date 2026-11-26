import { describe, expect, it } from "vitest";
import type { HeatmapBin } from "../types";
import { pickHotMoments } from "./hot-moments";

/** Cem trechos de 10 s num vídeo de 1000 s, com o valor dado por `valueAt`. */
function heatmap(valueAt: (index: number) => number): HeatmapBin[] {
  return Array.from({ length: 100 }, (_, index) => ({
    startSeconds: index * 10,
    endSeconds: (index + 1) * 10,
    value: valueAt(index),
  }));
}

describe("momentos mais assistidos", () => {
  it("descarta os primeiros 5% da duração, onde todo mundo começa", () => {
    const bins = heatmap((index) => (index < 5 ? 1 : 0.1));
    expect(pickHotMoments(bins, 1000)).toEqual([]);
  });

  it("junta trechos vizinhos acima do limiar num momento só, com a maior nota", () => {
    const bins = heatmap((index) => ({ 40: 0.7, 41: 0.9, 42: 0.65 })[index] ?? 0.1);
    expect(pickHotMoments(bins, 1000)).toEqual([{ startSeconds: 400, endSeconds: 430, score: 0.9 }]);
  });

  it("separa os trechos que não são vizinhos", () => {
    const bins = heatmap((index) => ({ 20: 0.8, 60: 0.7 })[index] ?? 0.1);
    expect(pickHotMoments(bins, 1000)).toEqual([
      { startSeconds: 200, endSeconds: 210, score: 0.8 },
      { startSeconds: 600, endSeconds: 610, score: 0.7 },
    ]);
  });

  it("fica com os 3 de maior nota e os devolve em ordem de tempo", () => {
    const bins = heatmap((index) => ({ 10: 0.65, 30: 0.95, 50: 0.7, 70: 0.9 })[index] ?? 0.1);
    expect(pickHotMoments(bins, 1000).map((moment) => moment.startSeconds)).toEqual([300, 500, 700]);
  });

  it("não devolve nada abaixo do limiar", () => {
    expect(pickHotMoments(
      heatmap(() => 0.3),
      1000,
    )).toEqual([]);
  });

  it("vídeo sem o gráfico não tem momentos, e não dá erro", () => {
    expect(pickHotMoments([], 1000)).toEqual([]);
  });
});
