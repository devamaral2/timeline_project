import type { TagRepository, TagSuggestionDto } from "../../../../domain/ports";
import { sql } from "../../sqlite/sql";
import type { Db } from "../../shared/tx";

function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class SqliteTagRepository implements TagRepository {
  constructor(private readonly db: Db) {}

  async suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    const prefix = `${escapeLikePrefix(params.query.trim().toLowerCase())}%`;

    return this.db.all<TagSuggestionDto>(sql`
      SELECT id, name
      FROM tags
      WHERE user_id = ${params.userId}
        AND name LIKE ${prefix} ESCAPE '\\'
      ORDER BY name
      LIMIT ${params.limit}
    `);
  }
}
