import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { AgendaPageDto } from "@repo/contracts";
import { ACTORS, AGENDA_KINDS, type Actor, type TaskKind } from "../../domain/index";
import { assertAgendaCursor, parseLimit } from "../../api-core/http-input-validation";
import { parseEnum, parseInstant } from "../../api-core/list-filters";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListAgendaTasksUseCase } from "./list-agenda-tasks.usecase";


@Controller("api/tasks")
export class ListAgendaTasksController {
  constructor(@Inject(ListAgendaTasksUseCase) private readonly listAgendaTasks: ListAgendaTasksUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  async execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("actor") taskActor?: string,
    @Query("kind") kind?: string,
    @Query("tag") tag?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<AgendaPageDto> {
    if (cursor !== undefined) assertAgendaCursor(cursor);
    return this.listAgendaTasks.execute(
      {
        from: parseInstant("from", from),
        to: parseInstant("to", to),
        actor: parseEnum<Actor>("actor", taskActor, ACTORS),
        kind: parseEnum<TaskKind>("kind", kind, AGENDA_KINDS),
        tag: tag?.trim().toLowerCase() || undefined,
        cursor,
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}
