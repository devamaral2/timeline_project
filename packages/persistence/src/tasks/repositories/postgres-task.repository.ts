import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ulid } from "ulid";
import { Task, TaskNotFoundError, TaskOwnershipError, TaskRevisionConflictError } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { mapTaskRow } from "../mappers/task-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

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

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(task: Task): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.tasks).values({
        id: task.id,
        revision: task.revision,
        userId: task.userId,
        planId: task.planId ?? null,
        name: task.name,
        description: task.description,
        status: task.status,
        priority: task.priority,
        startedAt: task.startedAt ?? null,
        estimatedFinishAt: task.estimatedFinishAt ?? null,
        finishedAt: task.finishedAt ?? null,
      });

      await insertTags(tx, task);
      await insertDependencies(tx, task);
    });
  }

  async update(task: Task, actorUserId: string, expectedRevision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE tasks
        SET plan_id = ${task.planId ?? null},
            name = ${task.name},
            description = ${task.description},
            status = ${task.status},
            priority = ${task.priority},
            started_at = ${task.startedAt ?? null},
            estimated_finish_at = ${task.estimatedFinishAt ?? null},
            finished_at = ${task.finishedAt ?? null},
            revision = ${task.revision},
            updated_at = now()
        WHERE id = ${task.id}
          AND user_id = ${actorUserId}
          AND revision = ${expectedRevision}
        RETURNING revision
      `);

      if (result.rows.length === 0) {
        const [existing] = await tx
          .select({ userId: schema.tasks.userId, revision: schema.tasks.revision })
          .from(schema.tasks)
          .where(eq(schema.tasks.id, task.id));

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
    });
  }

  async delete(taskId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: schema.tasks.userId })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId));

      if (!existing) {
        throw new TaskNotFoundError(`Task not found: ${taskId}`);
      }
      if (existing.userId !== actorUserId) {
        throw new TaskOwnershipError();
      }

      await tx.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    });
  }

  async findById(taskId: string): Promise<Task | null> {
    const [row] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!row) return null;
    return this.hydrate(row);
  }

  async listByUserId(userId: string): Promise<Task[]> {
    const rows = await this.db.select().from(schema.tasks).where(eq(schema.tasks.userId, userId));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async listByPlanId(planId: string): Promise<Task[]> {
    const rows = await this.db.select().from(schema.tasks).where(eq(schema.tasks.planId, planId));
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
      .where(eq(schema.taskDependencies.taskId, row.id));

    return mapTaskRow(
      row,
      tagRows.map((tagRow) => tagRow.name),
      dependencyRows.map((dependencyRow) => dependencyRow.dependsOnTaskId),
    );
  }
}
