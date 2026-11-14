import {
  Event,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type ArtifactLink,
  type ArtifactWrites,
  type OccurrenceLink,
  type Recurrence,
} from "../../../domain";
import type { RecurrenceRepository } from "../../../domain/ports";
import type { InMemoryEventDatabase } from "../../events/testing/in-memory-event-database";

/**
 * O mesmo evento com algo trocado, sem contar como revisao: e como o banco
 * mexe numa linha por fora de uma edicao do usuario (soltar a ocorrencia da
 * serie apagada, ligar a ocorrencia nova ao evento maior).
 */
function rewrite(
  event: Event,
  changes: { subtaskIds?: string[]; artifactLinks?: ArtifactLink[]; occurrence?: OccurrenceLink | undefined },
): Event {
  return Event.rehydrate({
    id: event.id,
    userId: event.userId,
    actor: event.actor,
    kind: event.kind,
    status: event.status,
    priority: event.priority,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt,
    estimatedFinishAt: event.estimatedFinishAt,
    finishedAt: event.finishedAt,
    notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
    tags: [...event.tags],
    longRunning: event.longRunning,
    data: { ...event.data },
    artifactLinks: changes.artifactLinks ?? [...event.artifactLinks],
    subtaskIds: changes.subtaskIds ?? [...event.subtaskIds],
    blocksIds: [...event.blocksIds],
    occurrence: "occurrence" in changes ? changes.occurrence : event.occurrence,
    revision: event.revision,
  });
}

/**
 * Fake com as ocorrencias de verdade: gera os eventos no mesmo banco em
 * memoria dos testes de eventos, para que os testes possam ler o que a serie
 * produziu pela agenda e pela lista de tarefas.
 */
export class InMemoryRecurrenceRepository implements RecurrenceRepository {
  recurrences: Recurrence[] = [];
  readonly exceptions = new Map<string, Set<string>>();

  constructor(readonly events: InMemoryEventDatabase) {}

  async save(recurrence: Recurrence, artifacts?: ArtifactWrites): Promise<void> {
    // Os artefatos antes: o template da serie aponta para eles.
    this.events.writeArtifacts(artifacts);
    this.recurrences.push(recurrence);
  }

  async update(
    recurrence: Recurrence,
    actorUserId: string,
    expectedRevision: number,
    fromDay: string,
    artifacts?: ArtifactWrites,
  ): Promise<void> {
    const index = this.recurrences.findIndex((stored) => stored.id === recurrence.id);
    if (index === -1) throw new RecurrenceNotFoundError(`Recurrence not found: ${recurrence.id}`);
    const existing = this.recurrences[index] as Recurrence;
    if (existing.userId !== actorUserId) throw new RecurrenceOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new RecurrenceRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }
    this.events.writeArtifacts(artifacts);
    this.recurrences[index] = recurrence;
    this.dropUpcoming(recurrence.id, fromDay);
  }

  async delete(recurrenceId: string, actorUserId: string, fromDay: string): Promise<void> {
    const existing = await this.findById(recurrenceId);
    if (!existing) throw new RecurrenceNotFoundError(`Recurrence not found: ${recurrenceId}`);
    if (existing.userId !== actorUserId) throw new RecurrenceOwnershipError();

    this.dropUpcoming(recurrenceId, fromDay);
    // As que ficam sao historia: perdem o vinculo com a serie, e a relacao herdada dela vira da propria ocorrencia.
    this.events.events = this.events.events.map((event) =>
      event.occurrence?.recurrenceId === recurrenceId
        ? rewrite(event, {
            occurrence: undefined,
            artifactLinks: event.artifactLinks.map((link) => ({ ...link, fromRecurrence: false })),
          })
        : event,
    );
    this.recurrences = this.recurrences.filter((stored) => stored.id !== recurrenceId);
    this.exceptions.delete(recurrenceId);
  }

  async findById(recurrenceId: string): Promise<Recurrence | null> {
    return this.recurrences.find((stored) => stored.id === recurrenceId) ?? null;
  }

  async findNextOccurrenceId(recurrenceId: string, fromDay: string): Promise<string | null> {
    const upcoming = this.events.events
      .filter(
        (event) =>
          event.occurrence?.recurrenceId === recurrenceId &&
          !event.occurrence.detached &&
          event.occurrence.occurrenceOn >= fromDay,
      )
      .sort((left, right) => (left.occurrence?.occurrenceOn ?? "").localeCompare(right.occurrence?.occurrenceOn ?? ""));
    return upcoming[0]?.id ?? null;
  }

  async listByUserId(userId: string): Promise<Recurrence[]> {
    return this.recurrences
      .filter((stored) => stored.userId === userId)
      .sort((left, right) => left.rule.startsOn.localeCompare(right.rule.startsOn) || left.id.localeCompare(right.id));
  }

  async listPendingMaterialization(userId: string, horizon: string): Promise<Recurrence[]> {
    return this.recurrences.filter((stored) => {
      if (stored.userId !== userId) return false;
      const through = stored.materializedThrough;
      if (through === undefined) return true;
      // Uma serie que ja foi gerada ate o ultimo dia dela nao tem mais nada a fazer.
      return through < horizon && (stored.rule.endsOn === undefined || through < stored.rule.endsOn);
    });
  }

  async listExceptions(recurrenceId: string): Promise<string[]> {
    return [...(this.exceptions.get(recurrenceId) ?? [])];
  }

  async addException(recurrenceId: string, dayKey: string): Promise<void> {
    const days = this.exceptions.get(recurrenceId) ?? new Set<string>();
    days.add(dayKey);
    this.exceptions.set(recurrenceId, days);
  }

  async materialize(recurrence: Recurrence, occurrences: Event[], parentIds: readonly string[] = []): Promise<void> {
    const index = this.recurrences.findIndex((stored) => stored.id === recurrence.id);
    // A regra mudou no meio do caminho: estas ocorrencias sao da regra velha, e nada e gravado.
    if (index === -1 || (this.recurrences[index] as Recurrence).revision !== recurrence.revision) {
      throw new RecurrenceRevisionConflictError(`Recurrence ${recurrence.id} changed while materializing`);
    }

    // Um evento maior que sumiu nao pode ganhar subtarefa: a serie avanca sem gerar nada.
    const parents = [...new Set(parentIds)].filter((parentId) =>
      this.events.events.some((event) => event.id === parentId && event.userId === recurrence.userId),
    );
    const inserted: string[] = [];
    for (const occurrence of parents.length < new Set(parentIds).size ? [] : occurrences) {
      const day = occurrence.occurrence?.occurrenceOn;
      // O indice unico do Postgres: um dia da serie existe uma vez so.
      const taken = this.events.events.some(
        (stored) => stored.occurrence?.recurrenceId === recurrence.id && stored.occurrence.occurrenceOn === day,
      );
      if (taken) continue;
      this.events.events.push(occurrence);
      inserted.push(occurrence.id);
    }

    // A relacao faz parte da criacao da ocorrencia: nao conta como edicao do evento maior.
    if (inserted.length > 0 && parents.length > 0) {
      this.events.events = this.events.events.map((event) =>
        parents.includes(event.id) ? rewrite(event, { subtaskIds: [...event.subtaskIds, ...inserted] }) : event,
      );
    }
    this.recurrences[index] = recurrence;
  }

  private dropUpcoming(recurrenceId: string, fromDay: string): void {
    this.events.events = this.events.events.filter(
      (event) =>
        event.occurrence?.recurrenceId !== recurrenceId ||
        event.occurrence.detached ||
        event.occurrence.occurrenceOn < fromDay,
    );
  }
}
