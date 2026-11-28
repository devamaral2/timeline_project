import { expect, test } from "vitest";
import { youtubeSaveOf } from "./youtube-save";

const ID = "dQw4w9WgXcQ";
const canonical = `https://www.youtube.com/watch?v=${ID}`;

test.each([
  ["a bare link", "text", `https://youtu.be/${ID}`],
  ["a link with a line around it", "text", `Guardar para ver depois: https://www.youtube.com/watch?v=${ID}&t=42s.`],
  ["a markdown link", undefined, `[O vídeo](https://m.youtube.com/watch?v=${ID})`],
  ["a source line and a summary a model wrote", "youtube_transcript", `Fonte: [YouTube](https://youtu.be/${ID})\n\n## Resumo\n${"texto ".repeat(200)}`],
  ["the same video twice", "text", `https://youtu.be/${ID}\nhttps://www.youtube.com/shorts/${ID}`],
])("%s is a video to transcribe", (_, type, body) => {
  expect(youtubeSaveOf(type, body)).toEqual({ url: canonical });
});

test.each([
  ["a note that only mentions a video", "text", `${"Uma nota de verdade sobre o treino. ".repeat(12)}\nhttps://youtu.be/${ID}`],
  ["two videos", "text", `https://youtu.be/${ID} e https://youtu.be/aqz-KE-bpKQ`],
  ["a channel", "text", "https://www.youtube.com/@canal"],
  ["the transcript the app already built", "text", `Fonte: [YouTube](${canonical})\n\n## Transcrição\n{#t-0} [00:00](https://youtu.be/${ID}?t=0) **Ana:** Oi.`],
  ["a transcript with marks", "youtube_transcript", `Fonte: [YouTube](${canonical})\n\n{#t-3} fala`],
  ["a news round-up", "news", `## Cultura\n### Um vídeo\nhttps://youtu.be/${ID}`],
  ["a non-text body", "text", { body: 1 }],
])("%s stays as it is", (_, type, body) => {
  expect(youtubeSaveOf(type, body)).toBeNull();
});
