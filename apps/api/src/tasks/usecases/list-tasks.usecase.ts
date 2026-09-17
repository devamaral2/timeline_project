import type { AuthenticatedUser } from "../../auth/authenticated-user";
import type { TaskRepository } from "@repo/entities/ports";
import type { TaskSummaryDto } from "@repo/entities/contracts";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../recurrences/usecases/materialize-recurrences.usecase";

export class ListTasksUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    await this.recurrences.materialize(actor.userId);
    const tasks = await this.taskRepository.listByUserId(actor.userId);
    return tasks.map(toSummaryDto);
  }
}

export function toSummaryDto(task: {
  id: string;
  parentTaskId?: string;
  name: string;
  status: TaskSummaryDto["status"];
  priority: TaskSummaryDto["priority"];
  notifyOffsetsMinutes: readonly TaskSummaryDto["notifyOffsetsMinutes"][number][];
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
}): TaskSummaryDto {
  return {
    id: task.id,
    parentTaskId: task.parentTaskId,
    name: task.name,
    status: task.status,
    priority: task.priority,
    notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
    tags: task.tags,
    startedAt: task.startedAt?.toISOString(),
    estimatedFinishAt: task.estimatedFinishAt?.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
  };
}
