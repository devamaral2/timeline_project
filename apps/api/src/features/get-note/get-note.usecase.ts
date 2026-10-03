import type { NoteDto } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { NoteOwnershipError } from "../../domain";
import type { NoteLinkQuery, NoteRepository } from "../../domain/ports";
import { toNoteDto } from "../../api-core/dto/note.dto";

export class GetNoteUseCase {
  constructor(
    private readonly noteRepository: Pick<NoteRepository, "findById">,
    private readonly linkQuery: NoteLinkQuery,
  ) {}

  async execute(input: { noteId: string }, actor: AuthenticatedUser): Promise<NoteDto | null> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) return null;
    if (note.userId !== actor.userId) throw new NoteOwnershipError();

    const links = await this.linkQuery.linksOf([note.id]);
    return toNoteDto(note, links.get(note.id) ?? []);
  }
}
