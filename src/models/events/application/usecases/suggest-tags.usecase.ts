import type { TagRepository } from "../contracts/tag-repository";
import type { TagSuggestionDto } from "../dtos/tag-suggestion.dto";

export class SuggestTagsUseCase {
  constructor(private readonly tagRepository: TagRepository) {}

  async execute(input: { query: string; limit?: number }): Promise<TagSuggestionDto[]> {
    return this.tagRepository.suggest({ query: input.query, limit: input.limit ?? 10 });
  }
}
