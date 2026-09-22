import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { TimelineEventPageDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { assertTimelineCursor, parseLimit } from "../../api-core/http-input-validation";
import { ListTimelineEventsUseCase } from "./list-timeline-events.usecase";

@Controller("api/events")
export class ListTimelineEventsController {
  constructor(@Inject(ListTimelineEventsUseCase) private readonly listTimelineEvents: ListTimelineEventsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  async execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("type") type?: string,
    @Query("tag") tag?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<TimelineEventPageDto> {
    if (from && Number.isNaN(new Date(from).getTime())) throw new BadRequestException("Invalid from date");
    if (to && Number.isNaN(new Date(to).getTime())) throw new BadRequestException("Invalid to date");
    if (cursor !== undefined) assertTimelineCursor(cursor);
    return this.listTimelineEvents.execute({ from, to, type, tag, cursor, limit: parseLimit(limit) }, actor);
  }
}
