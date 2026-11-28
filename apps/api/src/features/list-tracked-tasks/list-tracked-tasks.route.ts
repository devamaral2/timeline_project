import type { TaskCardDto } from "@repo/contracts";
import { BadRequestError } from "../../common/http-errors";
import { parseLimit } from "../../api-core/http-input-validation";
import { normalizeSearch, parseEnum, parseEnumList, parseInstant } from "../../api-core/list-filters";
import { ACTORS, PRIORITIES, TASK_STATUSES, type Actor, type TaskPriority, type TaskStatus } from "../../domain/index";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { ListTrackedTasksUseCase } from "./list-tracked-tasks.usecase";

function parseBoolean(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw !== "true" && raw !== "false") throw new BadRequestError(`Invalid ${name}`);
  return raw === "true";
}

export const listTrackedTasksOperation = {
  method: "GET",
  path: "/api/tasks/tracked",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/tasks/tracked`: as tarefas acompanhadas, de pessoa e de agente. */
export function listTrackedTasksRoute(listTrackedTasks: ListTrackedTasksUseCase): ApiRoute {
  return {
    ...listTrackedTasksOperation,
    handler: ({ query, actor }): Promise<TaskCardDto[]> =>
      listTrackedTasks.execute(
        {
          actor: parseEnum<Actor>("actor", query.actor as string | undefined, ACTORS),
          status: parseEnumList<TaskStatus>("status", query.status as string | undefined, TASK_STATUSES),
          priority: parseEnumList<TaskPriority>("priority", query.priority as string | undefined, PRIORITIES),
          tag: (query.tag as string | undefined)?.trim().toLowerCase() || undefined,
          q: normalizeSearch(query.q as string | undefined),
          from: parseInstant("from", query.from as string | undefined),
          to: parseInstant("to", query.to as string | undefined),
          longRunning: parseBoolean("longRunning", query.longRunning as string | undefined),
          limit: parseLimit(query.limit as string | undefined),
        },
        actor,
      ),
  };
}
