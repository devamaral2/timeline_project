import { sql } from "drizzle-orm";
import type { TaskRequestLink, TaskRequestLinkQuery, TaskRequestRelationKind } from "../../../../domain/ports";
import type { Db } from "../../shared/tx";

interface LinkRow extends Record<string, unknown> {
  request_id: string;
  relation: TaskRequestRelationKind;
  name: string;
  created_at: Date;
}

export class PostgresTaskRequestLinkQuery implements TaskRequestLinkQuery {
  constructor(private readonly db: Db) {}

  async linksOf(taskId: string): Promise<TaskRequestLink[]> {
    const result = await this.db.execute<LinkRow>(sql`
      SELECT e.id AS request_id, r.relation, e.name, r.created_at
      FROM task_task_relation r
      JOIN tasks e ON e.id = r.from_task_id
      WHERE r.to_task_id = ${taskId}
        AND r.relation IN ('generates', 'updates')
        AND e.actor = 'agent' AND e.kind <> 'step' AND e.deleted_at IS NULL
      ORDER BY r.created_at, e.id
    `);
    return result.rows.map((row) => ({
      requestId: row.request_id,
      relation: row.relation,
      name: row.name,
      at: new Date(row.created_at),
    }));
  }
}
