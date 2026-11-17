import type { TagRepository, TagSuggestionDto } from "../../../domain/ports";
import type { InMemoryTaskDatabase } from "./in-memory-task-database";

export class InMemoryTagRepository implements TagRepository {
  constructor(private readonly database: InMemoryTaskDatabase) {}

  async suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    const query = params.query.trim().toLowerCase();
    const names = new Set<string>();
    for (const task of this.database.tasks) {
      if (task.userId !== params.userId) continue;
      for (const tag of task.tags) {
        if (tag.startsWith(query)) names.add(tag);
      }
    }
    return [...names].sort().slice(0, params.limit).map((name) => ({ id: name, name }));
  }
}
