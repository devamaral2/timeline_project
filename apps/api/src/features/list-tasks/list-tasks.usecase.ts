import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TaskRepository } from "../../domain/ports";
import type { TaskSummaryDto } from "@repo/contracts";
import type { WorkItemPriority, WorkItemStatus } from "../../domain";
import { hasTag } from "../../api-core/list-filters";
import { toTaskSummaryDto } from "../../api-core/dto/task-summary.dto";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

export interface ListTasksFilter {
  status?: WorkItemStatus[];
  priority?: WorkItemPriority[];
  tag?: string;
  /** Busca no nome, sem diferenciar maiusculas. Ja normalizada (minuscula). */
  q?: string;
  /** Janela sobre `startedAt`, ou `estimatedFinishAt` quando nao ha inicio. Tarefa sem nenhuma das duas fica de fora. */
  from?: Date;
  to?: Date;
  limit?: number;
}

function plannedAt(task: TaskSummaryDto): Date | undefined {
  const raw = task.startedAt ?? task.estimatedFinishAt;
  return raw ? new Date(raw) : undefined;
}

export function filterTasks(tasks: TaskSummaryDto[], filter: ListTasksFilter): TaskSummaryDto[] {
  const matching = tasks.filter((task) => {
    if (filter.status && !filter.status.includes(task.status)) return false;
    if (filter.priority && !filter.priority.includes(task.priority)) return false;
    if (!hasTag(task.tags, filter.tag)) return false;
    if (filter.q && !task.name.toLowerCase().includes(filter.q)) return false;
    if (filter.from || filter.to) {
      const at = plannedAt(task);
      if (!at) return false;
      if (filter.from && at < filter.from) return false;
      if (filter.to && at > filter.to) return false;
    }
    return true;
  });
  return filter.limit === undefined ? matching : matching.slice(0, filter.limit);
}

export class ListTasksUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(input: ListTasksFilter | undefined, actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    await this.recurrences.materialize(actor.userId);
    const tasks = await this.taskRepository.listByUserId(actor.userId);
    return filterTasks(tasks.map(toTaskSummaryDto), input ?? {});
  }
}

export { toTaskSummaryDto as toSummaryDto } from "../../api-core/dto/task-summary.dto";
