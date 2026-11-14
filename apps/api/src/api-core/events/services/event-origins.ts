import { EventNotFoundError, EventOwnershipError, EventValidationError, type Event } from "../../../domain";
import type { EventRepository } from "../../../domain/ports";

/** Um evento de origem revisado, com a revisao lida quando a mudanca foi montada. */
export interface OriginUpdate {
  event: Event;
  expectedRevision: number;
}

/** Onde o evento passa a aparecer como destino: de quais eventos maiores ele e subtarefa e quais o bloqueiam. */
export interface IncomingRelations {
  parentIds: readonly string[];
  blockedByIds: readonly string[];
}

/**
 * As mudancas nos eventos de origem que fazem `eventId` ser subtarefa
 * exatamente de `desired.parentIds` e bloqueado exatamente por
 * `desired.blockedByIds`, dado onde ele esta hoje (`current`).
 *
 * A relacao pertence ao evento de origem: entrar ou sair dela conta como
 * edita-lo. Por isso cada origem tocada e revisada (ganha uma revisao e, se
 * for ocorrencia de uma serie, e destacada dela), e o destino nao e tocado.
 * Toda origem precisa existir, ser do usuario e ser um evento de pessoa.
 */
export async function planIncomingRelations(
  eventId: string,
  current: IncomingRelations,
  desired: Partial<IncomingRelations>,
  events: Pick<EventRepository, "findByIds">,
  actorUserId: string,
): Promise<OriginUpdate[]> {
  const changes = new Map<string, { subtask?: "add" | "remove"; blocks?: "add" | "remove" }>();
  const plan = (relation: "subtask" | "blocks", before: readonly string[], after: readonly string[] | undefined) => {
    if (after === undefined) return;
    for (const id of after) {
      if (!before.includes(id)) changes.set(id, { ...changes.get(id), [relation]: "add" });
    }
    for (const id of before) {
      if (!after.includes(id)) changes.set(id, { ...changes.get(id), [relation]: "remove" });
    }
  };
  plan("subtask", current.parentIds, desired.parentIds);
  plan("blocks", current.blockedByIds, desired.blockedByIds);
  if (changes.size === 0) return [];
  if (changes.has(eventId)) throw new EventValidationError("An event cannot be related to itself");

  const found = await events.findByIds([...changes.keys()]);
  const byId = new Map(found.map((event) => [event.id, event]));

  return [...changes].map(([originId, change]) => {
    const origin = byId.get(originId);
    if (!origin) throw new EventNotFoundError(`Event not found: ${originId}`);
    if (origin.userId !== actorUserId) throw new EventOwnershipError();

    const apply = (ids: readonly string[], op: "add" | "remove" | undefined): string[] | undefined => {
      if (op === "add") return [...ids, eventId];
      if (op === "remove") return ids.filter((id) => id !== eventId);
      return undefined;
    };
    return {
      event: origin.revise({
        subtaskIds: apply(origin.subtaskIds, change.subtask),
        blocksIds: apply(origin.blocksIds, change.blocks),
      }),
      expectedRevision: origin.revision,
    };
  });
}
