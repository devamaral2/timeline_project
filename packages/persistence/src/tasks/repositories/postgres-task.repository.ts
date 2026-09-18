import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ulid } from "ulid";
import { Task, TaskNotFoundError, TaskOwnershipError, TaskRevisionConflictError } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { mapTaskRow } from "../mappers/task-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { pgIntegerArrayLiteral } from "../../shared/pg-integer-array";
import { occurrenceColumnsOf } from "../../recurrences/mappers/occurrence-columns";
import type { Tx } from "../../events/repositories/postgres-event.repository";
import { softDeleteNotesOfTargets } from "../../notes/repositories/postgres-note.repository";

async function insertTags(tx: Tx, task: Task): Promise<void> {
  if (task.tags.length === 0) return;

  const tagIds: string[] = [];
  for (const name of task.tags) {
    const [row] = await tx
      .insert(schema.tags)
      .values({ id: ulid(), userId: task.userId, name })
      .onConflictDoUpdate({
        target: [schema.tags.userId, schema.tags.name],
        set: { name: sql`excluded.name` },
      })
      .returning({ id: schema.tags.id });
    tagIds.push(row.id);
  }

  await tx.insert(schema.taskTags).values(tagIds.map((tagId) => ({ taskId: task.id, tagId })));
}

async function insertDependencies(tx: Tx, task: Task): Promise<void> {
  if (task.dependsOnTaskIds.length === 0) return;

  await tx
    .insert(schema.taskDependencies)
    .values(task.dependsOnTaskIds.map((dependsOnTaskId) => ({ taskId: task.id, dependsOnTaskId })));
}

/**
 * Insere a tarefa, as tags e as dependencias. Devolve `false` quando ela e uma
 * ocorrencia de um dia que a serie ja gerou.
 */
export async function insertTaskAggregate(tx: Tx, task: Task): Promise<boolean> {
  const inserted = await tx
    .insert(schema.tasks)
    .values({
      id: task.id,
      revision: task.revision,
      userId: task.userId,
      parentTaskId: task.parentTaskId ?? null,
      name: task.name,
      description: task.description,
      status: task.status,
      priority: task.priority,
      notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
      startedAt: task.startedAt ?? null,
      estimatedFinishAt: task.estimatedFinishAt ?? null,
      finishedAt: task.finishedAt ?? null,
      ...occurrenceColumnsOf(task.occurrence),
    })
    .onConflictDoNothing({
      target: [schema.tasks.recurrenceId, schema.tasks.occurrenceOn],
      where: sql`${schema.tasks.recurrenceId} IS NOT NULL`,
    })
    .returning({ id: schema.tasks.id });

  if (inserted.length === 0) return false;
  await insertTags(tx, task);
  await insertDependencies(tx, task);
  return true;
}

