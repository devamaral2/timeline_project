import type { TaskRepository } from "../../../domain/ports";
import {
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
  type ArtifactWrites,
  type Task,
} from "../../../domain/index";
import type { InMemoryTaskDatabase } from "./in-memory-task-database";

export class InMemoryTaskRepository implements TaskRepository {
  constructor(private readonly database: InMemoryTaskDatabase) {}

  async save(task: Task, artifacts?: ArtifactWrites): Promise<void> {
    this.database.writeArtifacts(artifacts);
    this.database.tasks.push(task);
  }

  async update(task: Task, actorUserId: string, expectedRevision: number, artifacts?: ArtifactWrites): Promise<void> {
    const index = this.database.tasks.findIndex((storedTask) => storedTask.id === task.id);
    if (index === -1) throw new TaskNotFoundError(`Task not found: ${task.id}`);

    const existing = this.database.tasks[index] as Task;
    if (existing.userId !== actorUserId) throw new TaskOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new TaskRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }

    this.database.writeArtifacts(artifacts);
    this.database.tasks[index] = task;
  }

  async delete(taskId: string, actorUserId: string): Promise<void> {
    const task = this.database.tasks.find((storedTask) => storedTask.id === taskId);
    if (!task) throw new TaskNotFoundError(`Task not found: ${taskId}`);
    if (task.userId !== actorUserId) throw new TaskOwnershipError();
    this.database.tasks = this.database.tasks.filter((storedTask) => storedTask.id !== taskId);
  }

  async findById(taskId: string): Promise<Task | null> {
    const task = this.database.tasks.find((stored) => stored.id === taskId);
    return task ? this.database.hydrate(task) : null;
  }

  async findByIds(taskIds: readonly string[]): Promise<Task[]> {
    return this.database.tasks.filter((task) => taskIds.includes(task.id)).map((task) => this.database.hydrate(task));
  }
}
