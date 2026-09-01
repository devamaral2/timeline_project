import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { TagRepository } from "@repo/entities/ports";
import type { TagSuggestionDto } from "@repo/entities/contracts";

export class SuggestTagsUseCase {
  constructor(private readonly tagRepository: TagRepository) {}

  async execute(input: { query: string; limit?: number }, actor: AuthenticatedUser): Promise<TagSuggestionDto[]> {
    return this.tagRepository.suggest({ userId: actor.userId, query: input.query, limit: input.limit ?? 10 });
  }
}
