import type { TagRepository, TagSuggestionDto } from "@repo/entities/ports";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

export class InMemoryTagRepository implements TagRepository {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    const query = params.query.trim().toLowerCase();
    const names = new Set<string>();
    for (const event of this.database.events) {
      if (event.userId !== params.userId) continue;
      for (const tag of event.tags) {
        if (tag.startsWith(query)) names.add(tag);
      }
    }
    return [...names].sort().slice(0, params.limit).map((name) => ({ id: name, name }));
  }
}
