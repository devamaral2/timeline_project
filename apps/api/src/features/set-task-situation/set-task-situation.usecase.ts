import type { TaskCardDto, TaskSituation } from "@repo/contracts";
import { acceptsSituation, TaskNotFoundError, TaskSituationNotAllowedError } from "../../domain";
import type { TaskCardQuery, TaskRepository } from "../../domain/ports";
import { toTaskCardDto } from "../../api-core/dto/task.dto";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

export class SetTaskSituationUseCase {
  constructor(
    private readonly tasks: Pick<TaskRepository, "findById" | "setSituation">,
    private readonly cards: Pick<TaskCardQuery, "cardsOf">,
  ) {}

  /**
   * O usuario decide o que fazer do pedido que terminou. Aceita qualquer das tres situacoes a partir de qualquer uma;
   * so o pedido de agente num status final aceita. Tarefa inexistente e de outro usuario respondem igual.
   */
  async execute(input: { taskId: string; situation: TaskSituation }, actor: AuthenticatedUser): Promise<TaskCardDto> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || task.userId !== actor.userId) throw new TaskNotFoundError(`Task not found: ${input.taskId}`);
    if (!acceptsSituation(task)) throw new TaskSituationNotAllowedError();
    if (!(await this.tasks.setSituation(task.id, actor.userId, input.situation))) throw new TaskSituationNotAllowedError();

    const [card] = await this.cards.cardsOf([task.id]);
    if (!card) throw new TaskNotFoundError(`Task not found: ${input.taskId}`);
    return toTaskCardDto(card);
  }
}
