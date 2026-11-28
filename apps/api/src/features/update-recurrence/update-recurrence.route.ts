import type { UpdateRecurrenceInput } from "@repo/contracts";
import { assertExpectedRevision, assertRecurrenceTemplate } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { UpdateRecurrenceUseCase } from "./update-recurrence.usecase";

export const updateRecurrenceOperation = {
  method: "PATCH",
  path: "/api/recurrences/:recurrenceId",
  status: 204,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `PATCH /api/recurrences/:recurrenceId`: a serie do caminho muda de hoje em diante. */
export function updateRecurrenceRoute(updateRecurrence: UpdateRecurrenceUseCase): ApiRoute {
  return {
    ...updateRecurrenceOperation,
    handler: async ({ params, body, actor }) => {
      const input = body as Omit<UpdateRecurrenceInput, "recurrenceId">;
      assertExpectedRevision(input);
      assertRecurrenceTemplate(input.template, false);
      await updateRecurrence.execute({ ...input, recurrenceId: params.recurrenceId as string }, actor);
    },
  };
}
