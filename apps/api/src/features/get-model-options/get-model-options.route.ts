import { modelOptions } from "../../api-core/requests/model-catalog";
import { NotFoundError } from "../../common/http-errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const getModelOptionsOperation = {
  method: "GET",
  path: "/api/requests/model/options",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `GET /api/requests/model/options`: os provedores com chave neste ambiente,
 * os modelos de cada um e a escolha padrao do modo modelo (ADR 0019). Sem
 * nenhuma chave, 404: o modo nao existe aqui.
 */
export function getModelOptionsRoute(): ApiRoute {
  return {
    ...getModelOptionsOperation,
    handler: async () => {
      const options = await modelOptions();
      if (!options) throw new NotFoundError();
      return options;
    },
  };
}
