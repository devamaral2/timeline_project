import { Event, type ArtifactLink } from "../../../../domain";
import type * as schema from "../../database/schema";
import { occurrenceLinkOf } from "../../recurrences/mappers/occurrence-columns";

export type EventRow = typeof schema.events.$inferSelect;

/** O que vem das outras tabelas para completar o agregado. */
export interface EventRowParts {
  tags?: readonly string[];
  artifactLinks?: readonly ArtifactLink[];
  nextIds?: readonly string[];
  previousIds?: readonly string[];
}

export function mapEventRow(row: EventRow, parts: EventRowParts = {}): Event {
  return Event.rehydrate({
    id: row.id,
    userId: row.userId,
    actor: row.actor,
    kind: row.kind,
    status: row.status ?? undefined,
    priority: row.priority,
    name: row.name,
    description: row.description,
    location: row.location,
    startedAt: row.startedAt ?? undefined,
    estimatedFinishAt: row.estimatedFinishAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    notifyOffsetsMinutes: [...row.notifyOffsetsMinutes],
    tags: [...(parts.tags ?? [])],
    longRunning: row.longRunning,
    data: (row.data ?? {}) as Record<string, unknown>,
    artifactLinks: [...(parts.artifactLinks ?? [])],
    nextIds: [...(parts.nextIds ?? [])],
    previousIds: [...(parts.previousIds ?? [])],
    occurrence: occurrenceLinkOf(row),
    revision: row.revision,
  });
}
