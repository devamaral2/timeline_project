import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Post, UseGuards } from "@nestjs/common";
import { NOTE_REPOSITORY, RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { NoteRepository, RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { AttachNotesToRecurrenceUseCase } from "./attach-notes-to-recurrence.usecase";

@Controller("api/recurrences")
export class AttachNotesToRecurrenceController {
  constructor(
    @Inject(AttachNotesToRecurrenceUseCase) private readonly attachNotes: AttachNotesToRecurrenceUseCase,
  ) {}

  @Post(":recurrenceId/notes")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("recurrenceId") recurrenceId: string,
    @Body() body: { noteIds: string[] },
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.attachNotes.execute({ recurrenceId, noteIds: body?.noteIds }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [AttachNotesToRecurrenceController],
  providers: [{
    provide: AttachNotesToRecurrenceUseCase,
    inject: [RECURRENCE_REPOSITORY, NOTE_REPOSITORY],
    useFactory: (recurrences: RecurrenceRepository, notes: NoteRepository) =>
      new AttachNotesToRecurrenceUseCase(recurrences, notes),
  }],
})
export class AttachNotesToRecurrenceModule {}
