import { Controller, Delete, HttpCode, HttpStatus, Inject, Module, Param, UseGuards } from "@nestjs/common";
import { NOTE_REPOSITORY } from "../../infrastructure/persistence";
import type { NoteRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { DeleteNoteUseCase } from "./delete-note.usecase";

@Controller("api/notes")
export class DeleteNoteController {
  constructor(@Inject(DeleteNoteUseCase) private readonly deleteNote: DeleteNoteUseCase) {}

  @Delete(":noteId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Param("noteId") noteId: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    await this.deleteNote.execute({ noteId }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [DeleteNoteController],
  providers: [{
    provide: DeleteNoteUseCase,
    inject: [NOTE_REPOSITORY],
    useFactory: (notes: NoteRepository) => new DeleteNoteUseCase(notes),
  }],
})
export class DeleteNoteModule {}
