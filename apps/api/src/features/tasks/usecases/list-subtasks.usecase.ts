import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { TaskNotFoundError, TaskOwnershipError } from "../../../domain";
import type { TaskRepository } from "../../../domain/ports";
import type { TaskSummaryDto } from "@repo/contracts";
import { toSummaryDto } from "./list-tasks.usecase";

export class ListSubtasksUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    const parent = await this.taskRepository.findById(input.taskId);
    if (!parent) throw new TaskNotFoundError(`Task not found: ${input.taskId}`);
    if (parent.userId !== actor.userId) throw new TaskOwnershipError();

    const subtasks = await this.taskRepository.listByParentTaskId(input.taskId);
    return subtasks.map(toSummaryDto);
  }
}
