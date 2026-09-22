import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TimelineEventQuery } from "../../domain/ports";
import type { TimelineEventPageDto } from "@repo/contracts";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

const DEFAULT_LIMIT = 50;

export class ListTimelineEventsUseCase {
  constructor(
    private readonly timelineEventQuery: TimelineEventQuery,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(
    input: {
      from?: string;
      to?: string;
      type?: string;
      tag?: string;
      cursor?: string;
      limit?: number;
    },
    actor: AuthenticatedUser,
  ): Promise<TimelineEventPageDto> {
    const to = input.to ? new Date(input.to) : undefined;
    // Antes de ler, as series do usuario ficam geradas ate o dia pedido.
    await this.recurrences.materialize(actor.userId, to);
    return this.timelineEventQuery.list({
      userId: actor.userId,
      from: input.from ? new Date(input.from) : undefined,
      to,
      type: input.type,
      tag: input.tag,
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_LIMIT,
    });
  }
}
