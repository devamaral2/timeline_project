import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TaskRepository } from "../../domain/ports";
import type { TaskSummaryDto } from "@repo/contracts";
import { toTaskSummaryDto } from "../../api-core/dto/task-summary.dto";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

export class ListTasksUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    await this.recurrences.materialize(actor.userId);
    const tasks = await this.taskRepository.listByUserId(actor.userId);
    return tasks.map(toTaskSummaryDto);
  }
}

export { toTaskSummaryDto as toSummaryDto } from "../../api-core/dto/task-summary.dto";
