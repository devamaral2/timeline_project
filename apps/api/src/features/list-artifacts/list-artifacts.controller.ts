import { BadRequestException, Controller, Get, Inject, Module, Query, UseGuards } from "@nestjs/common";
import type { ArtifactDto } from "@repo/contracts";
import { ARTIFACT_TYPES, type ArtifactType } from "../../domain";
import { ARTIFACT_EVENT_LINK_QUERY, ARTIFACT_REPOSITORY } from "../../infrastructure/persistence";
import type { ArtifactEventLinkQuery, ArtifactRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { parseLimit } from "../../api-core/http-input-validation";
import { normalizeSearch, parseEnum } from "../../api-core/list-filters";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListArtifactsUseCase } from "./list-artifacts.usecase";

@Controller("api/artifacts")
export class ListArtifactsController {
  constructor(@Inject(ListArtifactsUseCase) private readonly listArtifacts: ListArtifactsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("type") type?: string,
    @Query("scope") scope?: string,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
    @Query("eventId") eventId?: string,
    @Query("limit") limit?: string,
  ): Promise<ArtifactDto[]> {
    const artifactType = parseEnum<ArtifactType>("type", type, ARTIFACT_TYPES);
    const artifactScope = parseEnum<"global">("scope", scope, ["global"]);
    if (artifactScope === "global" && !artifactType) throw new BadRequestException("The global scope requires a type");
    return this.listArtifacts.execute(
      {
        type: artifactType,
        scope: artifactScope,
        tag: tag?.trim().toLowerCase() || undefined,
        q: normalizeSearch(q),
        eventId: eventId || undefined,
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListArtifactsController],
  providers: [{
    provide: ListArtifactsUseCase,
    inject: [ARTIFACT_REPOSITORY, ARTIFACT_EVENT_LINK_QUERY],
    useFactory: (artifacts: ArtifactRepository, links: ArtifactEventLinkQuery) => new ListArtifactsUseCase(artifacts, links),
  }],
})
export class ListArtifactsModule {}
