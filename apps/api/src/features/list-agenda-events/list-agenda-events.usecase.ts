import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { Actor } from "../../domain";
import type { EventCardQuery } from "../../domain/ports";
import type { AgendaPageDto } from "@repo/contracts";
import { toEventCardDto } from "../../api-core/dto/event.dto";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

const DEFAULT_LIMIT = 50;

export interface ListAgendaEventsInput {
  from?: Date;
  to?: Date;
  /** Ausente, pessoa e agente juntos. */
  actor?: Actor;
  kind?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
}

export class ListAgendaEventsUseCase {
  constructor(
    private readonly eventCardQuery: Pick<EventCardQuery, "agenda">,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(input: ListAgendaEventsInput, actor: AuthenticatedUser): Promise<AgendaPageDto> {
    // Antes de ler, as series do usuario ficam geradas ate o dia pedido.
    await this.recurrences.materialize(actor.userId, input.to);
    const page = await this.eventCardQuery.agenda({
      userId: actor.userId,
      from: input.from,
      to: input.to,
      actor: input.actor,
      kind: input.kind,
      tag: input.tag,
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_LIMIT,
    });
    return { items: page.items.map(toEventCardDto), ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
  }
}
