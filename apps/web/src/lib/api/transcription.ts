import type { TranscriptionRequestResult } from "@repo/contracts";
import { apiRequest } from "./client-request";

/** Rota que cada função desta área chama, no formato do catálogo da API. `route-coverage.test.ts` confere. */
export const transcriptionRoutes = {
  requestTranscription: "POST /api/tasks/transcription-requests",
} as const;

/**
 * Pede a transcrição de um vídeo do YouTube (spec #39). O pedido nasce na hora e o artefato do vídeo entra na
 * Leitura diária do dia. Link que não é de vídeo do YouTube responde 400 (`invalid_input`). O mesmo vídeo ainda
 * esperando no dia devolve o pedido que existe, com `created: false`.
 */
export function requestTranscription(url: string): Promise<TranscriptionRequestResult> {
  return apiRequest<TranscriptionRequestResult>("POST", "/api/tasks/transcription-requests", { body: { url } });
}
