import { EntityBatchConflictError } from "../../../domain";
import type {
  ArtifactRepository,
  EntityBatch,
  EntityBatchResult,
  EntityBatchWriter,
  EventRepository,
  RecurrenceRepository,
  SequenceChange,
  StagedChange,
} from "../../../domain/ports";

interface Store<T> {
  save(entity: T): Promise<void>;
  update(entity: T, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(id: string, actorUserId: string): Promise<void>;
  findById(id: string): Promise<(T & { userId: string | undefined; revision: number }) | null>;
}

/**
 * Confere todos os alvos antes de aplicar qualquer mudanca, para que um
 * conflito nao deixe o lote pela metade: o equivalente em memoria da transacao
 * do escritor do Postgres.
 */
export class InMemoryEntityBatchWriter implements EntityBatchWriter {
  readonly commits: EntityBatch[] = [];

  constructor(
    private readonly repositories: {
      events: EventRepository;
      /** O banco em memoria, onde a sequencia entre eventos fica registrada. */
      sequence?: { apply(userId: string, changes: readonly SequenceChange[]): void };
      artifacts: ArtifactRepository;
      recurrences?: RecurrenceRepository;
    },
    /** Onde as derivacoes do lote ficam registradas, se o teste quiser conferi-las. */
    private readonly derivations: { originalId: string; copyId: string }[] = [],
  ) {}

  async commit(batch: EntityBatch): Promise<EntityBatchResult> {
    await this.check(this.repositories.events, batch.userId, batch.events);
    await this.check(this.repositories.artifacts, batch.userId, batch.artifacts);

    // Artefatos primeiro: as relacoes de um evento apontam para eles.
    await this.apply(this.repositories.artifacts, batch.userId, batch.artifacts);
    this.derivations.push(...(batch.derivations ?? []));
    for (const recurrence of batch.recurrences ?? []) {
      await this.recurrences().save(recurrence);
    }
    for (const change of batch.recurrenceChanges ?? []) {
      if (change.op === "update") {
        await this.recurrences().update(change.recurrence, batch.userId, change.expectedRevision, change.fromDay);
      } else {
        await this.recurrences().delete(change.id, batch.userId, change.fromDay);
      }
    }
    await this.apply(this.repositories.events, batch.userId, batch.events);
    this.repositories.sequence?.apply(batch.userId, batch.sequence ?? []);
    await batch.afterWrite?.(undefined);
    this.commits.push(batch);

    return {};
  }

  private recurrences(): RecurrenceRepository {
    if (!this.repositories.recurrences) throw new Error("InMemoryEntityBatchWriter sem repositorio de series");
    return this.repositories.recurrences;
  }

  private async check<T extends { id: string }>(
    store: Store<T>,
    userId: string,
    changes: readonly StagedChange<T>[],
  ): Promise<void> {
    for (const change of changes) {
      if (change.op === "create") continue;
      const id = change.op === "update" ? change.entity.id : change.id;
      const current = await store.findById(id);
      if (!current || current.userId !== userId || current.revision !== change.expectedRevision) {
        throw new EntityBatchConflictError(`${id} mudou antes do commit`);
      }
    }
  }

  private async apply<T extends { id: string }>(
    store: Store<T>,
    userId: string,
    changes: readonly StagedChange<T>[],
  ): Promise<void> {
    for (const change of changes) {
      if (change.op === "create") await store.save(change.entity);
      else if (change.op === "update") await store.update(change.entity, userId, change.expectedRevision);
      else await store.delete(change.id, userId);
    }
  }
}
