import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { TaskOwnershipError } from "../../domain";
import type { TaskRepository } from "../../domain/ports";
import type { TaskDetailDto } from "@repo/contracts";
import { toTaskDetailDto } from "../../api-core/dto/task-detail.dto";

export class GetTaskUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<TaskDetailDto | null> {
    const task = await this.taskRepository.findById(input.taskId);
    if (!task) return null;
    if (task.userId !== actor.userId) {
      throw new TaskOwnershipError();
    }

    return toTaskDetailDto(task);
  }
}

export { toTaskDetailDto as toDetailDto } from "../../api-core/dto/task-detail.dto";
