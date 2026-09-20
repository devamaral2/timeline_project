import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { CreateTaskInput } from "@repo/contracts";
import { TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertParentTaskId, assertTaskFields } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateTaskUseCase } from "./create-task.usecase";

@Controller("api/tasks")
export class CreateTaskController {
  constructor(@Inject(CreateTaskUseCase) private readonly createTask: CreateTaskUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateTaskInput, @CurrentUser() actor: AuthenticatedUser): Promise<{ taskId: string }> {
    assertTaskFields(body);
    assertParentTaskId(body);
    return this.createTask.execute(body, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateTaskController],
  providers: [{
    provide: CreateTaskUseCase,
    inject: [TASK_REPOSITORY],
    useFactory: (tasks: TaskRepository) => new CreateTaskUseCase(tasks),
  }],
})
export class CreateTaskModule {}
