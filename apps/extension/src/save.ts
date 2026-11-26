import type { DailyReadingResult, TranscriptionRequestResult } from "@repo/contracts";
import { requestTranscription, saveReading } from "./api";
import type { CapturedPage } from "./capture/page";
import type { YouTubeLink } from "./capture/youtube";

type Fetch = typeof fetch;

/** O que o clique guardou: o pedido de transcrição de um vídeo ou o texto de uma página. */
export type Saved =
  | { kind: "transcription"; result: TranscriptionRequestResult }
  | { kind: "page"; page: CapturedPage; result: DailyReadingResult };

/** O tipo do conteúdo que o clique guarda: `transcription` numa aba de vídeo, `page` em qualquer outra. */
export type ContentKind = Saved["kind"];

/**
 * Faz o que o clique pede. Numa aba de vídeo do YouTube (`video`, lido do endereço da aba por quem chama, uma vez só)
 * pede a transcrição, sem ler a página nem perguntar nada; em qualquer outra, lê a página (`capture`) e a guarda na
 * Leitura diária.
 */
export async function saveFromTab(baseUrl: string, video: YouTubeLink | null, capture: () => Promise<CapturedPage>, fetchImpl: Fetch = fetch): Promise<Saved> {
  if (video) return { kind: "transcription", result: await requestTranscription(baseUrl, video.canonical, fetchImpl) };
  const page = await capture();
  return { kind: "page", page, result: await saveReading(baseUrl, page, fetchImpl) };
}
