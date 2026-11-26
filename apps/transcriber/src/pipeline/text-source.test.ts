import { describe, expect, it } from "vitest";
import { chooseTextSource } from "./text-source";

const track = (language: string) => ({ language });

describe("escolha entre a legenda de alguém e o Whisper", () => {
  it("usa a legenda feita por alguém no idioma do vídeo", () => {
    expect(chooseTextSource({ language: "pt", humanSubtitles: [track("en"), track("pt")] })).toEqual({
      kind: "subtitles",
      language: "pt",
    });
  });

  it("casa a variante regional com o idioma base, nos dois sentidos", () => {
    expect(chooseTextSource({ language: "pt", humanSubtitles: [track("pt-BR")] })).toEqual({
      kind: "subtitles",
      language: "pt-BR",
    });
    expect(chooseTextSource({ language: "pt-BR", humanSubtitles: [track("pt")] })).toEqual({
      kind: "subtitles",
      language: "pt",
    });
  });

  it("prefere a variante exata quando há as duas", () => {
    expect(chooseTextSource({ language: "pt-BR", humanSubtitles: [track("pt"), track("pt-BR")] })).toEqual({
      kind: "subtitles",
      language: "pt-BR",
    });
  });

  it("usa o Whisper quando as legendas são só de outro idioma", () => {
    expect(chooseTextSource({ language: "pt", humanSubtitles: [track("en")] })).toEqual({ kind: "whisper", language: "pt" });
  });

  it("usa o Whisper quando não há legenda feita por alguém", () => {
    expect(chooseTextSource({ language: "en", humanSubtitles: [] })).toEqual({ kind: "whisper", language: "en" });
  });

  it("usa o Whisper, que detecta o idioma, quando o idioma do vídeo é desconhecido", () => {
    expect(chooseTextSource({ language: null, humanSubtitles: [track("en")] })).toEqual({ kind: "whisper", language: null });
  });

  it("ignora o chat ao vivo, que não é legenda", () => {
    expect(chooseTextSource({ language: "pt", humanSubtitles: [track("live_chat")] }).kind).toBe("whisper");
  });
});
