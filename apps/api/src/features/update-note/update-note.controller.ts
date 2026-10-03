import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import type { UpdateNoteRequest } from "@repo/contracts";
import {
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  NOTE_LINK_QUERY,
  NOTE_REPOSITORY,
  TASK_REPOSITORY,
} from "../../infrastructure/persistence";
import type {
  EntityBatchWriter,
  EventRepository,
  NoteLinkQuery,
  NoteRepository,
  TaskRepository,
} from "../../domain/ports";
import { NoteBuilder } from "../../api-core/notes/services/note-builder.service";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertExpectedRevision, assertNoteRequest } from "../../api-core/http-input-validation";
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
    @Body() body: UpdateNoteRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertNoteRequest(body, false);
    assertExpectedRevision(body);
    await this.updateNote.execute({ ...body, noteId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [UpdateNoteController],
  providers: [{
    provide: UpdateNoteUseCase,
    inject: [NOTE_REPOSITORY, NOTE_LINK_QUERY, NoteBuilder, EVENT_REPOSITORY, TASK_REPOSITORY, ENTITY_BATCH_WRITER],
    useFactory: (
      notes: NoteRepository,
      links: NoteLinkQuery,
      builder: NoteBuilder,
      events: EventRepository,
      tasks: TaskRepository,
      writer: EntityBatchWriter,
    ) => new UpdateNoteUseCase(notes, links, builder, { events, tasks }, writer),
  }],
})
export class UpdateNoteModule {}
