import { sql } from "drizzle-orm";
import type { Actor, EventArtifactRelationKind, EventKind } from "../../../../domain";
import type { ArtifactEventLink, ArtifactEventLinkQuery } from "../../../../domain/ports";
import type { Db } from "../../shared/tx";

interface LinkRow extends Record<string, unknown> {
  artifact_id: string;
  task_id: string;
  relation: EventArtifactRelationKind;
  name: string;
  actor: Actor;
  kind: EventKind;
  started_at: Date | null;
  estimated_finish_at: Date | null;
}

export class PostgresArtifactEventLinkQuery implements ArtifactEventLinkQuery {
  constructor(private readonly db: Db) {}

  async linksOf(artifactIds: readonly string[]): Promise<Map<string, ArtifactEventLink[]>> {
    const links = new Map<string, ArtifactEventLink[]>();
    if (artifactIds.length === 0) return links;

    const result = await this.db.execute<LinkRow>(sql`
      SELECT r.artifact_id, e.id AS task_id, r.relation, e.name, e.actor, e.kind, e.started_at, e.estimated_finish_at
      FROM task_artifact_relation r
      JOIN tasks e ON e.id = r.task_id
      WHERE r.artifact_id IN ${[...artifactIds]} AND e.deleted_at IS NULL AND e.kind <> 'step'
      ORDER BY r.artifact_id, e.started_at NULLS LAST, e.id
    `);

    for (const row of result.rows) {
      const link: ArtifactEventLink = {
        eventId: row.task_id,
        relation: row.relation,
        name: row.name,
        actor: row.actor,
        kind: row.kind,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        estimatedFinishAt: row.estimated_finish_at ? new Date(row.estimated_finish_at) : undefined,
      };
      const bucket = links.get(row.artifact_id);
      if (bucket) bucket.push(link);
      else links.set(row.artifact_id, [link]);
    }
    return links;
  }
}
