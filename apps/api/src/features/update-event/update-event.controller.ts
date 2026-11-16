import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateTaskInput } from "@repo/contracts";
import { ARTIFACT_REPOSITORY, ENTITY_BATCH_WRITER, EVENT_REPOSITORY } from "../../infrastructure/persistence";
import type { ArtifactRepository, EntityBatchWriter, EventRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { assertEventFields, assertExpectedRevision } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { UpdateEventUseCase } from "./update-event.usecase";

@Controller("api/tasks")
export class UpdateEventController {
  constructor(@Inject(UpdateEventUseCase) private readonly updateEvent: UpdateEventUseCase) {}

  @Patch(":taskId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertEventFields(body as unknown as Record<string, unknown>, true);
    assertExpectedRevision(body);
    await this.updateEvent.execute({ ...body, taskId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateEventController],
  providers: [{
    provide: UpdateEventUseCase,
    inject: [EVENT_REPOSITORY, ARTIFACT_REPOSITORY, ArtifactBuilder, ENTITY_BATCH_WRITER],
    useFactory: (
      events: EventRepository, artifacts: ArtifactRepository, builder: ArtifactBuilder, writer: EntityBatchWriter,
    ) => new UpdateEventUseCase(events, artifacts, builder, writer),
  }],
})
export class UpdateEventModule {}
