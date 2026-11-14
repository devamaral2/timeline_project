import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateArtifactRequest } from "@repo/contracts";
import {
  ARTIFACT_EVENT_LINK_QUERY,
  ARTIFACT_REPOSITORY,
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
} from "../../infrastructure/persistence";
import type { ArtifactEventLinkQuery, ArtifactRepository, EntityBatchWriter, EventRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ArtifactBuilder } from "../../api-core/artifacts/services/artifact-builder.service";
import { assertArtifactRequest, assertExpectedRevision } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { UpdateArtifactUseCase } from "./update-artifact.usecase";

@Controller("api/artifacts")
export class UpdateArtifactController {
  constructor(@Inject(UpdateArtifactUseCase) private readonly updateArtifact: UpdateArtifactUseCase) {}

  @Patch(":artifactId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("artifactId") artifactId: string,
    @Body() body: Omit<UpdateArtifactRequest, "artifactId">,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertArtifactRequest(body, false);
    assertExpectedRevision(body);
    await this.updateArtifact.execute({ ...body, artifactId } as UpdateArtifactRequest, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateArtifactController],
  providers: [{
    provide: UpdateArtifactUseCase,
    inject: [ARTIFACT_REPOSITORY, ARTIFACT_EVENT_LINK_QUERY, ArtifactBuilder, EVENT_REPOSITORY, ENTITY_BATCH_WRITER],
    useFactory: (
      artifacts: ArtifactRepository, links: ArtifactEventLinkQuery, builder: ArtifactBuilder,
      events: EventRepository, writer: EntityBatchWriter,
    ) => new UpdateArtifactUseCase(artifacts, links, builder, events, writer),
  }],
})
export class UpdateArtifactModule {}
