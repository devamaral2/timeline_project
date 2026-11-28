import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateTaskInput } from "@repo/contracts";
import { ARTIFACT_REPOSITORY, ENTITY_BATCH_WRITER, TASK_REPOSITORY } from "../../infrastructure/persistence/index";
import type { ArtifactRepository, EntityBatchWriter, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../nest/api-core.module";
import { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { assertTaskFields, assertExpectedRevision } from "../../api-core/http-input-validation";
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
    assertTaskFields(body as unknown as Record<string, unknown>, true);
    assertExpectedRevision(body);
    await this.updateTask.execute({ ...body, taskId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateTaskController],
  providers: [{
    provide: UpdateTaskUseCase,
    inject: [TASK_REPOSITORY, ARTIFACT_REPOSITORY, ArtifactBuilder, ENTITY_BATCH_WRITER],
    useFactory: (
      tasks: TaskRepository, artifacts: ArtifactRepository, builder: ArtifactBuilder, writer: EntityBatchWriter,
    ) => new UpdateTaskUseCase(tasks, artifacts, builder, writer),
  }],
})
export class UpdateTaskModule {}
