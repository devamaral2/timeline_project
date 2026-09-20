import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import type { CreateEventInput } from "@repo/contracts";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { assertEventMarks, assertEventWindow } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/events")
export class CreateEventController {
  constructor(@Inject(CreateEventUseCase) private readonly createEvent: CreateEventUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateEventInput, @CurrentUser() actor: AuthenticatedUser): Promise<{ eventId: string }> {
    assertEventMarks(body);
    assertEventWindow(body);
    return this.createEvent.execute(body, actor);
  }
}
