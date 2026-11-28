import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { modelModeEnabled, selectionProblem } from "../../api-core/requests/model-catalog";
import { modelAgendaOwner } from "../../api-core/requests/model-config";
import { startModelRequestBody } from "../../api-core/requests/request-input.schemas";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { NotFoundError } from "../../common/http-errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { z } from "zod";

export const startModelRequestOperation = {
  method: "POST",
  path: "/api/requests/model",
  status: 202,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * O modo modelo do chat (ADR 0019). So existe com ao menos uma chave de
 * provedor: sem nenhuma, o 404 vem antes de ler o corpo, e e assim que o cliente
 * descobre que o modo nao existe aqui.
 */
export function startModelRequestRoute(requests: Pick<RequestOperations, "startModel">): ApiRoute {
  return {
    ...startModelRequestOperation,
    handler: async ({ body, actor }) => {
      if (!modelModeEnabled()) throw new NotFoundError();
      const parsed = startModelRequestBody.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      const problem = await selectionProblem(parsed.data.model);
      if (problem) throw new InvalidInputError(problem);
      return requests.startModel(parsed.data, actor, modelAgendaOwner());
    },
  };
}
