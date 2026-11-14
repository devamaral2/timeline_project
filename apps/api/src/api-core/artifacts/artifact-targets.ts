import { EventNotFoundError, EventOwnershipError, type Event, type EventArtifactRelationKind } from "../../domain";
import type { EventRepository, StagedChange } from "../../domain/ports";

/**
 * As mudancas nos eventos que fazem o artefato aparecer exatamente em
 * `desiredEventIds`, dado onde ele aparece hoje (`currentEventIds`). Quem entra
 * o recebe no fim da lista, com a relacao `relation`; quem sai perde a relacao.
 *
 * Quem registra o artefato e o evento: entrar ou sair da lista de um evento e
 * edita-lo. Todo evento tocado precisa existir e ser do usuario, e uma
 * ocorrencia de serie que ganha ou perde um artefato por aqui passa a ser so dela.
 */
export async function planArtifactLinks(
  artifactId: string,
  currentEventIds: readonly string[],
  desiredEventIds: readonly string[],
  events: Pick<EventRepository, "findByIds">,
  actorUserId: string,
  relation: EventArtifactRelationKind = "uses",
): Promise<StagedChange<Event>[]> {
  const added = desiredEventIds.filter((id) => !currentEventIds.includes(id));
  const removed = currentEventIds.filter((id) => !desiredEventIds.includes(id));
  const touched = [...added, ...removed];
  if (touched.length === 0) return [];

  const byId = new Map((await events.findByIds(touched)).map((event) => [event.id, event]));
  return touched.map((id) => {
    const event = byId.get(id);
    if (!event) throw new EventNotFoundError(`Event not found: ${id}`);
    if (event.userId !== actorUserId) throw new EventOwnershipError();

    const artifactLinks = added.includes(id)
      ? [...event.artifactLinks, { artifactId, relation, fromRecurrence: false }]
      : event.artifactLinks.filter((link) => link.artifactId !== artifactId);
    return { op: "update", entity: event.revise({ artifactLinks }), expectedRevision: event.revision };
  });
}

export function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}
