import type { TranscriptionRequestData } from "./transcription-requests";
import { composeReadingArticle, type ReadingArticle } from "../tasks/daily-reading-article";

/** O nome do documento até a formatação conhecer o título real do vídeo. */
export const provisionalVideoTitle = (videoId: string): string => `Vídeo do YouTube (${videoId})`;

/**
 * O documento de um vídeo na Leitura diária: a linha da fonte ("Fonte: [YouTube](endereço)") e o texto. Sem `title`,
 * o nome é o provisório. `null` quando o endereço não é `http(s)`.
 */
export function composeVideoArticle(
  video: { url: string; videoId: string },
  markdown: string,
  extra: { title?: string; byline?: string } = {},
): ReadingArticle | null {
  return composeReadingArticle({
    url: video.url,
    title: extra.title?.trim() || provisionalVideoTitle(video.videoId),
    markdown,
    siteName: "YouTube",
    ...(extra.byline ? { byline: extra.byline } : {}),
  });
}

/** O documento do vídeo de um pedido já gravado: o endereço dele é sempre o canônico, então `null` é um erro. */
export function composeRequestArticle(
  data: Pick<TranscriptionRequestData, "url" | "videoId">,
  markdown: string,
  extra: { title?: string; byline?: string } = {},
): ReadingArticle {
  const article = composeVideoArticle(data, markdown, extra);
  if (!article) throw new Error("O endereço do pedido de transcrição deixou de ser um endereço");
  return article;
}
