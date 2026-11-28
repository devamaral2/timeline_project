import type { TaskRequestLink, TaskRequestLinkQuery, TaskRequestRelationKind } from "../../../../domain/ports";
import { c, rowDecoder } from "../../sqlite/columns";
import { sql } from "../../sqlite/sql";
import type { Db } from "../../shared/tx";

const linkRow = rowDecoder({
  requestId: c.text,
  relation: c.text,
  name: c.text,
  createdAt: c.timestamp,
});

export class SqliteTaskRequestLinkQuery implements TaskRequestLinkQuery {
  constructor(private readonly db: Db) {}

  async linksOf(taskId: string): Promise<TaskRequestLink[]> {
    const rows = await this.db.all(
      sql`
        SELECT e.id AS "requestId", r.relation AS "relation", e.name AS "name", r.created_at AS "createdAt"
        FROM task_task_relation r
        JOIN tasks e ON e.id = r.from_task_id
        WHERE r.to_task_id = ${taskId}
          AND r.relation IN ('generates', 'updates')
          AND e.actor = 'agent' AND e.kind <> 'step' AND e.deleted_at IS NULL
        ORDER BY r.created_at, e.id`,
      linkRow,
    );
    return rows.map((row) => ({
      requestId: row.requestId,
      relation: row.relation as TaskRequestRelationKind,
      name: row.name,
      at: row.createdAt,
    }));
  }
}
