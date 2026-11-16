import type { Artifact } from "../../domain";
import type { ArtifactTaskLink } from "../../domain/ports";
import type { ArtifactDto, ArtifactTaskLinkDto } from "@repo/contracts";

export function toArtifactTaskLinkDto(link: ArtifactTaskLink): ArtifactTaskLinkDto {
  return {
    taskId: link.taskId,
    relation: link.relation,
    name: link.name,
    actor: link.actor,
    kind: link.kind,
    ...(link.startedAt ? { startedAt: link.startedAt.toISOString() } : {}),
    ...(link.estimatedFinishAt ? { estimatedFinishAt: link.estimatedFinishAt.toISOString() } : {}),
  };
}

/** `tasks`: onde o artefato aparece. Ausente nos artefatos que viajam dentro de uma tarefa ou da resposta do agente. */
export function toArtifactDto(artifact: Artifact, tasks?: readonly ArtifactTaskLink[]): ArtifactDto {
  return {
    id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    schemaVersion: artifact.schemaVersion,
    data: artifact.data,
    global: artifact.isGlobal,
    derived: artifact.derived,
    ...(tasks ? { tasks: tasks.map(toArtifactTaskLinkDto) } : {}),
    tags: artifact.tags,
    revision: artifact.revision,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  } as ArtifactDto;
}
