import type { AuthenticatedUser } from "../../auth/authenticated-user";
import type { TaskRepository } from "@repo/entities/ports";

export class DeleteTaskUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.taskRepository.delete(input.taskId, actor.userId);
  }
}
