import { EntityBatchConflictError } from "@repo/entities";
import type {
  EntityBatch,
  EntityBatchWriter,
  EventRepository,
  NoteRepository,
  StagedChange,
  TaskRepository,
} from "@repo/entities/ports";

interface Store<T> {
  save(entity: T): Promise<void>;
  update(entity: T, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(id: string, actorUserId: string): Promise<void>;
  findById(id: string): Promise<(T & { userId: string; revision: number }) | null>;
}

/**
 * Confere todos os alvos antes de aplicar qualquer mudanca, para que um
 * conflito nao deixe o lote pela metade — o equivalente em memoria da
 * transacao do writer Postgres.
 */
export class InMemoryEntityBatchWriter implements EntityBatchWriter {
  readonly commits: EntityBatch[] = [];

  constructor(
    private readonly repositories: { events: EventRepository; tasks: TaskRepository; notes: NoteRepository },
  ) {}

  async commit(batch: EntityBatch): Promise<void> {
    await this.check(this.repositories.events, batch.userId, batch.events);
    await this.check(this.repositories.tasks, batch.userId, batch.tasks);
    await this.check(this.repositories.notes, batch.userId, batch.notes);

    await this.apply(this.repositories.tasks, batch.userId, batch.tasks);
    await this.apply(this.repositories.events, batch.userId, batch.events);
    await this.apply(this.repositories.notes, batch.userId, batch.notes);
    this.commits.push(batch);
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
