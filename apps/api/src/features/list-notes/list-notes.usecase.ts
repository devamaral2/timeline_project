import type { NoteDto } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { NoteLinkQuery, NoteRepository } from "../../domain/ports";
import { toNoteDto } from "../../api-core/dto/note.dto";

export class ListNotesUseCase {
  constructor(
    private readonly noteRepository: Pick<NoteRepository, "listByUserId">,
    private readonly linkQuery: NoteLinkQuery,
  ) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<NoteDto[]> {
    const notes = await this.noteRepository.listByUserId(actor.userId);
    const links = await this.linkQuery.linksOf(notes.map((note) => note.id));
    return notes.map((note) => toNoteDto(note, links.get(note.id) ?? []));
  }
}
