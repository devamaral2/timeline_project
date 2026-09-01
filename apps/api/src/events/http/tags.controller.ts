import { Controller, Get, Query } from "@nestjs/common";
import type { TagSuggestionDto } from "@repo/entities/contracts";
import { SuggestTagsUseCase } from "../usecases/suggest-tags.usecase";

@Controller("api/tags")
export class TagsController {
  constructor(private readonly suggestTags: SuggestTagsUseCase) {}

  @Get()
  async suggest(
    @Query("query") query?: string,
    @Query("limit") limit?: string,
    @Query("userId") userId?: string,
  ): Promise<TagSuggestionDto[]> {
    const requestedLimit = Number(limit);
    // TODO(Task 10): substituir por FirebaseAuthGuard + CurrentUser.
    return this.suggestTags.execute(
      {
        query: query ?? "",
        limit: Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
      },
      { userId: userId ?? "" },
    );
  }
}
