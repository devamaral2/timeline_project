import { EventNotFoundError, EventOwnershipError, EventValidationError } from "../../../domain";
import type { EventRepository, SequenceChange } from "../../../domain/ports";

/** A ordem de um evento hoje: de quais ele se segue e quais se seguem a ele. */
export interface SequenceOfEvent {
  previousIds: readonly string[];
  nextIds: readonly string[];
}

/**
 * As arestas a gravar para que `eventId` se siga exatamente de
 * `desired.previousIds` e tenha como sequencia exatamente `desired.nextIds`,
 * dado onde ele esta hoje (`current`). Lista ausente nao muda aquele lado.
 *
 * A sequencia nao e campo de nenhum dos dois eventos: nenhum e revisado, e o
 * de agente tambem pode ser ponta. Toda ponta nova precisa existir e ser do
 * usuario; a conferencia de ciclo e feita na escrita.
 */
export async function planSequence(
  eventId: string,
  current: SequenceOfEvent,
  desired: Partial<SequenceOfEvent>,
  events: Pick<EventRepository, "findByIds">,
  actorUserId: string,
): Promise<SequenceChange[]> {
  const changes: SequenceChange[] = [];
  const diff = (before: readonly string[], after: readonly string[] | undefined, edge: (otherId: string) => Pick<SequenceChange, "fromId" | "toId">) => {
    if (after === undefined) return;
    const wanted = new Set(after);
    for (const id of wanted) if (!before.includes(id)) changes.push({ op: "add", ...edge(id) });
    for (const id of before) if (!wanted.has(id)) changes.push({ op: "remove", ...edge(id) });
  };
  diff(current.previousIds, desired.previousIds, (id) => ({ fromId: id, toId: eventId }));
  diff(current.nextIds, desired.nextIds, (id) => ({ fromId: eventId, toId: id }));
  if (changes.length === 0) return [];
  if (changes.some((change) => change.fromId === change.toId)) {
    throw new EventValidationError("An event cannot follow itself");
  }

  const added = [...new Set(changes.filter((change) => change.op === "add").flatMap((change) => [change.fromId, change.toId]))]
    .filter((id) => id !== eventId);
  if (added.length > 0) {
    const found = new Map((await events.findByIds(added)).map((event) => [event.id, event]));
    for (const id of added) {
      const other = found.get(id);
      if (!other) throw new EventNotFoundError(`Event not found: ${id}`);
      if (other.userId !== actorUserId) throw new EventOwnershipError();
    }
  }
  return changes;
}
