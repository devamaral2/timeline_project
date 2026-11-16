import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import type { TaskDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetEventUseCase } from "./get-event.usecase";

@Controller("api/tasks")
export class GetEventController {
  constructor(@Inject(GetEventUseCase) private readonly getEvent: GetEventUseCase) {}

  @Get(":taskId")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Param("taskId") taskId: string, @CurrentUser() actor: AuthenticatedUser): Promise<TaskDto> {
    const event = await this.getEvent.execute({ eventId: taskId }, actor);
    if (!event) throw new NotFoundException("Event not found");
    return event;
  }
}
