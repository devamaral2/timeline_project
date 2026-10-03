import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import type { NoteDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetNoteUseCase } from "./get-note.usecase";

@Controller("api/notes")
export class GetNoteController {
  constructor(@Inject(GetNoteUseCase) private readonly getNote: GetNoteUseCase) {}

  @Get(":noteId")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Param("noteId") noteId: string, @CurrentUser() actor: AuthenticatedUser): Promise<NoteDto> {
    const note = await this.getNote.execute({ noteId }, actor);
    if (!note) throw new NotFoundException("Note not found");
    return note;
  }
}
