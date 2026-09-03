import type { TagSuggestionDto } from "../contracts/tag-suggestion.dto";

export type { TagSuggestionDto };

export interface TagRepository {
  suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]>;
}
