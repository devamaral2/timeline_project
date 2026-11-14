import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateRecurrenceInput } from "@repo/contracts";
import { EVENT_REPOSITORY, RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository, RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertRecurrenceTemplate } from "../../api-core/http-input-validation";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { UpdateRecurrenceUseCase } from "./update-recurrence.usecase";

@Controller("api/recurrences")
export class UpdateRecurrenceController {
  constructor(@Inject(UpdateRecurrenceUseCase) private readonly updateRecurrence: UpdateRecurrenceUseCase) {}

  @Patch(":recurrenceId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("recurrenceId") recurrenceId: string,
    @Body() body: Omit<UpdateRecurrenceInput, "recurrenceId">,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    if (!Number.isInteger(body?.expectedRevision) || body.expectedRevision < 1) {
      throw new BadRequestException("Invalid expectedRevision");
    }
    assertRecurrenceTemplate(body.template, false);
    await this.updateRecurrence.execute({ ...body, recurrenceId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateRecurrenceController],
  providers: [{
    provide: UpdateRecurrenceUseCase,
    inject: [RECURRENCE_REPOSITORY, CreateEventUseCase, EVENT_REPOSITORY],
    useFactory: (recurrences: RecurrenceRepository, createEvent: CreateEventUseCase, events: EventRepository) =>
      new UpdateRecurrenceUseCase(recurrences, createEvent, events),
  }],
})
export class UpdateRecurrenceModule {}
