import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NoteLinkQuery, NoteLinkSummary } from "../../../../domain/ports";
import * as schema from "../../database/schema";

interface LinkRow extends Record<string, unknown> {
  note_id: string;
  kind: "event" | "task";
  id: string;
  name: string;
  event_kind: string | null;
  at: Date | null;
  ends_at: Date | null;
}

export class PostgresNoteLinkQuery implements NoteLinkQuery {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async linksOf(noteIds: readonly string[]): Promise<Map<string, NoteLinkSummary[]>> {
    const links = new Map<string, NoteLinkSummary[]>();
    if (noteIds.length === 0) return links;

    const ids = [...noteIds];
    const result = await this.db.execute<LinkRow>(sql`
      SELECT en.note_id, 'event' AS kind, e.id, e.name, e.kind::text AS event_kind, e.started_at AS at, e.finished_at AS ends_at
      FROM event_notes en
      JOIN events e ON e.id = en.event_id
      WHERE en.note_id IN ${ids} AND e.deleted_at IS NULL
      UNION ALL
      SELECT tn.note_id, 'task' AS kind, t.id, t.name, NULL AS event_kind,
             COALESCE(t.started_at, t.estimated_finish_at) AS at, NULL AS ends_at
      FROM task_notes tn
      JOIN tasks t ON t.id = tn.task_id
      WHERE tn.note_id IN ${ids} AND t.deleted_at IS NULL
      ORDER BY kind, at NULLS LAST, id
    `);

    for (const row of result.rows) {
      const noteId = row.note_id.trim();
      const link: NoteLinkSummary = {
        kind: row.kind,
        id: row.id.trim(),
        name: row.name,
        ...(row.event_kind ? { eventKind: row.event_kind } : {}),
        ...(row.at ? { at: new Date(row.at) } : {}),
        ...(row.ends_at ? { endsAt: new Date(row.ends_at) } : {}),
      };
      links.set(noteId, [...(links.get(noteId) ?? []), link]);
    }
    return links;
  }
}
