import type { TagSuggestionDto } from "../contracts/tag-suggestion.dto";

/**
 * Porta antiga isolada durante o corte (Task 8 a 12) e removida na contracao
 * final. FirestoreTagRepository continua implementando-a; o TagRepository
 * final so tem suggest com userId.
 */
export interface LegacyTagRepository {
  upsertMany(tags: string[], createdBy: string): Promise<void>;
  suggest(params: { query: string; limit: number }): Promise<TagSuggestionDto[]>;
}
