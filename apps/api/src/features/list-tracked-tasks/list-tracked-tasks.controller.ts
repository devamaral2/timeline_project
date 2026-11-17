import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { TaskCardDto } from "@repo/contracts";
import { ACTORS, TASK_STATUSES, PRIORITIES, type Actor, type TaskPriority, type TaskStatus } from "../../domain/index";
import { parseLimit } from "../../api-core/http-input-validation";
import { normalizeSearch, parseEnum, parseEnumList, parseInstant } from "../../api-core/list-filters";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListTrackedTasksUseCase } from "./list-tracked-tasks.usecase";

function parseBoolean(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw !== "true" && raw !== "false") throw new BadRequestException(`Invalid ${name}`);
  return raw === "true";
}

@Controller("api/tasks")
export class ListTrackedTasksController {
  constructor(@Inject(ListTrackedTasksUseCase) private readonly listTrackedTasks: ListTrackedTasksUseCase) {}

  @Get("tracked")
  @UseGuards(GatewayIdentityGuard)
  execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("actor") taskActor?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("longRunning") longRunning?: string,
    @Query("limit") limit?: string,
  ): Promise<TaskCardDto[]> {
    return this.listTrackedTasks.execute(
      {
        actor: parseEnum<Actor>("actor", taskActor, ACTORS),
        status: parseEnumList<TaskStatus>("status", status, TASK_STATUSES),
        priority: parseEnumList<TaskPriority>("priority", priority, PRIORITIES),
        tag: tag?.trim().toLowerCase() || undefined,
        q: normalizeSearch(q),
        from: parseInstant("from", from),
        to: parseInstant("to", to),
        longRunning: parseBoolean("longRunning", longRunning),
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}
