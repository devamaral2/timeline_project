import { ACTORS, TASK_ARTIFACT_RELATIONS, TASK_KINDS } from "../../../../domain/sets";
import type { ArtifactTaskLink, ArtifactTaskLinkQuery } from "../../../../domain/ports";
import { c, rowDecoder, sql } from "@repo/sqlite";
import type { Db } from "../../shared/tx";

const linkRow = rowDecoder({
  artifactId: c.text,
  taskId: c.text,
  relation: c.oneOf(TASK_ARTIFACT_RELATIONS),
  name: c.text,
  actor: c.oneOf(ACTORS),
  kind: c.oneOf(TASK_KINDS),
  startedAt: c.timestamp.nullable(),
  estimatedFinishAt: c.timestamp.nullable(),
});

export class SqliteArtifactTaskLinkQuery implements ArtifactTaskLinkQuery {
  constructor(private readonly db: Db) {}

  async linksOf(artifactIds: readonly string[]): Promise<Map<string, ArtifactTaskLink[]>> {
    const links = new Map<string, ArtifactTaskLink[]>();
    if (artifactIds.length === 0) return links;

    const rows = await this.db.all(
      sql`
        SELECT r.artifact_id AS "artifactId", e.id AS "taskId", r.relation AS "relation", e.name AS "name",
          e.actor AS "actor", e.kind AS "kind", e.started_at AS "startedAt", e.estimated_finish_at AS "estimatedFinishAt"
        FROM task_artifact_relation r
        JOIN tasks e ON e.id = r.task_id
        WHERE r.artifact_id IN ${sql.in(artifactIds)} AND e.deleted_at IS NULL AND e.kind <> 'step'
        ORDER BY r.artifact_id, e.started_at NULLS LAST, e.id`,
      linkRow,
    );

    for (const row of rows) {
      const link: ArtifactTaskLink = {
        taskId: row.taskId,
        relation: row.relation,
        name: row.name,
        actor: row.actor,
        kind: row.kind,
        startedAt: row.startedAt ?? undefined,
        estimatedFinishAt: row.estimatedFinishAt ?? undefined,
      };
      const bucket = links.get(row.artifactId);
      if (bucket) bucket.push(link);
      else links.set(row.artifactId, [link]);
    }
    return links;
  }
}
