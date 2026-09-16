import { TaskNotFoundError, TaskOwnershipError, TaskRevisionConflictError, type Task } from "@repo/entities";
import type { TaskRepository } from "@repo/entities/ports";

export class InMemoryTaskRepository implements TaskRepository {
  constructor(private tasks: Task[] = []) {}

  async save(task: Task): Promise<void> {
    this.tasks.push(task);
  }

  async update(task: Task, actorUserId: string, expectedRevision: number): Promise<void> {
    const index = this.tasks.findIndex((storedTask) => storedTask.id === task.id);
    if (index === -1) throw new TaskNotFoundError(`Task not found: ${task.id}`);

    const existing = this.tasks[index];
    if (existing.userId !== actorUserId) throw new TaskOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new TaskRevisionConflictError(
        `Expected revision ${expectedRevision} but found ${existing.revision}`,
      );
    }

    this.tasks[index] = task;
  }

  async delete(taskId: string, actorUserId: string): Promise<void> {
    const task = this.tasks.find((storedTask) => storedTask.id === taskId);
    if (!task) throw new TaskNotFoundError(`Task not found: ${taskId}`);
    if (task.userId !== actorUserId) throw new TaskOwnershipError();
    this.tasks = this.tasks.filter((storedTask) => storedTask.id !== taskId);
  }

  async findById(taskId: string): Promise<Task | null> {
    return this.tasks.find((task) => task.id === taskId) ?? null;
  }

  async listByUserId(userId: string): Promise<Task[]> {
    return this.tasks.filter((task) => task.userId === userId);
  }

  async listByParentTaskId(parentTaskId: string): Promise<Task[]> {
    return this.tasks.filter((task) => task.parentTaskId === parentTaskId);
  }
}
