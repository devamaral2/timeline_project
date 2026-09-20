import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateTaskInput } from "@repo/contracts";
import { TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertExpectedRevision, assertParentTaskId, assertTaskFields } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { UpdateTaskUseCase } from "./update-task.usecase";

@Controller("api/tasks")
export class UpdateTaskController {
  constructor(@Inject(UpdateTaskUseCase) private readonly updateTask: UpdateTaskUseCase) {}

  @Patch(":taskId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertTaskFields(body);
    assertParentTaskId(body);
    assertExpectedRevision(body);
    await this.updateTask.execute({ ...body, taskId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateTaskController],
  providers: [{
    provide: UpdateTaskUseCase,
    inject: [TASK_REPOSITORY],
    useFactory: (tasks: TaskRepository) => new UpdateTaskUseCase(tasks),
  }],
})
export class UpdateTaskModule {}
