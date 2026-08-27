import type { TagRepository } from "@repo/entities/ports";
import type { TagSuggestionDto } from "@repo/entities/contracts";

export class SuggestTagsUseCase {
  constructor(private readonly tagRepository: TagRepository) {}

  async execute(input: { query: string; limit?: number }): Promise<TagSuggestionDto[]> {
    return this.tagRepository.suggest({ query: input.query, limit: input.limit ?? 10 });
  }
}
