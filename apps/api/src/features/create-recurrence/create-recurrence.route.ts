import type { CreateRecurrenceInput } from "@repo/contracts";
import { assertRecurrenceTemplate } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { CreateRecurrenceUseCase } from "./create-recurrence.usecase";

export const createRecurrenceOperation = {
  method: "POST",
  path: "/api/recurrences",
  status: 201,
  authentication: "gateway-session",
  idempotent: true,
} as const satisfies ApiRouteOperation;

/** `POST /api/recurrences`: a regra e o template da tarefa que cada ocorrencia copia. */
export function createRecurrenceRoute(createRecurrence: CreateRecurrenceUseCase): ApiRoute {
  return {
    ...createRecurrenceOperation,
    handler: ({ body, actor }) => {
      assertRecurrenceTemplate((body as CreateRecurrenceInput).template, true);
      return createRecurrence.execute(body as CreateRecurrenceInput, actor);
    },
  };
}
