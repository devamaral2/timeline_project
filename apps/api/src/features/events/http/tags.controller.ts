import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { TagSuggestionDto } from "@repo/contracts";
import { CurrentUser } from "../../request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import { SuggestTagsUseCase } from "../usecases/suggest-tags.usecase";

@Controller("api/tags")
export class TagsController {
  constructor(private readonly suggestTags: SuggestTagsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  async suggest(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("query") query?: string,
    @Query("limit") limit?: string,
  ): Promise<TagSuggestionDto[]> {
    const requestedLimit = Number(limit);
    return this.suggestTags.execute(
      {
        query: query ?? "",
        limit: Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
      },
      actor,
    );
  }
}
