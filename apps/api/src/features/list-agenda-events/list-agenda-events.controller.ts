import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { AgendaPageDto } from "@repo/contracts";
import { ACTORS, EVENT_KINDS, type Actor, type EventKind } from "../../domain";
import { assertAgendaCursor, parseLimit } from "../../api-core/http-input-validation";
import { parseEnum, parseInstant } from "../../api-core/list-filters";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListAgendaEventsUseCase } from "./list-agenda-events.usecase";

/** Os passos nunca aparecem na agenda, entao nao sao um filtro. */
const AGENDA_KINDS = EVENT_KINDS.filter((kind) => kind !== "step");

@Controller("api/events")
export class ListAgendaEventsController {
  constructor(@Inject(ListAgendaEventsUseCase) private readonly listAgendaEvents: ListAgendaEventsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  async execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("actor") eventActor?: string,
    @Query("kind") kind?: string,
    @Query("tag") tag?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<AgendaPageDto> {
    if (cursor !== undefined) assertAgendaCursor(cursor);
    return this.listAgendaEvents.execute(
      {
        from: parseInstant("from", from),
        to: parseInstant("to", to),
        actor: parseEnum<Actor>("actor", eventActor, ACTORS),
        kind: parseEnum<EventKind>("kind", kind, AGENDA_KINDS),
        tag: tag?.trim().toLowerCase() || undefined,
        cursor,
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}
