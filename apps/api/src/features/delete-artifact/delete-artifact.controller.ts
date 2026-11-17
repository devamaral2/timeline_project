import { Controller, Delete, HttpCode, HttpStatus, Inject, Module, Param, UseGuards } from "@nestjs/common";
import { ARTIFACT_REPOSITORY } from "../../infrastructure/persistence";
import type { ArtifactRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DeleteArtifactUseCase } from "./delete-artifact.usecase";

@Controller("api/artifacts")
export class DeleteArtifactController {
  constructor(@Inject(DeleteArtifactUseCase) private readonly deleteArtifact: DeleteArtifactUseCase) {}

  @Delete(":artifactId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Param("artifactId") artifactId: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    await this.deleteArtifact.execute({ artifactId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [DeleteArtifactController],
  providers: [{
    provide: DeleteArtifactUseCase,
    inject: [ARTIFACT_REPOSITORY],
    useFactory: (artifacts: ArtifactRepository) => new DeleteArtifactUseCase(artifacts),
  }],
})
export class DeleteArtifactModule {}
