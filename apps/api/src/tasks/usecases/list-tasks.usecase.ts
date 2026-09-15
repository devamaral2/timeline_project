import type { AuthenticatedUser } from "../../auth/authenticated-user";
import type { TaskRepository } from "@repo/entities/ports";
import type { TaskSummaryDto } from "@repo/entities/contracts";

export class ListTasksUseCase {
  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    const tasks = await this.taskRepository.listByUserId(actor.userId);
    return tasks.map(toSummaryDto);
  }
}

export function toSummaryDto(task: {
  id: string;
  planId?: string;
  name: string;
  status: TaskSummaryDto["status"];
  priority: TaskSummaryDto["priority"];
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
}): TaskSummaryDto {
  return {
    id: task.id,
    planId: task.planId,
    name: task.name,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    startedAt: task.startedAt?.toISOString(),
    estimatedFinishAt: task.estimatedFinishAt?.toISOString(),
    finishedAt: task.finishedAt?.toISOString(),
  };
}