/** Linha apagada conta como inexistente, como em `updateEventAggregate`. */
export async function updateTaskAggregate(
  tx: Tx,
  task: Task,
  actorUserId: string,
  expectedRevision: number,
): Promise<void> {
  const result = await tx.execute(sql`
    UPDATE tasks
    SET parent_task_id = ${task.parentTaskId ?? null},
        name = ${task.name},
        description = ${task.description},
        status = ${task.status},
        priority = ${task.priority},
        notify_offsets_minutes = ${pgIntegerArrayLiteral(task.notifyOffsetsMinutes)}::integer[],
        started_at = ${task.startedAt ?? null},
        estimated_finish_at = ${task.estimatedFinishAt ?? null},
        finished_at = ${task.finishedAt ?? null},
        recurrence_detached = ${task.occurrence?.detached ?? false},
        revision = ${task.revision},
        updated_at = now()
    WHERE id = ${task.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length === 0) {
    const [existing] = await tx
      .select({ userId: schema.tasks.userId, revision: schema.tasks.revision })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, task.id), isNull(schema.tasks.deletedAt)));

    classifyUpdateFailure(existing, actorUserId, expectedRevision, {
      notFound: () => new TaskNotFoundError(`Task not found: ${task.id}`),
      ownership: () => new TaskOwnershipError(),
      conflict: (message) => new TaskRevisionConflictError(message),
    });
  }

  await tx.delete(schema.taskTags).where(eq(schema.taskTags.taskId, task.id));
  await insertTags(tx, task);
  await tx.delete(schema.taskDependencies).where(eq(schema.taskDependencies.taskId, task.id));
  await insertDependencies(tx, task);
}

interface DeletedTaskRow extends Record<string, unknown> {
  id: string;
  recurrence_id: string | null;
  occurrence_on: string | null;
}

/**
 * Apaga a tarefa e todos os niveis de subtarefa abaixo dela, e devolve os ids
 * apagados. O `cascade` do FK nao dispara num UPDATE, entao a arvore desce aqui.
 */
export async function softDeleteTaskTree(tx: Tx, taskId: string, actorUserId: string): Promise<string[]> {
  const [existing] = await tx
    .select({ userId: schema.tasks.userId })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), isNull(schema.tasks.deletedAt)));

  if (!existing) {
    throw new TaskNotFoundError(`Task not found: ${taskId}`);
  }
  if (existing.userId !== actorUserId) {
    throw new TaskOwnershipError();
  }

  const deleted = await tx.execute<DeletedTaskRow>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM tasks WHERE id = ${taskId}
      UNION
      SELECT child.id
      FROM tasks child
      JOIN tree ON child.parent_task_id = tree.id
      WHERE child.deleted_at IS NULL
    )
    UPDATE tasks
    SET deleted_at = now(), updated_at = now()
    WHERE id IN (SELECT id FROM tree) AND deleted_at IS NULL
    RETURNING id, recurrence_id, occurrence_on::text AS occurrence_on
  `);

  // Como no evento: a edicao da serie faz hard delete e regera o futuro, e sem a
  // excecao o dia apagado voltaria.
  const exceptions = deleted.rows
    .filter((row) => row.recurrence_id && row.occurrence_on)
    .map((row) => ({ recurrenceId: row.recurrence_id as string, occurrenceOn: row.occurrence_on as string }));
  if (exceptions.length > 0) {
    await tx.insert(schema.recurrenceExceptions).values(exceptions).onConflictDoNothing();
  }

  const ids = deleted.rows.map((row) => row.id);
  await softDeleteNotesOfTargets(tx, { taskIds: ids });
  return ids;
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(task: Task): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertTaskAggregate(tx, task);
    });
  }

  async update(task: Task, actorUserId: string, expectedRevision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateTaskAggregate(tx, task, actorUserId, expectedRevision);
    });
  }

  async delete(taskId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteTaskTree(tx, taskId, actorUserId);
    });
  }

  async findById(taskId: string): Promise<Task | null> {
    const [row] = await this.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), isNull(schema.tasks.deletedAt)));
    if (!row) return null;
    return this.hydrate(row);
  }

  async listByUserId(userId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.userId, userId), isNull(schema.tasks.deletedAt)));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async listByParentTaskId(parentTaskId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.parentTaskId, parentTaskId), isNull(schema.tasks.deletedAt)));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  private async hydrate(row: typeof schema.tasks.$inferSelect): Promise<Task> {
    const tagRows = await this.db
      .select({ name: schema.tags.name })
      .from(schema.taskTags)
      .innerJoin(schema.tags, eq(schema.taskTags.tagId, schema.tags.id))
      .where(eq(schema.taskTags.taskId, row.id));
    const dependencyRows = await this.db
      .select({ dependsOnTaskId: schema.taskDependencies.dependsOnTaskId })
      .from(schema.taskDependencies)
      .innerJoin(schema.tasks, eq(schema.taskDependencies.dependsOnTaskId, schema.tasks.id))
      .where(and(eq(schema.taskDependencies.taskId, row.id), isNull(schema.tasks.deletedAt)));

    return mapTaskRow(
      row,
      tagRows.map((tagRow) => tagRow.name),
      dependencyRows.map((dependencyRow) => dependencyRow.dependsOnTaskId),
    );
  }
}
