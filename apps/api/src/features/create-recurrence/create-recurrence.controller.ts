import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { CreateRecurrenceInput } from "@repo/contracts";
import { EVENT_REPOSITORY, RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository, RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertRecurrenceTemplate } from "../../api-core/http-input-validation";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateRecurrenceUseCase } from "./create-recurrence.usecase";

@Controller("api/recurrences")
export class CreateRecurrenceController {
  constructor(@Inject(CreateRecurrenceUseCase) private readonly createRecurrence: CreateRecurrenceUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateRecurrenceInput, @CurrentUser() actor: AuthenticatedUser): Promise<{ recurrenceId: string }> {
    assertRecurrenceTemplate(body.template, true);
    return this.createRecurrence.execute(body, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateRecurrenceController],
  providers: [{
    provide: CreateRecurrenceUseCase,
    inject: [RECURRENCE_REPOSITORY, CreateEventUseCase, EVENT_REPOSITORY],
    useFactory: (recurrences: RecurrenceRepository, createEvent: CreateEventUseCase, events: EventRepository) =>
      new CreateRecurrenceUseCase(recurrences, createEvent, events),
  }],
})
export class CreateRecurrenceModule {}
