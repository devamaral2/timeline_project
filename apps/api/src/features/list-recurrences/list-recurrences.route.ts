import type { RecurrenceDto } from "@repo/contracts";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { ListRecurrencesUseCase } from "./list-recurrences.usecase";

export const listRecurrencesOperation = {
  method: "GET",
  path: "/api/recurrences",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/recurrences`: as series do usuario. */
export function listRecurrencesRoute(listRecurrences: ListRecurrencesUseCase): ApiRoute {
  return {
    ...listRecurrencesOperation,
    handler: ({ actor }): Promise<RecurrenceDto[]> => listRecurrences.execute(actor),
  };
}
