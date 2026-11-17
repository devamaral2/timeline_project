import { Artifact, ArtifactValidationError } from "../../../../domain";
import type * as schema from "../../database/schema";

export type ArtifactRow = typeof schema.artifacts.$inferSelect;

export function mapArtifactRow(row: ArtifactRow, tags: string[] = []): Artifact {
  try {
    return Artifact.rehydrate({
      id: row.id,
      userId: row.userId ?? undefined,
      name: row.name,
      type: row.type,
      schemaVersion: row.schemaVersion,
      data: row.data,
      tags,
      derived: row.derived,
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ArtifactValidationError(`Invalid artifact ${row.id}: ${message}`);
  }
}
