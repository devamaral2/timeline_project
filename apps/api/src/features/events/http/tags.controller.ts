import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { TagSuggestionDto } from "@repo/contracts";
import { CurrentUser } from "../../authenticate-user/current-user.decorator";
import { AuthServiceGuard } from "../../authorize-user/auth-service.guard";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { AccessResource } from "../../authorize-user/access-resource.decorator";
import { SuggestTagsUseCase } from "../usecases/suggest-tags.usecase";

@Controller("api/tags")
@AccessResource("tag")
export class TagsController {
  constructor(private readonly suggestTags: SuggestTagsUseCase) {}

  @Get()
  @UseGuards(AuthServiceGuard)
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
