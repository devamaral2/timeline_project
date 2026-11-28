import { ulid } from "ulid";
import { sql } from "../sqlite/sql";
import { tags } from "../database/tables";
import type { Tx } from "./tx";

/** Tag e uma so por usuario e nome, seja de tarefa ou de artefato. */
export async function upsertTagIds(tx: Tx, userId: string, names: readonly string[]): Promise<string[]> {
  const tagIds: string[] = [];
  for (const name of names) {
    const row = await tx.get<{ id: string }>(sql`
      ${tags.insert({ id: ulid(), userId, name })}
      ON CONFLICT (user_id, name) DO UPDATE SET name = excluded.name
      RETURNING id`);
    tagIds.push(row!.id);
  }
  return tagIds;
}
