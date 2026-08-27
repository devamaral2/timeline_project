import type { TagSuggestionDto } from "../contracts/tag-suggestion.dto";

export type { TagSuggestionDto };

export interface TagRepository {
  upsertMany(tags: string[], createdBy: string): Promise<void>;
  suggest(params: { query: string; limit: number }): Promise<TagSuggestionDto[]>;
}
