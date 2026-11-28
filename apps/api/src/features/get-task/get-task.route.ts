import type { TaskDto } from "@repo/contracts";
import { HttpError } from "../../common/http-errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { GetTaskUseCase } from "./get-task.usecase";

export const getTaskOperation = {
  method: "GET",
  path: "/api/tasks/:taskId",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/tasks/:taskId`: a tarefa com os artefatos, a serie, os pedidos e o projeto. */
export function getTaskRoute(getTask: GetTaskUseCase): ApiRoute {
  return {
    ...getTaskOperation,
    handler: async ({ params, actor }): Promise<TaskDto> => {
      const task = await getTask.execute({ taskId: params.taskId as string }, actor);
      if (!task) throw new HttpError(404, "Task not found");
      return task;
    },
  };
}
