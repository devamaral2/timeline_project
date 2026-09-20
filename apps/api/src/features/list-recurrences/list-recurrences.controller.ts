import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { RecurrenceDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListRecurrencesUseCase } from "./list-recurrences.usecase";

@Controller("api/recurrences")
export class ListRecurrencesController {
  constructor(@Inject(ListRecurrencesUseCase) private readonly listRecurrences: ListRecurrencesUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(@CurrentUser() actor: AuthenticatedUser): Promise<RecurrenceDto[]> {
    return this.listRecurrences.execute(undefined, actor);
  }
}
