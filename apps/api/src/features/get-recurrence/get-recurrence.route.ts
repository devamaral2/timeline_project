import type { RecurrenceDto } from "@repo/contracts";
import { HttpError } from "../../common/http-errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { GetRecurrenceUseCase } from "./get-recurrence.usecase";

export const getRecurrenceOperation = {
  method: "GET",
  path: "/api/recurrences/:recurrenceId",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/recurrences/:recurrenceId`: a serie do dono, com o template como foi guardado. */
export function getRecurrenceRoute(getRecurrence: GetRecurrenceUseCase): ApiRoute {
  return {
    ...getRecurrenceOperation,
    handler: async ({ params, actor }): Promise<RecurrenceDto> => {
      const recurrence = await getRecurrence.execute({ recurrenceId: params.recurrenceId as string }, actor);
      if (!recurrence) throw new HttpError(404, "Recurrence not found");
      return recurrence;
    },
  };
}
