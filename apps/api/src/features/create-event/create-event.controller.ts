import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import type { CreateTaskInput } from "@repo/contracts";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { assertEventFields } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/events")
export class CreateEventController {
  constructor(@Inject(CreateEventUseCase) private readonly createEvent: CreateEventUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateTaskInput, @CurrentUser() actor: AuthenticatedUser): Promise<{ taskId: string }> {
    assertEventFields(body as unknown as Record<string, unknown>, false);
    return this.createEvent.execute(body, actor);
  }
}
