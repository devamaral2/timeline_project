import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { CreateNoteInput } from "@repo/contracts";
import { EVENT_REPOSITORY, NOTE_REPOSITORY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository, NoteRepository, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { assertNoteFields } from "../../api-core/http-input-validation";
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
  execute(@Body() body: CreateNoteInput, @CurrentUser() actor: AuthenticatedUser): Promise<{ noteId: string }> {
    assertNoteFields(body, true);
    return this.createNote.execute(body, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateNoteController],
  providers: [{
    provide: CreateNoteUseCase,
    inject: [NOTE_REPOSITORY, EVENT_REPOSITORY, TASK_REPOSITORY],
    useFactory: (notes: NoteRepository, events: EventRepository, tasks: TaskRepository) =>
      new CreateNoteUseCase(notes, { events, tasks }),
  }],
})
export class CreateNoteModule {}
