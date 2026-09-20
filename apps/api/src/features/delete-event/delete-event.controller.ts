import { Controller, Delete, HttpCode, HttpStatus, Inject, Module, Param, UseGuards } from "@nestjs/common";
import { EVENT_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DeleteEventUseCase } from "./delete-event.usecase";

@Controller("api/events")
export class DeleteEventController {
  constructor(@Inject(DeleteEventUseCase) private readonly deleteEvent: DeleteEventUseCase) {}

  @Delete(":eventId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Param("eventId") eventId: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    await this.deleteEvent.execute({ eventId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [DeleteEventController],
  providers: [{
    provide: DeleteEventUseCase,
    inject: [EVENT_REPOSITORY],
    useFactory: (events: EventRepository) => new DeleteEventUseCase(events),
  }],
})
export class DeleteEventModule {}
