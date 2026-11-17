import { Controller, Get, Inject, Module, NotFoundException, Param, UseGuards } from "@nestjs/common";
import type { ArtifactDto } from "@repo/contracts";
import { ARTIFACT_TASK_LINK_QUERY, ARTIFACT_REPOSITORY } from "../../infrastructure/persistence";
import type { ArtifactTaskLinkQuery, ArtifactRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetArtifactUseCase } from "./get-artifact.usecase";

@Controller("api/artifacts")
export class GetArtifactController {
  constructor(@Inject(GetArtifactUseCase) private readonly getArtifact: GetArtifactUseCase) {}

  @Get(":artifactId")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Param("artifactId") artifactId: string, @CurrentUser() actor: AuthenticatedUser): Promise<ArtifactDto> {
    const artifact = await this.getArtifact.execute({ artifactId }, actor);
    if (!artifact) throw new NotFoundException("Artifact not found");
    return artifact;
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetArtifactController],
  providers: [{
    provide: GetArtifactUseCase,
    inject: [ARTIFACT_REPOSITORY, ARTIFACT_TASK_LINK_QUERY],
    useFactory: (artifacts: ArtifactRepository, links: ArtifactTaskLinkQuery) => new GetArtifactUseCase(artifacts, links),
  }],
})
export class GetArtifactModule {}
