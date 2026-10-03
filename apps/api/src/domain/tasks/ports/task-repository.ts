import type { NoteWrites } from "../../notes/types/note-writes";
import type { Task } from "../entities/task.entity";

export interface TaskRepository {
  save(task: Task, notes?: NoteWrites): Promise<void>;
  update(task: Task, actorUserId: string, expectedRevision: number, notes?: NoteWrites): Promise<void>;
  delete(taskId: string, actorUserId: string): Promise<void>;
  findById(taskId: string): Promise<Task | null>;
  listByUserId(userId: string): Promise<Task[]>;
  listByParentTaskId(parentTaskId: string): Promise<Task[]>;
}
