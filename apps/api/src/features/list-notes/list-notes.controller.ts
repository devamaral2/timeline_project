import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { KnownNoteType, NoteDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { normalizeSearch, parseEnum } from "../../api-core/list-filters";
import { parseLimit } from "../../api-core/http-input-validation";
import { ListNotesUseCase } from "./list-notes.usecase";

const NOTE_TYPES: readonly KnownNoteType[] = ["text", "meal", "sleep", "training"];

@Controller("api/notes")
export class ListNotesController {
  constructor(@Inject(ListNotesUseCase) private readonly listNotes: ListNotesUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("type") type?: string,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
    @Query("eventId") eventId?: string,
    @Query("taskId") taskId?: string,
    @Query("limit") limit?: string,
  ): Promise<NoteDto[]> {
    return this.listNotes.execute(
      {
        type: parseEnum<KnownNoteType>("type", type, NOTE_TYPES),
        tag: tag?.trim() || undefined,
        q: normalizeSearch(q),
        eventId: eventId || undefined,
        taskId: taskId || undefined,
        limit: parseLimit(limit),
      },
      actor,
    );
  }
}
