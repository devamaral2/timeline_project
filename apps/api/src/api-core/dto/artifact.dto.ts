import type { Artifact } from "../../domain";
import type { ArtifactEventLink } from "../../domain/ports";
import type { ArtifactDto, ArtifactTaskLinkDto } from "@repo/contracts";

export function toArtifactEventLinkDto(link: ArtifactEventLink): ArtifactTaskLinkDto {
  return {
    taskId: link.eventId,
    relation: link.relation,
    name: link.name,
    actor: link.actor,
    kind: link.kind,
    ...(link.startedAt ? { startedAt: link.startedAt.toISOString() } : {}),
    ...(link.estimatedFinishAt ? { estimatedFinishAt: link.estimatedFinishAt.toISOString() } : {}),
  };
}

/** `events`: onde o artefato aparece. Ausente nos artefatos que viajam dentro de um evento ou da resposta do agente. */
export function toArtifactDto(artifact: Artifact, events?: readonly ArtifactEventLink[]): ArtifactDto {
  return {
    id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    schemaVersion: artifact.schemaVersion,
    data: artifact.data,
    global: artifact.isGlobal,
    derived: artifact.derived,
    ...(events ? { tasks: events.map(toArtifactEventLinkDto) } : {}),
    tags: artifact.tags,
    revision: artifact.revision,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  } as ArtifactDto;
}
