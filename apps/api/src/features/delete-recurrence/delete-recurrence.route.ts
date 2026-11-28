import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { DeleteRecurrenceUseCase } from "./delete-recurrence.usecase";

export const deleteRecurrenceOperation = {
  method: "DELETE",
  path: "/api/recurrences/:recurrenceId",
  status: 204,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `DELETE /api/recurrences/:recurrenceId`: apaga a serie e as ocorrencias de hoje em diante. */
export function deleteRecurrenceRoute(deleteRecurrence: DeleteRecurrenceUseCase): ApiRoute {
  return {
    ...deleteRecurrenceOperation,
    handler: async ({ params, actor }) => {
      await deleteRecurrence.execute({ recurrenceId: params.recurrenceId as string }, actor);
    },
  };
}
