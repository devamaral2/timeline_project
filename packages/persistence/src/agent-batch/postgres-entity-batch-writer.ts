import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { EntityBatchConflictError, type Event, type Note, type Task } from "@repo/entities";
import type { EntityBatch, EntityBatchWriter, StagedChange } from "@repo/entities/ports";
import * as schema from "../database/schema";
import {
  insertEventAggregate,
  softDeleteEvent,
  updateEventAggregate,
  type Tx,
} from "../events/repositories/postgres-event.repository";
import {
  insertTaskAggregate,
  softDeleteTaskTree,
  updateTaskAggregate,
} from "../tasks/repositories/postgres-task.repository";
import {
  insertNote,
  softDeleteNote,
  updateNoteAggregate,
} from "../notes/repositories/postgres-note.repository";

type TargetTable = "events" | "tasks" | "notes";

interface LockedRow extends Record<string, unknown> {
  id: string;
  revision: number;
}

export class PostgresEntityBatchWriter implements EntityBatchWriter {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async commit(batch: EntityBatch): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockTargets(tx, "events", batch.userId, batch.events);
      await lockTargets(tx, "tasks", batch.userId, batch.tasks);
      await lockTargets(tx, "notes", batch.userId, batch.notes);
      await lockReferences(tx, batch);

      for (const task of creationOrder(created(batch.tasks))) {
        await insertTaskAggregate(tx, task);
      }
      for (const event of created(batch.events)) {
        if (!(await insertEventAggregate(tx, event))) {
          throw new EntityBatchConflictError(`Evento ${event.id} já existe`);
        }
      }
      for (const note of created(batch.notes)) {
        await insertNote(tx, note);
      }

      for (const change of batch.tasks) {
        if (change.op === "update") await updateTaskAggregate(tx, change.entity, batch.userId, change.expectedRevision);
      }
      for (const change of batch.events) {
        if (change.op === "update") await updateEventAggregate(tx, change.entity, batch.userId, change.expectedRevision);
      }
      for (const change of batch.notes) {
        if (change.op === "update") await updateNoteAggregate(tx, change.entity, batch.userId, change.expectedRevision);
      }

      // Notas antes dos alvos: apagar um evento ou tarefa ja apaga as notas
      // dele, e apagar de novo daria "nao encontrado".
      for (const change of batch.notes) {
        if (change.op === "delete") await softDeleteNote(tx, change.id, batch.userId);
      }
      for (const change of batch.events) {
        if (change.op === "delete") await softDeleteEvent(tx, change.id, batch.userId);
      }
      const deletedTaskIds = new Set<string>();
      for (const change of batch.tasks) {
        if (change.op !== "delete" || deletedTaskIds.has(change.id)) continue;
        for (const id of await softDeleteTaskTree(tx, change.id, batch.userId)) deletedTaskIds.add(id);
      }
    });
  }
}

function created<T>(changes: readonly StagedChange<T>[]): T[] {
  return changes.flatMap((change) => (change.op === "create" ? [change.entity] : []));
}

function targetIdOf<T extends { id: string }>(change: StagedChange<T>): string | undefined {
  if (change.op === "update") return change.entity.id;
  if (change.op === "delete") return change.id;
  return undefined;
}

/**
 * Trava as linhas alvo e confere dono, existencia e revisao antes de qualquer
 * escrita. `ORDER BY id` fixa a ordem das travas entre requisicoes paralelas.
 */
async function lockTargets<T extends { id: string }>(
  tx: Tx,
  table: TargetTable,
  userId: string,
  changes: readonly StagedChange<T>[],
): Promise<void> {
  const expected = new Map<string, number>();
  for (const change of changes) {
    const id = targetIdOf(change);
    if (id && change.op !== "create") expected.set(id, change.expectedRevision);
  }
  if (expected.size === 0) return;

  const ids = [...expected.keys()];
  const locked = await tx.execute<LockedRow>(sql`
    SELECT id, revision FROM ${sql.identifier(table)}
    WHERE id IN ${ids} AND user_id = ${userId} AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE
  `);
  const found = new Map(locked.rows.map((row) => [row.id, Number(row.revision)]));

  for (const [id, revision] of expected) {
    if (!found.has(id)) {
      throw new EntityBatchConflictError(`${table}: ${id} não existe mais ou não pertence ao usuário`);
    }
    if (found.get(id) !== revision) {
      throw new EntityBatchConflictError(`${table}: ${id} foi alterado por outra requisição`);
    }
  }
}

/**
 * O banco nao confere que pai, dependencia ou alvo da nota sao do mesmo
 * usuario. Aqui confere, e `FOR SHARE` impede que sumam antes do commit.
 */
async function lockReferences(tx: Tx, batch: EntityBatch): Promise<void> {
  const createdTaskIds = new Set(created(batch.tasks).map((task) => task.id));
  const createdEventIds = new Set(created(batch.events).map((event) => event.id));

  const taskRefs = new Set<string>();
  const eventRefs = new Set<string>();
  const written = <T>(changes: readonly StagedChange<T>[]): T[] =>
    changes.flatMap((change) => (change.op === "delete" ? [] : [change.entity]));

  for (const task of written<Task>(batch.tasks)) {
    if (task.parentTaskId) taskRefs.add(task.parentTaskId);
    for (const id of task.dependsOnTaskIds) taskRefs.add(id);
  }
  for (const event of written<Event>(batch.events)) {
    for (const id of event.taskIds) taskRefs.add(id);
  }
  for (const note of written<Note>(batch.notes)) {
    if (note.taskId) taskRefs.add(note.taskId);
    if (note.eventId) eventRefs.add(note.eventId);
  }

  await lockExisting(tx, "tasks", batch.userId, [...taskRefs].filter((id) => !createdTaskIds.has(id)));
  await lockExisting(tx, "events", batch.userId, [...eventRefs].filter((id) => !createdEventIds.has(id)));
}

async function lockExisting(tx: Tx, table: "events" | "tasks", userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const locked = await tx.execute<{ id: string }>(sql`
    SELECT id FROM ${sql.identifier(table)}
    WHERE id IN ${ids} AND user_id = ${userId} AND deleted_at IS NULL
    ORDER BY id
    FOR SHARE
  `);
  const found = new Set(locked.rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new EntityBatchConflictError(`${table} referenciados não existem: ${missing.join(", ")}`);
  }
}

/** Pai e dependencias criados no mesmo lote precisam entrar antes (FK). */
function creationOrder(tasks: readonly Task[]): Task[] {
  const pending = new Map(tasks.map((task) => [task.id, task]));
  const ordered: Task[] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()].filter((task) =>
      [task.parentTaskId, ...task.dependsOnTaskIds].every((id) => !id || !pending.has(id)),
    );
    if (ready.length === 0) {
      throw new EntityBatchConflictError("As tarefas criadas formam um ciclo de pai ou dependência");
    }
    for (const task of ready) {
      ordered.push(task);
      pending.delete(task.id);
    }
  }
  return ordered;
}
