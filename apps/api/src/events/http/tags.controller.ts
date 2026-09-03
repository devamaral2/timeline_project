import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { TagSuggestionDto } from "@repo/entities/contracts";
import { CurrentUser } from "../../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../../auth/firebase-auth.guard";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { SuggestTagsUseCase } from "../usecases/suggest-tags.usecase";

@Controller("api/tags")
export class TagsController {
  constructor(private readonly suggestTags: SuggestTagsUseCase) {}

  @Get()
  @UseGuards(FirebaseAuthGuard)
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
