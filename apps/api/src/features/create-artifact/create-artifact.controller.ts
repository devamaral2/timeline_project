import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { CreateArtifactRequest } from "@repo/contracts";
import { ENTITY_BATCH_WRITER, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { EntityBatchWriter, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../nest/api-core.module";
import { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { assertArtifactRequest } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateArtifactUseCase } from "./create-artifact.usecase";

@Controller("api/artifacts")
export class CreateArtifactController {
  constructor(@Inject(CreateArtifactUseCase) private readonly createArtifact: CreateArtifactUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateArtifactRequest, @CurrentUser() actor: AuthenticatedUser): Promise<{ artifactId: string }> {
    assertArtifactRequest(body, true);
    return this.createArtifact.execute(body, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateArtifactController],
  providers: [{
    provide: CreateArtifactUseCase,
    inject: [ArtifactBuilder, TASK_REPOSITORY, ENTITY_BATCH_WRITER],
    useFactory: (builder: ArtifactBuilder, tasks: TaskRepository, writer: EntityBatchWriter) =>
      new CreateArtifactUseCase(builder, tasks, writer),
  }],
})
export class CreateArtifactModule {}
