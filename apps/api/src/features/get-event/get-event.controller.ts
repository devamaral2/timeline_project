import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import type { EventDetailDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetEventUseCase } from "./get-event.usecase";

@Controller("api/events")
export class GetEventController {
  constructor(@Inject(GetEventUseCase) private readonly getEvent: GetEventUseCase) {}

  @Get(":eventId")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Param("eventId") eventId: string, @CurrentUser() actor: AuthenticatedUser): Promise<EventDetailDto> {
    const event = await this.getEvent.execute({ eventId }, actor);
    if (!event) throw new NotFoundException("Event not found");
    return event;
  }
}
