import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { NoteValidationError, isAgentFileNoteType, isRouterNoteType } from "../../domain";
import type { NoteRepository } from "../../domain/ports";

export class DeleteNoteUseCase {
  constructor(private readonly noteRepository: NoteRepository) {}

  async execute(input: { noteId: string }, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.noteRepository.findById(input.noteId);
    // As notas de skill e agente espelham arquivos da pasta (ADR 0005): quem as mantem e a API.
    if (existing && isAgentFileNoteType(existing.type)) {
      throw new NoteValidationError("Skill and agent notes follow the files and cannot be deleted");
    }
    if (existing && isRouterNoteType(existing.type)) {
      throw new NoteValidationError("Router notes follow the JEV config and cannot be deleted");
    }
    await this.noteRepository.delete(input.noteId, actor.userId);
  }
}
