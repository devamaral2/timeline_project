import type { CreateTaskInput } from "@repo/contracts";
import { assertTaskFields } from "../../api-core/http-input-validation";
import { CreateTaskUseCase } from "../../api-core/tasks/create-task.usecase";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const createTaskOperation = {
  method: "POST",
  path: "/api/tasks",
  status: 201,
  authentication: "gateway-session",
  idempotent: true,
} as const satisfies ApiRouteOperation;

/** `POST /api/tasks`: cria a tarefa do usuario com os artefatos e a hierarquia que vieram. */
export function createTaskRoute(createTask: CreateTaskUseCase): ApiRoute {
  return {
    ...createTaskOperation,
    handler: ({ body, actor }) => {
      assertTaskFields(body as Record<string, unknown>, false);
      return createTask.execute(body as CreateTaskInput, actor);
    },
  };
}
