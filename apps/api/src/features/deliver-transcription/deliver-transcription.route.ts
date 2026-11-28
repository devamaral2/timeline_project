import type { TranscriptionDeliveryResult } from "@repo/contracts";
import { transcriptionDeliveryInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const deliverTranscriptionOperation = {
  method: "POST",
  path: "/api/transcription-worker/deliver",
  status: 200,
  authentication: "transcription-device-key",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/transcription-worker/deliver`: o servico local entrega o
 * resultado cru da transcricao ou a falha do pedido.
 */
export function deliverTranscriptionRoute(
  worker: Pick<TranscriptionWorkerUseCase, "deliver">,
): ApiRoute {
  return {
    ...deliverTranscriptionOperation,
    handler: ({ body, actor }): Promise<TranscriptionDeliveryResult> => {
      const parsed = transcriptionDeliveryInputSchema.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return worker.deliver(parsed.data, actor);
    },
  };
}
