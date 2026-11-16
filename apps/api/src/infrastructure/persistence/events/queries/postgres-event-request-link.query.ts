import { sql } from "drizzle-orm";
import type { EventRequestLink, EventRequestLinkQuery, EventRequestRelationKind } from "../../../../domain/ports";
import type { Db } from "../../shared/tx";

interface LinkRow extends Record<string, unknown> {
  request_id: string;
  relation: EventRequestRelationKind;
  name: string;
  created_at: Date;
}

export class PostgresEventRequestLinkQuery implements EventRequestLinkQuery {
  constructor(private readonly db: Db) {}

  async linksOf(eventId: string): Promise<EventRequestLink[]> {
    const result = await this.db.execute<LinkRow>(sql`
      SELECT e.id AS request_id, r.relation, e.name, r.created_at
      FROM event_event_relation r
      JOIN events e ON e.id = r.from_event_id
      WHERE r.to_event_id = ${eventId}
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
