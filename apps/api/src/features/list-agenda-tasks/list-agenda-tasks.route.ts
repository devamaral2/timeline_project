import { assertAgendaCursor, parseLimit } from "../../api-core/http-input-validation";
import { parseEnum, parseInstant } from "../../api-core/list-filters";
import { ACTORS, AGENDA_KINDS, type Actor, type TaskKind } from "../../domain/index";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";
import { ListAgendaTasksUseCase } from "./list-agenda-tasks.usecase";

export const listAgendaTasksOperation = {
  method: "GET",
  path: "/api/tasks",
  status: 200,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/** `GET /api/tasks`: a agenda paginada do usuario, com os filtros e a janela atuais. */
export function listAgendaTasksRoute(listAgendaTasks: ListAgendaTasksUseCase): ApiRoute {
  return {
    ...listAgendaTasksOperation,
    handler: ({ query, actor }) => {
      const cursor = query.cursor as string | undefined;
      if (cursor !== undefined) assertAgendaCursor(cursor);
      return listAgendaTasks.execute(
        {
          from: parseInstant("from", query.from as string | undefined),
          to: parseInstant("to", query.to as string | undefined),
          actor: parseEnum<Actor>("actor", query.actor as string | undefined, ACTORS),
          kind: parseEnum<TaskKind>("kind", query.kind as string | undefined, AGENDA_KINDS),
          tag: (query.tag as string | undefined)?.trim().toLowerCase() || undefined,
          cursor,
          limit: parseLimit(query.limit as string | undefined),
        },
        actor,
      );
    },
  };
}
