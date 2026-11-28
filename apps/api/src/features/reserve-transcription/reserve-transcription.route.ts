import type { TranscriptionReservation } from "@repo/contracts";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";

export const reserveTranscriptionOperation = {
  method: "POST",
  path: "/api/transcription-worker/next",
  status: 200,
  // A fila limpa responde 204 sem corpo, como na linha de base.
  statusWhenEmpty: 204,
  authentication: "transcription-device-key",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/transcription-worker/next`: o servico local de transcricao
 * (`apps/transcriber`) reserva o proximo pedido; 204 sem corpo quando a fila
 * esta vazia. O gateway so abre esse prefixo para a chave de dispositivo, e a
 * rota recusa quem nao traz a permissao de transcricao.
 */
export function reserveTranscriptionRoute(
  worker: Pick<TranscriptionWorkerUseCase, "reserve">,
): ApiRoute {
  return {
    ...reserveTranscriptionOperation,
    handler: ({ actor }): Promise<TranscriptionReservation | undefined> => worker.reserve(actor),
  };
}
