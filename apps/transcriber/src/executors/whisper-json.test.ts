import { describe, expect, it } from "vitest";
import { parseWhisperJson } from "./whisper-json";

describe("saída do whisper.cpp", () => {
  it("converte os deslocamentos em milissegundos para segundos e apara o texto", () => {
    const json = { transcription: [{ offsets: { from: 0, to: 3400 }, text: " Olá a todos." }, { offsets: { from: 3400, to: 6000 }, text: " Vamos lá." }] };
    expect(parseWhisperJson(json)).toEqual([
      { startSeconds: 0, endSeconds: 3.4, text: "Olá a todos." },
      { startSeconds: 3.4, endSeconds: 6, text: "Vamos lá." },
    ]);
  });

  it("descarta as marcas de som que o Whisper inventa, como [MÚSICA]", () => {
    const json = { transcription: [{ offsets: { from: 0, to: 1000 }, text: " [MÚSICA]" }, { offsets: { from: 1000, to: 2000 }, text: " (aplausos)" }, { offsets: { from: 2000, to: 3000 }, text: " Falou." }] };
    expect(parseWhisperJson(json).map((item) => item.text)).toEqual(["Falou."]);
  });

  it("recusa uma saída que não é a esperada", () => {
    expect(() => parseWhisperJson({ result: [] })).toThrow();
    expect(() => parseWhisperJson(null)).toThrow();
  });
});
