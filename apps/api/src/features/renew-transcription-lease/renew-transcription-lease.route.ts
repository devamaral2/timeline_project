import type { TranscriptionLeaseResult } from "@repo/contracts";
import { transcriptionLeaseInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const renewTranscriptionLeaseOperation = {
  method: "POST",
  path: "/api/transcription-worker/lease",
  status: 200,
  authentication: "transcription-device-key",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/transcription-worker/lease`: o servico local renova o lease do
 * pedido e informa a etapa e a porcentagem; lease perdido e 409.
 */
export function renewTranscriptionLeaseRoute(
  worker: Pick<TranscriptionWorkerUseCase, "renew">,
): ApiRoute {
  return {
    ...renewTranscriptionLeaseOperation,
    handler: ({ body, actor }): Promise<TranscriptionLeaseResult> => {
      const parsed = transcriptionLeaseInputSchema.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return worker.renew(parsed.data, actor);
    },
  };
}
