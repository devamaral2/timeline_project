import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventCardQuery, TrackedQueryParams } from "../../domain/ports";
import type { EventCardDto } from "@repo/contracts";
import { toEventCardDto } from "../../api-core/dto/event.dto";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

export type ListTrackedEventsFilter = Omit<TrackedQueryParams, "userId">;

/**
 * A lista de tarefas: os eventos acompanhados (com status), de pessoa e de
 * agente, incluindo os longos. Os filtros rodam no banco.
 */
export class ListTrackedEventsUseCase {
  constructor(
    private readonly eventCardQuery: Pick<EventCardQuery, "tracked">,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(input: ListTrackedEventsFilter | undefined, actor: AuthenticatedUser): Promise<EventCardDto[]> {
    await this.recurrences.materialize(actor.userId, input?.to);
    const cards = await this.eventCardQuery.tracked({ ...input, userId: actor.userId });
    return cards.map(toEventCardDto);
  }
}
