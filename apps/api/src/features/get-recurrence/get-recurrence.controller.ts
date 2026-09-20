import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import type { RecurrenceDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetRecurrenceUseCase } from "./get-recurrence.usecase";

@Controller("api/recurrences")
export class GetRecurrenceController {
  constructor(@Inject(GetRecurrenceUseCase) private readonly getRecurrence: GetRecurrenceUseCase) {}

  @Get(":recurrenceId")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Param("recurrenceId") recurrenceId: string, @CurrentUser() actor: AuthenticatedUser): Promise<RecurrenceDto> {
    const recurrence = await this.getRecurrence.execute({ recurrenceId }, actor);
    if (!recurrence) throw new NotFoundException("Recurrence not found");
    return recurrence;
  }
}
