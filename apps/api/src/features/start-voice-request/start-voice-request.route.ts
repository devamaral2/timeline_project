import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { startVoiceRequestBody } from "../../api-core/requests/request-input.schemas";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { z } from "zod";

export const startVoiceRequestOperation = {
  method: "POST",
  path: "/api/requests/voice",
  status: 202,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/requests/voice`: a fala vira um pedido, e o pedido gera a tarefa. A
 * tarefa criada aparece em `entities` de `GET /api/requests/:requestId`.
 */
export function startVoiceRequestRoute(requests: Pick<RequestOperations, "startVoice">): ApiRoute {
  return {
    ...startVoiceRequestOperation,
    handler: async ({ body, actor }) => {
      const parsed = startVoiceRequestBody.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return { requestId: await requests.startVoice(parsed.data, actor) };
    },
  };
}
