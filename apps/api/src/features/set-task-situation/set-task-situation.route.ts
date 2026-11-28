import type { SetTaskSituationInput, TaskCardDto } from "@repo/contracts";
import { assertSituationBody } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { SetTaskSituationUseCase } from "./set-task-situation.usecase";

export const setTaskSituationOperation = {
  method: "PUT",
  path: "/api/tasks/:taskId/situation",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `PUT /api/tasks/:taskId/situation`: guarda a revisao do pedido de agente que terminou. */
export function setTaskSituationRoute(setSituation: SetTaskSituationUseCase): ApiRoute {
  return {
    ...setTaskSituationOperation,
    handler: ({ params, body, actor }): Promise<TaskCardDto> => {
      assertSituationBody(body as Record<string, unknown>);
      return setSituation.execute({ taskId: params.taskId as string, situation: (body as SetTaskSituationInput).situation }, actor);
    },
  };
}
