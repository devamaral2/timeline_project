import type { TagRepository, TagSuggestionDto } from "../../contracts/tag-repository";

export class InMemoryTagRepository implements TagRepository {
  readonly upsertedTags: string[] = [];

  async upsertMany(tags: string[], _createdBy: string): Promise<void> {
    this.upsertedTags.push(...[...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]);
  }

  async suggest(_params: { query: string; limit: number }): Promise<TagSuggestionDto[]> {
    return [];
  }
}
