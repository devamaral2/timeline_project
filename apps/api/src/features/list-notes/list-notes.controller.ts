import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { NoteDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListNotesUseCase } from "./list-notes.usecase";

@Controller("api/notes")
export class ListNotesController {
  constructor(@Inject(ListNotesUseCase) private readonly listNotes: ListNotesUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(@CurrentUser() actor: AuthenticatedUser): Promise<NoteDto[]> {
    return this.listNotes.execute(undefined, actor);
  }
}
