import type { KnownNoteType, NoteDto } from "@repo/contracts";
import { hasTag } from "../../api-core/list-filters";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { NoteLinkQuery, NoteRepository } from "../../domain/ports";
import { toNoteDto } from "../../api-core/dto/note.dto";

export interface ListNotesFilter {
  type?: KnownNoteType;
  tag?: string;
  /** Busca no nome e, nas notas de texto, no corpo. Ja normalizada (minuscula). */
  q?: string;
  /** Somente notas ligadas a este evento / esta tarefa. */
  eventId?: string;
  taskId?: string;
  limit?: number;
}

export function filterNotes(notes: NoteDto[], filter: ListNotesFilter): NoteDto[] {
  const matching = notes.filter((note) => {
    if (filter.type && note.type !== filter.type) return false;
    if (!hasTag(note.tags, filter.tag)) return false;
    if (filter.q) {
      const body = note.type === "text" ? note.data.body : "";
      if (!`${note.name}\n${body}`.toLowerCase().includes(filter.q)) return false;
    }
    const links = note.links ?? [];
    if (filter.eventId && !links.some((link) => link.kind === "event" && link.id === filter.eventId)) return false;
    if (filter.taskId && !links.some((link) => link.kind === "task" && link.id === filter.taskId)) return false;
    return true;
  });
  return filter.limit === undefined ? matching : matching.slice(0, filter.limit);
}

export class ListNotesUseCase {
  constructor(
    private readonly noteRepository: Pick<NoteRepository, "listByUserId">,
    private readonly linkQuery: NoteLinkQuery,
  ) {}

  async execute(input: ListNotesFilter | undefined, actor: AuthenticatedUser): Promise<NoteDto[]> {
    const notes = await this.noteRepository.listByUserId(actor.userId);
    const links = await this.linkQuery.linksOf(notes.map((note) => note.id));
    return filterNotes(
      notes.map((note) => toNoteDto(note, links.get(note.id) ?? [])),
      input ?? {},
    );
  }
}
