import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { selectionProblem } from "../../api-core/requests/model-catalog";
import { startEditRequestBody } from "../../api-core/requests/request-input.schemas";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { z } from "zod";

export const startEditRequestOperation = {
  method: "POST",
  path: "/api/requests/edit",
  status: 202,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/requests/edit`: o pedido de edicao da entidade aberta na tela de
 * detalhe (ADR 006). Com `model`, o provedor precisa estar ligado e o modelo na
 * lista dele.
 */
export function startEditRequestRoute(requests: Pick<RequestOperations, "startEdit">): ApiRoute {
  return {
    ...startEditRequestOperation,
    handler: async ({ body, actor }) => {
      const parsed = startEditRequestBody.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      const problem = parsed.data.model && (await selectionProblem(parsed.data.model));
      if (problem) throw new InvalidInputError(problem);
      return { requestId: await requests.startEdit(parsed.data, actor) };
    },
  };
}
