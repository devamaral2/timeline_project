import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { Actor } from "../../domain/index";
import type { TaskCardQuery } from "../../domain/ports";
import type { AgendaPageDto } from "@repo/contracts";
import { toTaskCardDto } from "../../api-core/dto/task.dto";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../api-core/recurrences/materialize-recurrences.usecase";

const DEFAULT_LIMIT = 50;

export interface ListAgendaTasksInput {
  from?: Date;
  to?: Date;
  /** Ausente, pessoa e agente juntos. */
  actor?: Actor;
  kind?: string;
  tag?: string;
  cursor?: string;
  limit?: number;
}

export class ListAgendaTasksUseCase {
  constructor(
    private readonly taskCardQuery: Pick<TaskCardQuery, "agenda">,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(input: ListAgendaTasksInput, actor: AuthenticatedUser): Promise<AgendaPageDto> {
    // Antes de ler, as series do usuario ficam geradas ate o dia pedido.
    await this.recurrences.materialize(actor.userId, input.to);
    const page = await this.taskCardQuery.agenda({
      userId: actor.userId,
      from: input.from,
      to: input.to,
      actor: input.actor,
      kind: input.kind,
      tag: input.tag,
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_LIMIT,
    });
    return { items: page.items.map(toTaskCardDto), ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
  }
}
