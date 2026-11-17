import {
  Task,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type ArtifactLink,
  type ArtifactWrites,
  type OccurrenceLink,
  type Recurrence,
} from "../../../domain";
import type { RecurrenceRepository } from "../../../domain/ports";
import type { InMemoryTaskDatabase } from "../../tasks/testing/in-memory-task-database";

/**
 * O mesma tarefa com algo trocado, sem contar como revisao: e como o banco
 * mexe numa linha por fora de uma edicao do usuario (soltar a ocorrencia da
 * serie apagada, ligar a ocorrencia nova à tarefa maior).
 */
function rewrite(
  task: Task,
  changes: { artifactLinks?: ArtifactLink[]; occurrence?: OccurrenceLink | undefined },
): Task {
  return Task.rehydrate({
    id: task.id,
    userId: task.userId,
    actor: task.actor,
    kind: task.kind,
    status: task.status,
    priority: task.priority,
    name: task.name,
    description: task.description,
    location: task.location,
    startedAt: task.startedAt,
    estimatedFinishAt: task.estimatedFinishAt,
    finishedAt: task.finishedAt,
    notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
    tags: [...task.tags],
    longRunning: task.longRunning,
    data: { ...task.data },
    artifactLinks: changes.artifactLinks ?? [...task.artifactLinks],
    occurrence: "occurrence" in changes ? changes.occurrence : task.occurrence,
    revision: task.revision,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
}

/**
 * Fake com as ocorrencias de verdade: gera as tarefas no mesmo banco em
 * memoria dos testes de tarefas, para que os testes possam ler o que a serie
 * produziu pela agenda e pela lista de tarefas.
 */
export class InMemoryRecurrenceRepository implements RecurrenceRepository {
  recurrences: Recurrence[] = [];
  readonly exceptions = new Map<string, Set<string>>();

  constructor(readonly tasks: InMemoryTaskDatabase) {}

  async save(recurrence: Recurrence, artifacts?: ArtifactWrites): Promise<void> {
    // Os artefatos antes: o template da serie aponta para eles.
    this.tasks.writeArtifacts(artifacts);
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
    this.tasks.writeArtifacts(artifacts);
    this.recurrences[index] = recurrence;
    this.dropUpcoming(recurrence.id, fromDay);
  }

  async delete(recurrenceId: string, actorUserId: string, fromDay: string): Promise<void> {
    const existing = await this.findById(recurrenceId);
    if (!existing) throw new RecurrenceNotFoundError(`Recurrence not found: ${recurrenceId}`);
    if (existing.userId !== actorUserId) throw new RecurrenceOwnershipError();

    this.dropUpcoming(recurrenceId, fromDay);
    // As que ficam sao historia: perdem o vinculo com a serie, e a relacao herdada dela vira da propria ocorrencia.
    this.tasks.tasks = this.tasks.tasks.map((task) =>
      task.occurrence?.recurrenceId === recurrenceId
        ? rewrite(task, {
            occurrence: undefined,
            artifactLinks: task.artifactLinks.map((link) => ({ ...link, fromRecurrence: false })),
          })
        : task,
    );
    this.recurrences = this.recurrences.filter((stored) => stored.id !== recurrenceId);
    this.exceptions.delete(recurrenceId);
  }

  async findById(recurrenceId: string): Promise<Recurrence | null> {
    return this.recurrences.find((stored) => stored.id === recurrenceId) ?? null;
  }

  async findNextOccurrenceId(recurrenceId: string, fromDay: string): Promise<string | null> {
    const upcoming = this.tasks.tasks
      .filter(
        (task) =>
          task.occurrence?.recurrenceId === recurrenceId &&
          !task.occurrence.detached &&
          task.occurrence.occurrenceOn >= fromDay,
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

  async materialize(recurrence: Recurrence, occurrences: Task[], parentId?: string): Promise<void> {
    const index = this.recurrences.findIndex((stored) => stored.id === recurrence.id);
    // A regra mudou no meio do caminho: estas ocorrencias sao da regra velha, e nada e gravado.
    if (index === -1 || (this.recurrences[index] as Recurrence).revision !== recurrence.revision) {
      throw new RecurrenceRevisionConflictError(`Recurrence ${recurrence.id} changed while materializing`);
    }

    // Uma principal que sumiu nao pode ganhar subtarefa: a serie avanca sem gerar nada.
    const parentGone =
      parentId !== undefined &&
      !this.tasks.tasks.some((task) => task.id === parentId && task.userId === recurrence.userId);
    const inserted: string[] = [];
    for (const occurrence of parentGone ? [] : occurrences) {
      const day = occurrence.occurrence?.occurrenceOn;
      // O indice unico do Postgres: um dia da serie existe uma vez so.
      const taken = this.tasks.tasks.some(
        (stored) => stored.occurrence?.recurrenceId === recurrence.id && stored.occurrence.occurrenceOn === day,
      );
      if (taken) continue;
      this.tasks.tasks.push(occurrence);
      inserted.push(occurrence.id);
    }

    // A relacao faz parte da criacao da ocorrencia: nao conta como edicao da principal.
    if (parentId) for (const subtaskId of inserted) this.tasks.edges.push({ parentId, subtaskId });
    this.recurrences[index] = recurrence;
  }

  private dropUpcoming(recurrenceId: string, fromDay: string): void {
    this.tasks.tasks = this.tasks.tasks.filter(
      (task) =>
        task.occurrence?.recurrenceId !== recurrenceId ||
        task.occurrence.detached ||
        task.occurrence.occurrenceOn < fromDay,
    );
  }
}
