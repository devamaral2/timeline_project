import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TaskRepository } from "../../domain/ports";

export class DeleteTaskUseCase {
  constructor(private readonly taskRepository: Pick<TaskRepository, "delete">) {}

  /**
   * Apaga so a tarefa. As subtarefas dela continuam existindo: subtarefa e uma
   * relacao, e pode pertencer a outra tarefa maior.
   */
  async execute(input: { taskId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.taskRepository.delete(input.taskId, actor.userId);
  }
}
