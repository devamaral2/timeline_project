export interface TagSuggestionDto {
  id: string;
  name: string;
}

export interface TagRepository {
  upsertMany(tags: string[], createdBy: string): Promise<void>;
  suggest(params: { query: string; limit: number }): Promise<TagSuggestionDto[]>;
}
