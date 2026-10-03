import type { NoteDto } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { NoteOwnershipError } from "../../domain";
import type { NoteRepository } from "../../domain/ports";
import { toNoteDto } from "../../api-core/dto/note.dto";
import { resolveNoteLinks, type NoteTargetRepositories } from "../../api-core/notes/note-targets";

export class GetNoteUseCase {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly targets: NoteTargetRepositories,
  ) {}

  async execute(input: { noteId: string }, actor: AuthenticatedUser): Promise<NoteDto | null> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) return null;
    if (note.userId !== actor.userId) throw new NoteOwnershipError();

    const links = await resolveNoteLinks([note], this.targets);
    return toNoteDto(note, links.get(note.id));
  }
}
