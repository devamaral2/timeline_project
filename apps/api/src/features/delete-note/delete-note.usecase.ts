import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { NoteRepository } from "../../domain/ports";

export class DeleteNoteUseCase {
  constructor(private readonly noteRepository: NoteRepository) {}

  async execute(input: { noteId: string }, actor: AuthenticatedUser): Promise<void> {
    await this.noteRepository.delete(input.noteId, actor.userId);
  }
}
