import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { TaskSummaryDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListTasksUseCase } from "./list-tasks.usecase";

@Controller("api/tasks")
export class ListTasksController {
  constructor(@Inject(ListTasksUseCase) private readonly listTasks: ListTasksUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(@CurrentUser() actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    return this.listTasks.execute(undefined, actor);
  }
}
