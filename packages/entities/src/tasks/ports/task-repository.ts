import type { Task } from "../entities/task.entity";

export interface TaskRepository {
  save(task: Task): Promise<void>;
  update(task: Task, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(taskId: string, actorUserId: string): Promise<void>;
  findById(taskId: string): Promise<Task | null>;
  listByUserId(userId: string): Promise<Task[]>;
  listByPlanId(planId: string): Promise<Task[]>;
}
