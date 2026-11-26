import { describe, expect, it } from "vitest";
import type { RawComment } from "../types";
import { latestComments } from "./comments";

const comment = (text: string, timestamp: number | null, extra: Partial<RawComment> = {}): RawComment => ({
  author: "autor",
  text,
  likes: 0,
  timestamp,
  isReply: false,
  ...extra,
});

describe("os 50 comentários mais recentes", () => {
  it("fica com os 50 mais recentes, do mais novo para o mais antigo", () => {
    const raw = Array.from({ length: 80 }, (_, index) => comment(`c${index}`, 1_000 + index));
    const result = latestComments(raw, new Date("2026-11-26T00:00:00Z"));
    expect(result).toHaveLength(50);
    expect(result[0]?.text).toBe("c79");
    expect(result.at(-1)?.text).toBe("c30");
  });

  it("ignora as respostas e os comentários vazios", () => {
    const raw = [comment("resposta", 5, { isReply: true }), comment("   ", 4), comment("ok", 3)];
    expect(latestComments(raw, new Date(0)).map((item) => item.text)).toEqual(["ok"]);
  });

  it("converte para o contrato: data ISO e curtidas inteiras", () => {
    const [first] = latestComments([comment("oi", 1_764_115_200, { author: "Ana", likes: 7 })], new Date(0));
    expect(first).toEqual({ author: "Ana", text: "oi", likes: 7, publishedAt: "2025-11-26T00:00:00.000Z" });
  });

  it("mantém a ordem do yt-dlp, que já vem do mais novo, quando as datas faltam ou empatam", () => {
    const raw = [comment("a", null), comment("b", null), comment("c", null)];
    const now = new Date("2026-11-26T12:00:00Z");
    const result = latestComments(raw, now);
    expect(result.map((item) => item.text)).toEqual(["a", "b", "c"]);
    expect(result[0]?.publishedAt).toBe(now.toISOString());
  });

  it("não devolve curtidas negativas nem fracionadas", () => {
    expect(latestComments([comment("x", 1, { likes: -3 }), comment("y", 2, { likes: 4.7 })], new Date(0)).map((item) => item.likes)).toEqual([4, 0]);
  });

  it("sem comentários, a lista é vazia", () => {
    expect(latestComments([], new Date(0))).toEqual([]);
  });
});
