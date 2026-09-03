import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TagRepository, TagSuggestionDto } from "@repo/entities/ports";
import * as schema from "../../database/schema";

function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class PostgresTagRepository implements TagRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    const prefix = `${escapeLikePrefix(params.query.trim().toLowerCase())}%`;

    const result = await this.db.execute<{ id: string; name: string }>(sql`
      SELECT id, name
      FROM tags
      WHERE user_id = ${params.userId}
        AND name LIKE ${prefix} ESCAPE '\\'
      ORDER BY name
      LIMIT ${params.limit}
    `);

    return result.rows.map((row) => ({ id: row.id, name: row.name }));
  }
}
