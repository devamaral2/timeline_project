import type { TagSuggestionDto } from "@repo/contracts";

export type { TagSuggestionDto };

export interface TagRepository {
  suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]>;
}
