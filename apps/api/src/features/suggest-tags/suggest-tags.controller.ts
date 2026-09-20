import { Controller, Get, Inject, Module, Query, UseGuards } from "@nestjs/common";
import type { TagSuggestionDto } from "@repo/contracts";
import { TAG_REPOSITORY } from "../../infrastructure/persistence";
import type { TagRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { SuggestTagsUseCase } from "./suggest-tags.usecase";

@Controller("api/tags")
export class SuggestTagsController {
  constructor(@Inject(SuggestTagsUseCase) private readonly suggestTags: SuggestTagsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("query") query?: string,
    @Query("limit") limit?: string,
  ): Promise<TagSuggestionDto[]> {
    const requestedLimit = Number(limit);
    return this.suggestTags.execute(
      { query: query ?? "", limit: Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined },
      actor,
    );
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [SuggestTagsController],
  providers: [{
    provide: SuggestTagsUseCase,
    inject: [TAG_REPOSITORY],
    useFactory: (tags: TagRepository) => new SuggestTagsUseCase(tags),
  }],
})
export class SuggestTagsModule {}
