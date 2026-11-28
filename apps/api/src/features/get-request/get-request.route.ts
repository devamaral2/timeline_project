import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const getRequestOperation = {
  method: "GET",
  path: "/api/requests/:requestId",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/requests/:requestId`: o pedido com os passos, o estado de cada um, o que foi tocado e a resposta. */
export function getRequestRoute(requests: Pick<RequestOperations, "view">): ApiRoute {
  return {
    ...getRequestOperation,
    handler: ({ params, actor }) => requests.view(params.requestId as string, actor),
  };
}
