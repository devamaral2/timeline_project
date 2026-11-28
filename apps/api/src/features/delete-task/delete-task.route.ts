import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { DeleteTaskUseCase } from "./delete-task.usecase";

export const deleteTaskOperation = {
  method: "DELETE",
  path: "/api/tasks/:taskId",
  status: 204,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `DELETE /api/tasks/:taskId`: apaga a tarefa, mantendo as subtarefas. */
export function deleteTaskRoute(deleteTask: DeleteTaskUseCase): ApiRoute {
  return {
    ...deleteTaskOperation,
    handler: ({ params, actor }) => deleteTask.execute({ taskId: params.taskId as string }, actor),
  };
}
