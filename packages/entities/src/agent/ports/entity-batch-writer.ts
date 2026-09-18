import type { Event } from "../../events/entities/event.entity";
import type { Note } from "../../notes/entities/note.entity";
import type { Task } from "../../tasks/entities/task.entity";

/** `expectedRevision` e a revisao lida quando a mudanca foi preparada. */
export type StagedChange<T> =
  | { op: "create"; entity: T }
  | { op: "update"; entity: T; expectedRevision: number }
  | { op: "delete"; id: string; expectedRevision: number };

export interface EntityBatch {
  userId: string;
  events: StagedChange<Event>[];
  tasks: StagedChange<Task>[];
  notes: StagedChange<Note>[];
}

/**
 * Grava o lote inteiro numa transacao so. Se qualquer alvo sumiu, mudou de
 * revisao ou nao e do usuario, nada e gravado (`EntityBatchConflictError`).
 */
export interface EntityBatchWriter {
  commit(batch: EntityBatch): Promise<void>;
}
