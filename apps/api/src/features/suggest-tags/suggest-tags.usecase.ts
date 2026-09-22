import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TagRepository } from "../../domain/ports";
import type { TagSuggestionDto } from "@repo/contracts";

export class SuggestTagsUseCase {
  constructor(private readonly tagRepository: TagRepository) {}

  async execute(input: { query: string; limit?: number }, actor: AuthenticatedUser): Promise<TagSuggestionDto[]> {
    return this.tagRepository.suggest({ userId: actor.userId, query: input.query, limit: input.limit ?? 10 });
  }
}
