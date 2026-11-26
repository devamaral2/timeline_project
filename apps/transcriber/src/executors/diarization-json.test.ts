import { describe, expect, it } from "vitest";
import { parseDiarization } from "./diarization-json";

describe("saída do script do pyannote", () => {
  it("lê os turnos com início, fim e rótulo", () => {
    expect(parseDiarization(JSON.stringify([{ start: 0.5, end: 4, speaker: "SPEAKER_00" }, { start: 4, end: 9.25, speaker: "SPEAKER_01" }]))).toEqual([
      { startSeconds: 0.5, endSeconds: 4, speaker: "SPEAKER_00" },
      { startSeconds: 4, endSeconds: 9.25, speaker: "SPEAKER_01" },
    ]);
  });

  it("aceita lixo antes da lista, como os avisos que bibliotecas imprimem", () => {
    expect(parseDiarization('aviso qualquer\n[{"start":0,"end":1,"speaker":"A"}]')).toHaveLength(1);
  });

  it("recusa o que não é uma lista de turnos", () => {
    expect(() => parseDiarization("{}")).toThrow();
    expect(() => parseDiarization("nada")).toThrow();
  });
});
