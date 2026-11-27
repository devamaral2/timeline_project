import { Task, type ArtifactLink } from "../../../../domain/index";
import type * as schema from "../../database/schema/index";
import { occurrenceLinkOf } from "../../recurrences/mappers/occurrence-columns";

export type TaskRow = typeof schema.tasks.$inferSelect;

/** O que vem das outras tabelas para completar o agregado. */
export interface TaskRowParts {
  tags?: readonly string[];
  artifactLinks?: readonly ArtifactLink[];
  parentId?: string;
  subtaskIds?: readonly string[];
}

export function mapTaskRow(row: TaskRow, parts: TaskRowParts = {}): Task {
  return Task.rehydrate({
    id: row.id,
    userId: row.userId,
    actor: row.actor,
    kind: row.kind,
    status: row.status ?? undefined,
    priority: row.priority,
    name: row.name,
    description: row.description,
    location: row.location ?? undefined,
    startedAt: row.startedAt ?? undefined,
    estimatedFinishAt: row.estimatedFinishAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    notifyOffsetsMinutes: [...row.notifyOffsetsMinutes],
    tags: [...(parts.tags ?? [])],
    longRunning: row.longRunning,
    data: (row.data ?? {}) as Record<string, unknown>,
    artifactLinks: [...(parts.artifactLinks ?? [])],
    parentId: parts.parentId,
    subtaskIds: [...(parts.subtaskIds ?? [])],
    occurrence: occurrenceLinkOf(row),
    projectId: row.projectId,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
