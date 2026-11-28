import { expect, test } from "vitest";
import { soleYouTubeVideoLink, youtubeEmbedUrl, youtubeVideoOf } from "./youtube";

test("lê o id nas formas de endereço de vídeo do YouTube", () => {
  const id = "dQw4w9WgXcQ";
  for (const href of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?si=abc`,
    `http://www.youtube.com/watch?v=${id}`,
  ]) {
    expect(youtubeVideoOf(href), href).toEqual({ id });
  }
});

test("lê de onde o vídeo começa", () => {
  expect(youtubeVideoOf("https://youtu.be/dQw4w9WgXcQ?t=90")).toEqual({ id: "dQw4w9WgXcQ", startSeconds: 90 });
  expect(youtubeVideoOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")?.startSeconds).toBe(90);
  expect(youtubeVideoOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s")?.startSeconds).toBe(3723);
  expect(youtubeVideoOf("https://www.youtube.com/embed/dQw4w9WgXcQ?start=45")?.startSeconds).toBe(45);
  expect(youtubeVideoOf("https://youtu.be/dQw4w9WgXcQ?t=agora")).toEqual({ id: "dQw4w9WgXcQ" });
});

test("o que não é vídeo do YouTube não vira player", () => {
  for (const href of [
    "https://www.youtube.com/@canal",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/watch?v=curto",
    "https://www.youtube.com/results?search_query=dQw4w9WgXcQ",
    "https://youtube.com.evil.dev/watch?v=dQw4w9WgXcQ",
    "https://exemplo.dev/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "youtu.be/dQw4w9WgXcQ",
    "",
  ]) {
    expect(youtubeVideoOf(href), href).toBeNull();
  }
});

test("o player usa o domínio sem cookies e respeita o início", () => {
  expect(youtubeEmbedUrl({ id: "dQw4w9WgXcQ" })).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  expect(youtubeEmbedUrl({ id: "dQw4w9WgXcQ", startSeconds: 90 })).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?start=90");
});

test("a mensagem que é só um link de vídeo devolve o endereço; texto em volta, outro site ou canal não", () => {
  expect(soleYouTubeVideoLink("https://youtu.be/dQw4w9WgXcQ")).toBe("https://youtu.be/dQw4w9WgXcQ");
  expect(soleYouTubeVideoLink("  https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90 \n")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
  for (const text of [
    "olha isso https://youtu.be/dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ resuma",
    "https://youtu.be/dQw4w9WgXcQ https://youtu.be/9bZkp7q19f0",
    "https://www.youtube.com/@canal",
    "https://exemplo.dev/watch?v=dQw4w9WgXcQ",
    "",
  ]) {
    expect(soleYouTubeVideoLink(text), text).toBeNull();
  }
});
