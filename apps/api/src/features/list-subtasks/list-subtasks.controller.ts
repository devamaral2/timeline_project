import { Controller, Get, Inject, Module, Param, UseGuards } from "@nestjs/common";
import type { EventCardDto } from "@repo/contracts";
import { EVENT_CARD_QUERY, EVENT_REPOSITORY } from "../../infrastructure/persistence";
import type { EventCardQuery, EventRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListSubtasksUseCase } from "./list-subtasks.usecase";

@Controller("api/events")
export class ListSubtasksController {
  constructor(@Inject(ListSubtasksUseCase) private readonly listSubtasks: ListSubtasksUseCase) {}

  @Get(":eventId/subtasks")
  @UseGuards(GatewayIdentityGuard)
  execute(@Param("eventId") eventId: string, @CurrentUser() actor: AuthenticatedUser): Promise<EventCardDto[]> {
    return this.listSubtasks.execute({ eventId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListSubtasksController],
  providers: [{
    provide: ListSubtasksUseCase,
    inject: [EVENT_REPOSITORY, EVENT_CARD_QUERY],
    useFactory: (events: EventRepository, cards: EventCardQuery) => new ListSubtasksUseCase(events, cards),
  }],
})
export class ListSubtasksModule {}
