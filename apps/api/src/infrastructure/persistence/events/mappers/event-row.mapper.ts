import { Event, type ArtifactLink } from "../../../../domain";
import type * as schema from "../../database/schema";
import { occurrenceLinkOf } from "../../recurrences/mappers/occurrence-columns";

export type EventRow = typeof schema.events.$inferSelect;

/** O que vem das outras tabelas para completar o agregado. */
export interface EventRowParts {
  tags?: readonly string[];
  artifactLinks?: readonly ArtifactLink[];
  subtaskIds?: readonly string[];
  blocksIds?: readonly string[];
  parentIds?: readonly string[];
  blockedByIds?: readonly string[];
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
    startedAt: row.startedAt ?? undefined,
    estimatedFinishAt: row.estimatedFinishAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    notifyOffsetsMinutes: [...row.notifyOffsetsMinutes],
    tags: [...(parts.tags ?? [])],
    longRunning: row.longRunning,
    data: (row.data ?? {}) as Record<string, unknown>,
    artifactLinks: [...(parts.artifactLinks ?? [])],
    subtaskIds: [...(parts.subtaskIds ?? [])],
    blocksIds: [...(parts.blocksIds ?? [])],
    parentIds: [...(parts.parentIds ?? [])],
    blockedByIds: [...(parts.blockedByIds ?? [])],
    occurrence: occurrenceLinkOf(row),
    revision: row.revision,
  });
}
