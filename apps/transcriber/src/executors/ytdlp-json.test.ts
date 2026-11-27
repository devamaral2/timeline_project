import { describe, expect, it } from "vitest";
import { parseComments, parseMetadata } from "./ytdlp-json";

describe("metadados do yt-dlp", () => {
  const full = {
    id: "dQw4w9WgXcQ",
    title: "Um vídeo",
    channel: "Canal",
    duration: 612.4,
    description: "Links:\nhttps://exemplo.com",
    language: "pt",
    chapters: [
      { start_time: 0, end_time: 60, title: "Abertura" },
      { start_time: 60, end_time: 600, title: "Conversa" },
    ],
    subtitles: { pt: [{ ext: "vtt" }], en: [{ ext: "vtt" }], live_chat: [{ ext: "json" }] },
    automatic_captions: { pt: [{ ext: "vtt" }] },
    heatmap: [
      { start_time: 0, end_time: 6, value: 1 },
      { start_time: 6, end_time: 12, value: 0.4 },
    ],
    formats: [
      { vcodec: "avc1", acodec: "none", filesize: 900_000_000 },
      { vcodec: "none", acodec: "opus", abr: 50, filesize: 4_000_000 },
      { vcodec: "none", acodec: "opus", abr: 130, filesize_approx: 9_000_000 },
    ],
  };

  it("reduz o JSON ao que o serviço usa", () => {
    expect(parseMetadata(full)).toEqual({
      id: "dQw4w9WgXcQ",
      title: "Um vídeo",
      channel: "Canal",
      durationSeconds: 612.4,
      description: "Links:\nhttps://exemplo.com",
      chapters: [
        { startSeconds: 0, title: "Abertura" },
        { startSeconds: 60, title: "Conversa" },
      ],
      language: "pt",
      humanSubtitles: [{ language: "pt" }, { language: "en" }],
      heatmap: [
        { startSeconds: 0, endSeconds: 6, value: 1 },
        { startSeconds: 6, endSeconds: 12, value: 0.4 },
      ],
      audioBytesEstimate: 9_000_000,
    });
  });

  it("não usa a legenda automática e aceita um vídeo sem gráfico, capítulos nem formatos", () => {
    const parsed = parseMetadata({ id: "x", title: "t", uploader: "Fulano", duration: 10 });
    expect(parsed).toMatchObject({ channel: "Fulano", humanSubtitles: [], heatmap: [], chapters: [], audioBytesEstimate: null, language: null });
    expect(parsed.description).toBe("");
  });

  it("recusa um JSON que não é de vídeo", () => {
    expect(() => parseMetadata({ title: "sem id" })).toThrow();
    expect(() => parseMetadata("texto")).toThrow();
  });
});

describe("comentários do yt-dlp", () => {
  it("lê autor, texto, curtidas, data e se é resposta", () => {
    const parsed = parseComments({
      comments: [
        { author: "Ana", text: "ótimo", like_count: 3, timestamp: 1_764_115_200, parent: "root" },
        { author: "Bia", text: "concordo", like_count: null, parent: "UgxAbc" },
      ],
    });
    expect(parsed).toEqual([
      { author: "Ana", text: "ótimo", likes: 3, timestamp: 1_764_115_200, isReply: false },
      { author: "Bia", text: "concordo", likes: 0, timestamp: null, isReply: true },
    ]);
  });

  it("vídeo com comentários desligados não tem lista, e isso não é erro", () => {
    expect(parseComments({ id: "x" })).toEqual([]);
    expect(parseComments({ comments: null })).toEqual([]);
  });
});
