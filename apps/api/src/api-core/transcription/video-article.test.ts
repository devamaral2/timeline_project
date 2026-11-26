import { expect, test } from "vitest";
import { composeRequestArticle, composeVideoArticle, provisionalVideoTitle } from "./video-article";

const video = { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" };

test("o documento do vídeo tem o título provisório, a fonte YouTube e o texto", () => {
  expect(provisionalVideoTitle("dQw4w9WgXcQ")).toBe("Vídeo do YouTube (dQw4w9WgXcQ)");
  expect(composeVideoArticle(video, "Transcrição na fila")).toEqual({
    name: "Vídeo do YouTube (dQw4w9WgXcQ)",
    body: `Fonte: [YouTube](${video.url})\n\nTranscrição na fila\n`,
    sourceUrl: video.url,
  });
});

test("o título real e o canal entram quando vêm; título em branco volta ao provisório", () => {
  expect(composeRequestArticle(video, "Texto", { title: " Entrevista ", byline: "Canal" })).toMatchObject({
    name: "Entrevista",
    body: `Fonte: [YouTube](${video.url}) · Canal\n\nTexto\n`,
  });
  expect(composeRequestArticle(video, "Texto", { title: "  ", byline: "" }).name).toBe("Vídeo do YouTube (dQw4w9WgXcQ)");
});

test("endereço que não é http(s) não vira documento; no pedido gravado isso é um erro", () => {
  expect(composeVideoArticle({ url: "javascript:alert(1)", videoId: "dQw4w9WgXcQ" }, "x")).toBeNull();
  expect(() => composeRequestArticle({ url: "javascript:alert(1)", videoId: "dQw4w9WgXcQ" }, "x")).toThrow(/deixou de ser um endereço/);
});
