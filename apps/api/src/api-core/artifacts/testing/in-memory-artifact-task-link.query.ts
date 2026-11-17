import type { ArtifactTaskLink, ArtifactTaskLinkQuery } from "../../../domain/ports";
import type { InMemoryTaskDatabase } from "../../tasks/testing/in-memory-task-database";

/** Onde cada artefato aparece, lido do banco em memoria com a mesma semantica de `PostgresArtifactTaskLinkQuery`. */
export class InMemoryArtifactTaskLinkQuery implements ArtifactTaskLinkQuery {
  constructor(private readonly database: InMemoryTaskDatabase) {}

  async linksOf(artifactIds: readonly string[]): Promise<Map<string, ArtifactTaskLink[]>> {
    const links = new Map<string, ArtifactTaskLink[]>();

    // Do mais antigo ao mais novo; os sem inicio vem no fim. Os passos de agente ficam de fora.
    const tasks = this.database.tasks
      .filter((task) => task.kind !== "step")
      .sort((left, right) => {
        const leftStart = left.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightStart = right.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (leftStart !== rightStart) return leftStart - rightStart;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      });

    for (const artifactId of new Set(artifactIds)) {
      for (const task of tasks) {
        const relation = task.artifactLinks.find((link) => link.artifactId === artifactId)?.relation;
        if (!relation) continue;
        const link: ArtifactTaskLink = {
          taskId: task.id,
          relation,
          name: task.name,
          actor: task.actor,
          kind: task.kind,
          startedAt: task.startedAt,
          estimatedFinishAt: task.estimatedFinishAt,
        };
        const bucket = links.get(artifactId);
        if (bucket) bucket.push(link);
        else links.set(artifactId, [link]);
      }
    }
    return links;
  }
}
