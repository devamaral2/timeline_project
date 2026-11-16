import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TaskCardQuery, TrackedQueryParams } from "../../domain/ports";
import type { TaskCardDto } from "@repo/contracts";
import { toTaskCardDto } from "../../api-core/dto/task.dto";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

export type ListTrackedTasksFilter = Omit<TrackedQueryParams, "userId">;

/**
 * A lista de tarefas: as tarefas acompanhadas (com status), de pessoa e de
 * agente, incluindo as longas. Os filtros rodam no banco.
 */
export class ListTrackedTasksUseCase {
  constructor(
    private readonly taskCardQuery: Pick<TaskCardQuery, "tracked">,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(input: ListTrackedTasksFilter | undefined, actor: AuthenticatedUser): Promise<TaskCardDto[]> {
    await this.recurrences.materialize(actor.userId, input?.to);
    const cards = await this.taskCardQuery.tracked({ ...input, userId: actor.userId });
    return cards.map(toTaskCardDto);
  }
}
