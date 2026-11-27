import type { Artifact, ProjectRef, Task, Recurrence } from "../../domain";
import type { TaskCard, TaskRequestLink } from "../../domain/ports";
import type { ArtifactType, TaskCardDto, TaskDto, TaskRecurrenceDto } from "@repo/contracts";
import { toArtifactDto } from "./artifact.dto";

function recurrenceOf(task: Task, recurrence: Recurrence | undefined): TaskRecurrenceDto | undefined {
  if (!task.occurrence || !recurrence) return undefined;
  return {
    id: recurrence.id,
    occurrenceOn: task.occurrence.occurrenceOn,
    detached: task.occurrence.detached,
    rule: { ...recurrence.rule },
  };
}

/** O cartao da agenda e da lista de tarefas: o dado como esta gravado, sem rotulos. */
export function toTaskCardDto({ task, project, artifactTypes, recurrence }: TaskCard): TaskCardDto {
  const series = recurrenceOf(task, recurrence);
  return {
    id: task.id,
    actor: task.actor,
    kind: task.kind,
    ...(task.status ? { status: task.status } : {}),
    priority: task.priority,
    name: task.name,
    description: task.description,
    project: { id: project.id, name: project.name, personal: project.personal },
    ...(task.location ? { location: task.location } : {}),
    startedAt: task.startedAt?.toISOString(),
    estimatedFinishAt: task.estimatedFinishAt?.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
    longRunning: task.longRunning,
    notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
    tags: task.tags,
    artifactTypes: artifactTypes as ArtifactType[],
    ...(task.parentId ? { parentTaskId: task.parentId } : {}),
    ...(series ? { recurrence: series } : {}),
    revision: task.revision,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

/**
 * `artifacts` sao os artefatos da tarefa em qualquer ordem: a ordem e a das
 * relacoes (`task.artifactLinks`), e um artefato apagado simplesmente nao aparece.
 */
export function toTaskDto(
  task: Task,
  project: ProjectRef,
  artifacts: readonly Artifact[] = [],
  recurrence?: Recurrence,
  requests: readonly TaskRequestLink[] = [],
): TaskDto {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const linked = task.artifactLinks.flatMap((link) => {
    const artifact = byId.get(link.artifactId);
    return artifact ? [{ link, artifact }] : [];
  });
  return {
    ...toTaskCardDto({ task, project, artifactTypes: linked.map(({ artifact }) => artifact.type), recurrence }),
    artifacts: linked.map(({ link, artifact }) => ({
      relation: link.relation,
      fromRecurrence: link.fromRecurrence,
      artifact: toArtifactDto(artifact),
    })),
    subtaskIds: [...task.subtaskIds],
    requests: requests.map((link) => ({
      id: link.requestId,
      name: link.name,
      relation: link.relation,
      at: link.at.toISOString(),
    })),
  };
}
