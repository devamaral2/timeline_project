import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import type { CancelTranscriptionUseCase } from "../request-transcription/cancel-transcription.usecase";

export const cancelRequestOperation = {
  method: "POST",
  path: "/api/requests/:requestId/cancel",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/requests/:requestId/cancel`: para o que o agente ainda nao
 * terminou. O que ja foi gravado fica. O pedido de transcricao de video tambem
 * acerta o documento e a Leitura diaria (`CancelTranscriptionUseCase`).
 */
export function cancelRequestRoute(
  requests: Pick<RequestOperations, "view" | "cancel">,
  transcription: Pick<CancelTranscriptionUseCase, "execute">,
): ApiRoute {
  return {
    ...cancelRequestOperation,
    handler: async ({ params, actor }) => {
      const requestId = params.requestId as string;
      // `view` recusa o pedido de outra pessoa com o mesmo 404 de um id que nao existe.
      const { kind } = await requests.view(requestId, actor);
      if (kind === "save_content_with_transcription") await transcription.execute(requestId, actor);
      return requests.cancel(requestId, actor);
    },
  };
}
