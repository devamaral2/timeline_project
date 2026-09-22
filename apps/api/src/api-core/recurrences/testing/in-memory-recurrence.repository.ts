import {
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type Event,
  type Recurrence,
  type Task,
} from "../../../domain";
import type { RecurrenceRepository } from "../../../domain/ports";
import type { InMemoryEventDatabase } from "../../events/testing/in-memory-event-database";

/**
 * Fake com as ocorrencias de verdade: gera eventos no mesmo banco em memoria
 * dos testes de eventos e tarefas numa lista propria, para que os testes
 * possam ler o que a serie produziu.
 */
export class InMemoryRecurrenceRepository implements RecurrenceRepository {
  recurrences: Recurrence[] = [];
  tasks: Task[] = [];
  readonly exceptions = new Map<string, Set<string>>();

  constructor(readonly events: InMemoryEventDatabase) {}

  async save(recurrence: Recurrence): Promise<void> {
    this.recurrences.push(recurrence);
  }

  async update(recurrence: Recurrence, actorUserId: string, expectedRevision: number, fromDay: string) {
    const index = this.recurrences.findIndex((stored) => stored.id === recurrence.id);
    if (index === -1) throw new RecurrenceNotFoundError(`Recurrence not found: ${recurrence.id}`);
    const existing = this.recurrences[index] as Recurrence;
    if (existing.userId !== actorUserId) throw new RecurrenceOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new RecurrenceRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }
    this.recurrences[index] = recurrence;
    this.dropUpcoming(recurrence.id, fromDay);
  }

  async delete(recurrenceId: string, actorUserId: string, fromDay: string) {
    const existing = await this.findById(recurrenceId);
    if (!existing) throw new RecurrenceNotFoundError(`Recurrence not found: ${recurrenceId}`);
    if (existing.userId !== actorUserId) throw new RecurrenceOwnershipError();
    this.dropUpcoming(recurrenceId, fromDay);
    this.recurrences = this.recurrences.filter((stored) => stored.id !== recurrenceId);
    this.exceptions.delete(recurrenceId);
  }

  async findById(recurrenceId: string) {
    return this.recurrences.find((stored) => stored.id === recurrenceId) ?? null;
  }

  async listByUserId(userId: string) {
    return this.recurrences.filter((stored) => stored.userId === userId);
  }

  async listPendingMaterialization(userId: string, horizon: string) {
    return this.recurrences.filter(
      (stored) =>
        stored.userId === userId &&
        (!stored.materializedThrough ||
          (stored.materializedThrough < horizon &&
            (!stored.rule.endsOn || stored.materializedThrough < stored.rule.endsOn))),
    );
  }

  async listExceptions(recurrenceId: string) {
    return [...(this.exceptions.get(recurrenceId) ?? [])];
  }

  async addException(recurrenceId: string, dayKey: string) {
    const days = this.exceptions.get(recurrenceId) ?? new Set<string>();
    days.add(dayKey);
    this.exceptions.set(recurrenceId, days);
  }

  async materialize(recurrence: Recurrence, occurrences: Event[] | Task[]) {
    const index = this.recurrences.findIndex((stored) => stored.id === recurrence.id);
    if (index === -1 || (this.recurrences[index] as Recurrence).revision !== recurrence.revision) {
      throw new RecurrenceRevisionConflictError(`Recurrence ${recurrence.id} changed while materializing`);
    }
    for (const occurrence of occurrences) {
      const day = occurrence.occurrence?.occurrenceOn;
      const pool: (Event | Task)[] = recurrence.target === "event" ? this.events.events : this.tasks;
      // O indice unico do Postgres: um dia da serie existe uma vez so.
      if (pool.some((stored) => stored.occurrence?.recurrenceId === recurrence.id && stored.occurrence.occurrenceOn === day)) {
        continue;
      }
      pool.push(occurrence);
    }
    this.recurrences[index] = recurrence;
  }

  private dropUpcoming(recurrenceId: string, fromDay: string) {
    const keep = (item: Event | Task) =>
      item.occurrence?.recurrenceId !== recurrenceId ||
      item.occurrence.detached ||
      item.occurrence.occurrenceOn < fromDay;
    this.events.events = this.events.events.filter(keep);
    this.tasks = this.tasks.filter(keep);
  }
}
