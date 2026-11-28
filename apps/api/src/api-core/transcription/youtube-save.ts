import { youtubeVideoLinkOf } from "@repo/contracts/youtube";

/** Quanto texto, além do link, um bilhete de "guardar este vídeo" ainda tem: passou disso, é uma nota de verdade. */
const NOTE_TEXT_MAX = 280;
const URL = /https?:\/\/[^\s<>()[\]]+/gi;
const ANCHOR_MARK = /^\s*\{#t-\d+\}/m;

/**
 * O vídeo que um artefato novo só guarda, ou `null` quando ele é outra coisa. Guardar um vídeo do YouTube, venha de
 * onde vier (Hermes pelo MCP, o agente do chat, a API), vira o pedido de transcrição: é o único caminho que monta o
 * documento das fichas por código, com o player e os trechos (`docs/summary-cards.md`).
 *
 * - `youtube_transcript` com o link de um vídeo e sem trecho marcado (`{#t-…}`): a transcrição que um modelo escreveria;
 * - `text` que é o link de um vídeo com, no máximo, uma linha de texto em volta ("Guardar para ver depois").
 *
 * Mais de um vídeo, um texto longo ou um documento que já tem trechos ficam como o que são.
 */
export function youtubeSaveOf(type: string | undefined, body: unknown): { url: string } | null {
  const kind = type ?? "text";
  if ((kind !== "text" && kind !== "youtube_transcript") || typeof body !== "string") return null;
  if (ANCHOR_MARK.test(body)) return null;
  const videos = new Map<string, string>();
  for (const [href] of body.matchAll(URL)) {
    const video = youtubeVideoLinkOf(href.replace(/[.,;:!?]+$/, ""));
    if (video) videos.set(video.id, video.canonical);
  }
  if (videos.size !== 1) return null;
  const [url] = [...videos.values()];
  if (!url) return null;
  if (kind === "youtube_transcript") return { url };
  const rest = body
    .replace(URL, "")
    .replace(/^\s*Fonte:\s*/im, "")
    .replace(/[[\]()<>*_#>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length <= NOTE_TEXT_MAX ? { url } : null;
}
