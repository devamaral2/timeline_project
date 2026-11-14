import type { Artifact, Event, Recurrence } from "../../domain";
import type { EventCard } from "../../domain/ports";
import type { ArtifactType, EventCardDto, EventDto, EventRecurrenceDto } from "@repo/contracts";
import { toArtifactDto } from "./artifact.dto";

function recurrenceOf(event: Event, recurrence: Recurrence | undefined): EventRecurrenceDto | undefined {
  if (!event.occurrence || !recurrence) return undefined;
  return {
    id: recurrence.id,
    occurrenceOn: event.occurrence.occurrenceOn,
    detached: event.occurrence.detached,
    rule: { ...recurrence.rule },
  };
}

/** O cartao da agenda e da lista de tarefas: o dado como esta gravado, sem rotulos. */
export function toEventCardDto({ event, artifactTypes, recurrence }: EventCard): EventCardDto {
  const series = recurrenceOf(event, recurrence);
  return {
    id: event.id,
    actor: event.actor,
    kind: event.kind,
    ...(event.status ? { status: event.status } : {}),
    priority: event.priority,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt?.toISOString(),
    estimatedFinishAt: event.estimatedFinishAt?.toISOString(),
    finishedAt: event.finishedAt?.toISOString(),
    longRunning: event.longRunning,
    notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
    tags: event.tags,
    artifactTypes: artifactTypes as ArtifactType[],
    parentEventIds: [...event.parentIds],
    blockedByEventIds: [...event.blockedByIds],
    ...(series ? { recurrence: series } : {}),
    revision: event.revision,
  };
}

/**
 * `artifacts` sao os artefatos do evento em qualquer ordem: a ordem e a das
 * relacoes (`event.artifactLinks`), e um artefato apagado simplesmente nao aparece.
 */
export function toEventDto(event: Event, artifacts: readonly Artifact[] = [], recurrence?: Recurrence): EventDto {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const linked = event.artifactLinks.flatMap((link) => {
    const artifact = byId.get(link.artifactId);
    return artifact ? [{ link, artifact }] : [];
  });
  return {
    ...toEventCardDto({ event, artifactTypes: linked.map(({ artifact }) => artifact.type), recurrence }),
    artifacts: linked.map(({ link, artifact }) => ({
      relation: link.relation,
      fromRecurrence: link.fromRecurrence,
      artifact: toArtifactDto(artifact),
    })),
    subtaskEventIds: [...event.subtaskIds],
    blocksEventIds: [...event.blocksIds],
  };
}
