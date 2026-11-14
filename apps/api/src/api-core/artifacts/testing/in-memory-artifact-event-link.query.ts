import type { ArtifactEventLink, ArtifactEventLinkQuery } from "../../../domain/ports";
import type { InMemoryEventDatabase } from "../../events/testing/in-memory-event-database";

/** Onde cada artefato aparece, lido do banco em memoria com a mesma semantica de `PostgresArtifactEventLinkQuery`. */
export class InMemoryArtifactEventLinkQuery implements ArtifactEventLinkQuery {
  constructor(private readonly database: InMemoryEventDatabase) {}

  async linksOf(artifactIds: readonly string[]): Promise<Map<string, ArtifactEventLink[]>> {
    const links = new Map<string, ArtifactEventLink[]>();

    // Do mais antigo ao mais novo; os sem inicio vem no fim. Os passos de agente ficam de fora.
    const events = this.database.events
      .filter((event) => event.kind !== "step")
      .sort((left, right) => {
        const leftStart = left.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightStart = right.startedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (leftStart !== rightStart) return leftStart - rightStart;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      });

    for (const artifactId of new Set(artifactIds)) {
      for (const event of events) {
        const relation = event.artifactLinks.find((link) => link.artifactId === artifactId)?.relation;
        if (!relation) continue;
        const link: ArtifactEventLink = {
          eventId: event.id,
          relation,
          name: event.name,
          actor: event.actor,
          kind: event.kind,
          startedAt: event.startedAt,
          estimatedFinishAt: event.estimatedFinishAt,
        };
        const bucket = links.get(artifactId);
        if (bucket) bucket.push(link);
        else links.set(artifactId, [link]);
      }
    }
    return links;
  }
}
