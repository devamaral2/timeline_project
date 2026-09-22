import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { CreateRecurrenceInput } from "@repo/contracts";
import { isRecurrenceTarget } from "../../domain";
import { RECURRENCE_REPOSITORY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { RecurrenceRepository, TaskRepository } from "../../domain/ports";
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
    if (!isRecurrenceTarget(body?.target)) throw new BadRequestException("Invalid target");
    assertRecurrenceTemplate(body.template, true);
    return this.createRecurrence.execute(body, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateRecurrenceController],
  providers: [{
    provide: CreateRecurrenceUseCase,
    inject: [RECURRENCE_REPOSITORY, CreateEventUseCase, TASK_REPOSITORY],
    useFactory: (recurrences: RecurrenceRepository, createEvent: CreateEventUseCase, tasks: TaskRepository) =>
      new CreateRecurrenceUseCase(recurrences, createEvent, tasks),
  }],
})
export class CreateRecurrenceModule {}
