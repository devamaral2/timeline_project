import { Controller, Delete, HttpCode, HttpStatus, Inject, Module, Param, UseGuards } from "@nestjs/common";
import { TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DeleteTaskUseCase } from "./delete-task.usecase";

@Controller("api/tasks")
export class DeleteTaskController {
  constructor(@Inject(DeleteTaskUseCase) private readonly deleteTask: DeleteTaskUseCase) {}

  @Delete(":taskId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Param("taskId") taskId: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    await this.deleteTask.execute({ taskId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [DeleteTaskController],
  providers: [{
    provide: DeleteTaskUseCase,
    inject: [TASK_REPOSITORY],
    useFactory: (tasks: TaskRepository) => new DeleteTaskUseCase(tasks),
  }],
})
export class DeleteTaskModule {}
