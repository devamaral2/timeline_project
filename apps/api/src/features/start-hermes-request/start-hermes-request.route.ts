import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { startHermesRequestBody } from "../../api-core/requests/request-input.schemas";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { NotFoundError } from "../../common/http-errors";
import { getServerEnv } from "../../config/env";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { z } from "zod";

export const startHermesRequestOperation = {
  method: "POST",
  path: "/api/requests/hermes",
  status: 202,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/requests/hermes`: manda uma mensagem ao Hermes (ADR 004).
 * Desligada por padrao (`AI_AUTOMATION`): o 404 vem antes de ler o corpo, e e
 * assim que o cliente descobre que a rota nao existe aqui.
 */
export function startHermesRequestRoute(requests: Pick<RequestOperations, "startHermes">): ApiRoute {
  return {
    ...startHermesRequestOperation,
    handler: async ({ body, actor }) => {
      if (getServerEnv().AI_AUTOMATION !== "on") throw new NotFoundError();
      const parsed = startHermesRequestBody.safeParse(body);
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
      return requests.startHermes(parsed.data, actor);
    },
  };
}
