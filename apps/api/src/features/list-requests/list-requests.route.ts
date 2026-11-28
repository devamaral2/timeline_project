import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { listRequestsLimitQuery } from "../../api-core/requests/request-input.schemas";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { z } from "zod";

export const listRequestsOperation = {
  method: "GET",
  path: "/api/requests",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `GET /api/requests`: os pedidos do usuario, do mais novo para o mais antigo.
 * Passos nao entram, e o rastro fica no detalhe.
 */
export function listRequestsRoute(requests: Pick<RequestOperations, "list">): ApiRoute {
  return {
    ...listRequestsOperation,
    handler: async ({ query, actor }) => {
      const parsed = listRequestsLimitQuery.safeParse(query.limit);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return requests.list(actor, parsed.data);
    },
  };
}
