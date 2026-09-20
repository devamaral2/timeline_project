import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateEventInput } from "@repo/contracts";
import { EVENT_REPOSITORY, WORKOUT_CATALOG } from "../../infrastructure/persistence";
import type { EventRepository, WorkoutCatalog } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertEventMarks, assertEventWindow, assertExpectedRevision } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { UpdateEventUseCase } from "./update-event.usecase";

@Controller("api/events")
export class UpdateEventController {
  constructor(@Inject(UpdateEventUseCase) private readonly updateEvent: UpdateEventUseCase) {}

  @Patch(":eventId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("eventId") eventId: string,
    @Body() body: UpdateEventInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertEventMarks(body);
    assertEventWindow(body);
    assertExpectedRevision(body);
    await this.updateEvent.execute({ ...body, eventId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateEventController],
  providers: [{
    provide: UpdateEventUseCase,
    inject: [EVENT_REPOSITORY, WORKOUT_CATALOG],
    useFactory: (events: EventRepository, catalog: WorkoutCatalog) => new UpdateEventUseCase(events, catalog),
  }],
})
export class UpdateEventModule {}
