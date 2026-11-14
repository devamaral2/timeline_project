import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { EventCardDto } from "@repo/contracts";
import { ACTORS, EVENT_STATUSES, PRIORITIES, type Actor, type EventPriority, type EventStatus } from "../../domain";
import { parseLimit } from "../../api-core/http-input-validation";
import { normalizeSearch, parseEnum, parseEnumList, parseInstant } from "../../api-core/list-filters";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListTrackedEventsUseCase } from "./list-tracked-events.usecase";

function parseBoolean(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw !== "true" && raw !== "false") throw new BadRequestException(`Invalid ${name}`);
  return raw === "true";
}

@Controller("api/events")
export class ListTrackedEventsController {
  constructor(@Inject(ListTrackedEventsUseCase) private readonly listTrackedEvents: ListTrackedEventsUseCase) {}

  @Get("tracked")
  @UseGuards(GatewayIdentityGuard)
  execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("actor") eventActor?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("longRunning") longRunning?: string,
    @Query("limit") limit?: string,
  ): Promise<EventCardDto[]> {
    return this.listTrackedEvents.execute(
      {
        actor: parseEnum<Actor>("actor", eventActor, ACTORS),
        status: parseEnumList<EventStatus>("status", status, EVENT_STATUSES),
        priority: parseEnumList<EventPriority>("priority", priority, PRIORITIES),
        tag: tag?.trim().toLowerCase() || undefined,
        q: normalizeSearch(q),
        from: parseInstant("from", from),
        to: parseInstant("to", to),
        longRunning: parseBoolean("longRunning", longRunning),
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}
