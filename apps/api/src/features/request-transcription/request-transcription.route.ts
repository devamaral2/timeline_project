import type { TranscriptionRequestResult } from "@repo/contracts";
import { transcriptionRequestInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import type { RequestTranscriptionUseCase } from "./request-transcription.usecase";

export const requestTranscriptionOperation = {
  method: "POST",
  path: "/api/tasks/transcription-requests",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/tasks/transcription-requests`: pede a transcricao de um video do
 * YouTube. O pedido fica na fila ate o servico local busca-lo; o documento do
 * video entra na Leitura diaria do dia. Quem chama: a extensao numa aba do
 * YouTube, o chat e o botao "Adicionar video".
 */
export function requestTranscriptionRoute(
  requestTranscription: Pick<RequestTranscriptionUseCase, "execute">,
): ApiRoute {
  return {
    ...requestTranscriptionOperation,
    handler: ({ body, actor }): Promise<TranscriptionRequestResult> => {
      const parsed = transcriptionRequestInputSchema.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return requestTranscription.execute(parsed.data, actor);
    },
  };
}
