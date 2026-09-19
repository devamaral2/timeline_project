import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import * as schema from "../database/schema";
import type { Tx } from "../events/repositories/postgres-event.repository";

/** Tag e uma so por usuario e nome, seja de evento, tarefa ou nota. */
export async function upsertTagIds(tx: Tx, userId: string, names: readonly string[]): Promise<string[]> {
  const tagIds: string[] = [];
  for (const name of names) {
    const [row] = await tx
      .insert(schema.tags)
      .values({ id: ulid(), userId, name })
      .onConflictDoUpdate({
        target: [schema.tags.userId, schema.tags.name],
        set: { name: sql`excluded.name` },
      })
      .returning({ id: schema.tags.id });
    tagIds.push(row.id);
  }
  return tagIds;
}
