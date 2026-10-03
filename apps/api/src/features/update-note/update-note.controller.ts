import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateNoteInput } from "@repo/contracts";
import { EVENT_REPOSITORY, NOTE_REPOSITORY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository, NoteRepository, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertExpectedRevision, assertNoteFields } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { UpdateNoteUseCase } from "./update-note.usecase";

@Controller("api/notes")
export class UpdateNoteController {
  constructor(@Inject(UpdateNoteUseCase) private readonly updateNote: UpdateNoteUseCase) {}

  @Patch(":noteId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("noteId") noteId: string,
    @Body() body: UpdateNoteInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertNoteFields(body, false);
    assertExpectedRevision(body);
    await this.updateNote.execute({ ...body, noteId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateNoteController],
  providers: [{
    provide: UpdateNoteUseCase,
    inject: [NOTE_REPOSITORY, EVENT_REPOSITORY, TASK_REPOSITORY],
    useFactory: (notes: NoteRepository, events: EventRepository, tasks: TaskRepository) =>
      new UpdateNoteUseCase(notes, { events, tasks }),
  }],
})
export class UpdateNoteModule {}
