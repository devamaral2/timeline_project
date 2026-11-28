import type { UpdateTaskInput } from "@repo/contracts";
import { assertExpectedRevision, assertTaskFields } from "../../api-core/http-input-validation";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { UpdateTaskUseCase } from "./update-task.usecase";

export const updateTaskOperation = {
  method: "PATCH",
  path: "/api/tasks/:taskId",
  status: 204,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `PATCH /api/tasks/:taskId`: edita a tarefa e o que a acompanha numa transacao so. */
export function updateTaskRoute(updateTask: UpdateTaskUseCase): ApiRoute {
  return {
    ...updateTaskOperation,
    handler: async ({ params, body, actor }) => {
      assertTaskFields(body as Record<string, unknown>, true);
      assertExpectedRevision(body as { expectedRevision?: unknown });
      await updateTask.execute({ ...(body as UpdateTaskInput), taskId: params.taskId as string }, actor);
    },
  };
}
