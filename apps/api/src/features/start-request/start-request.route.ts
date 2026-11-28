import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { startRequestBody } from "../../api-core/requests/request-input.schemas";
import { selectionProblem } from "../../api-core/requests/model-catalog";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { z } from "zod";

export const startRequestOperation = {
  method: "POST",
  path: "/api/requests",
  status: 202,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/requests`: um pedido ao agente, que se desdobra em passos (ADR
 * 003). Com `model`, o provedor precisa estar ligado e o modelo na lista dele.
 */
export function startRequestRoute(requests: Pick<RequestOperations, "start">): ApiRoute {
  return {
    ...startRequestOperation,
    handler: async ({ body, actor }) => {
      const parsed = startRequestBody.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      const problem = parsed.data.model && (await selectionProblem(parsed.data.model));
      if (problem) throw new InvalidInputError(problem);
      return { requestId: await requests.start(parsed.data, actor) };
    },
  };
}
