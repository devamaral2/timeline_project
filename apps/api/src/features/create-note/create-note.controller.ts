import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { CreateNoteRequest } from "@repo/contracts";
import { ENTITY_BATCH_WRITER, EVENT_REPOSITORY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { EntityBatchWriter, EventRepository, TaskRepository } from "../../domain/ports";
import { NoteBuilder } from "../../api-core/notes/services/note-builder.service";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertNoteRequest } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateNoteUseCase } from "./create-note.usecase";

@Controller("api/notes")
export class CreateNoteController {
  constructor(@Inject(CreateNoteUseCase) private readonly createNote: CreateNoteUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateNoteRequest, @CurrentUser() actor: AuthenticatedUser): Promise<{ noteId: string }> {
    assertNoteRequest(body, true);
    return this.createNote.execute(body, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateNoteController],
  providers: [{
    provide: CreateNoteUseCase,
    inject: [NoteBuilder, EVENT_REPOSITORY, TASK_REPOSITORY, ENTITY_BATCH_WRITER],
    useFactory: (builder: NoteBuilder, events: EventRepository, tasks: TaskRepository, writer: EntityBatchWriter) =>
      new CreateNoteUseCase(builder, { events, tasks }, writer),
  }],
})
export class CreateNoteModule {}
