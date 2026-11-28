import type { ApiRouteOperation } from "../http/api-route";
import { createProjectOperation } from "../features/create-project/create-project.route";
import { createTaskOperation } from "../features/create-task/create-task.route";
import { deleteTaskOperation } from "../features/delete-task/delete-task.route";
import { getTaskOperation } from "../features/get-task/get-task.route";
import { listAgendaTasksOperation } from "../features/list-agenda-tasks/list-agenda-tasks.route";
import { listProjectsOperation } from "../features/list-projects/list-projects.route";
import { listTrackedTasksOperation } from "../features/list-tracked-tasks/list-tracked-tasks.route";
import { setTaskSituationOperation } from "../features/set-task-situation/set-task-situation.route";
import { updateTaskOperation } from "../features/update-task/update-task.route";

/**
 * As operacoes que ja respondem pelo Fastify, na ordem em que sao registradas.
 * As estaticas vem antes das parametrizadas. O catalogo OpenAPI e os testes de
 * arquitetura usam esta lista para nao depender de reflection dos controllers.
 */
export const DECLARED_API_OPERATIONS: readonly ApiRouteOperation[] = [
  listTrackedTasksOperation,
  listAgendaTasksOperation,
  createTaskOperation,
  getTaskOperation,
  updateTaskOperation,
  setTaskSituationOperation,
  deleteTaskOperation,
  listProjectsOperation,
  createProjectOperation,
];

/** O caminho na forma do documento OpenAPI (`/api/tasks/:taskId` -> `/api/tasks/{taskId}`). */
export function openApiPath(path: string): string {
  return path.replace(/:(\w+)/g, "{$1}");
}

/** A chave da operacao no catalogo (`METODO /caminho`). */
export function declaredOperationKey(operation: Pick<ApiRouteOperation, "method" | "path">): string {
  return `${operation.method} ${openApiPath(operation.path)}`;
}
