import type { DailyReadingResult, TranscriptionRequestResult } from "@repo/contracts";
import { requestTranscription, saveReading } from "./api";
import type { CapturedPage } from "./capture/page";
import { youtubeLinkOf } from "./capture/youtube";

type Fetch = typeof fetch;

/** O que o clique guardou: o pedido de transcrição de um vídeo ou o texto de uma página. */
export type Saved =
  | { kind: "transcription"; result: TranscriptionRequestResult }
  | { kind: "page"; page: CapturedPage; result: DailyReadingResult };

/**
 * Decide o que o clique faz pelo endereço da aba. Numa aba de vídeo do YouTube
 * pede a transcrição, sem ler a página nem perguntar nada; em qualquer outra,
 * lê a página (`capture`) e a guarda na Leitura diária.
 */
export async function saveFromTab(baseUrl: string, tabUrl: string | undefined, capture: () => Promise<CapturedPage>, fetchImpl: Fetch = fetch): Promise<Saved> {
  const video = tabUrl ? youtubeLinkOf(tabUrl) : null;
  if (video) return { kind: "transcription", result: await requestTranscription(baseUrl, video.canonical, fetchImpl) };
  const page = await capture();
  return { kind: "page", page, result: await saveReading(baseUrl, page, fetchImpl) };
}
