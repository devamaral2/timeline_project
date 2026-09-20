import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import type { TaskRepository } from "../../../domain/ports";

export class DeleteTaskUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.taskRepository.delete(input.taskId, actor.userId);
  }
}
