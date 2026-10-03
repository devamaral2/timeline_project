import type { NoteDto } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { NoteRepository } from "../../domain/ports";
import { toNoteDto } from "../../api-core/dto/note.dto";
import { resolveNoteLinks, type NoteTargetRepositories } from "../../api-core/notes/note-targets";

export class ListNotesUseCase {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly targets: NoteTargetRepositories,
  ) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<NoteDto[]> {
    const notes = await this.noteRepository.listByUserId(actor.userId);
    const links = await resolveNoteLinks(notes, this.targets);
    return notes.map((note) => toNoteDto(note, links.get(note.id)));
  }
}
