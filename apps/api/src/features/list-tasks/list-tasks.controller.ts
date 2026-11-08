import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { TaskSummaryDto } from "@repo/contracts";
import type { WorkItemPriority, WorkItemStatus } from "../../domain";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { normalizeSearch, parseEnumList, parseInstant } from "../../api-core/list-filters";
import { parseLimit } from "../../api-core/http-input-validation";
import { ListTasksUseCase } from "./list-tasks.usecase";

const TASK_STATUSES: readonly WorkItemStatus[] = ["todo", "scheduled", "toDefine", "inHold", "done", "cancel"];
const TASK_PRIORITIES: readonly WorkItemPriority[] = ["urgent", "high", "medium", "low"];

@Controller("api/tasks")
export class ListTasksController {
  constructor(@Inject(ListTasksUseCase) private readonly listTasks: ListTasksUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ): Promise<TaskSummaryDto[]> {
    return this.listTasks.execute(
      {
        status: parseEnumList<WorkItemStatus>("status", status, TASK_STATUSES),
        priority: parseEnumList<WorkItemPriority>("priority", priority, TASK_PRIORITIES),
        tag: tag?.trim() || undefined,
        q: normalizeSearch(q),
        from: parseInstant("from", from),
        to: parseInstant("to", to),
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}
