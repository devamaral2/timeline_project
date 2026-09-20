import { Controller, Get, Inject, Module, Param, UseGuards } from "@nestjs/common";
import type { TaskSummaryDto } from "@repo/contracts";
import { TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListSubtasksUseCase } from "./list-subtasks.usecase";

@Controller("api/tasks")
export class ListSubtasksController {
  constructor(@Inject(ListSubtasksUseCase) private readonly listSubtasks: ListSubtasksUseCase) {}

  @Get(":taskId/subtasks")
  @UseGuards(GatewayIdentityGuard)
  execute(@Param("taskId") taskId: string, @CurrentUser() actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    return this.listSubtasks.execute({ taskId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListSubtasksController],
  providers: [{
    provide: ListSubtasksUseCase,
    inject: [TASK_REPOSITORY],
    useFactory: (tasks: TaskRepository) => new ListSubtasksUseCase(tasks),
  }],
})
export class ListSubtasksModule {}
