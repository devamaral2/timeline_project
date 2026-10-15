import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventRepository, NoteRepository } from "../../domain/ports";
import type { CreateEventInput, CreateNoteInput } from "@repo/contracts";
import {
  DEFAULT_EVENT_KIND,
  Event,
  EventValidationError,
  NoteNotFoundError,
  NoteOwnershipError,
  isEventKind,
  type EventKind,
  type Note,
  type NoteLink,
} from "../../domain";
import { getMealEventName } from "./services/meal-event-name.service";
import type { ResolvedEventSchedule } from "./services/event-schedule.service";
import type { NoteBuilder } from "../notes/services/note-builder.service";

export const EVENT_TIME_ZONE = "America/Sao_Paulo";

/** O evento montado e as notes novas que nascem com ele — nada gravado ainda. */
export interface PreparedEvent {
  event: Event;
  notes: Note[];
}

/**
 * O controller ja recusa uma data invalida; aqui so traduzimos o que veio. Nao
 * ha limite de quao longe no passado ou no futuro o evento pode cair.
 */
function parseInstant(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new EventValidationError("Invalid date");
  return instant;
}

export class CreateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly noteRepository: Pick<NoteRepository, "findByIds">,
    private readonly noteBuilder: NoteBuilder,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: CreateEventInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedEventSchedule,
  ): Promise<{ eventId: string }> {
    const prepared = await this.prepare(input, actor, schedule);
    await this.save(prepared);
    return { eventId: prepared.event.id };
  }

  /** Monta uma note como a criacao de evento montaria: refeicao pendente, treino pelo catalogo. */
  buildNote(input: CreateNoteInput, actor: AuthenticatedUser, startedAt: Date): Promise<Note> {
    return this.noteBuilder.fromCreateInput(input, actor.userId, startedAt);
  }

  /** Grava o que `prepare` montou: as notes novas e o evento, numa transacao so. */
  async save({ event, notes }: PreparedEvent): Promise<void> {
    await this.eventRepository.save(event, { created: notes });
  }

  /**
   * Monta o evento sem gravar. A serie usa isto para validar o template e
   * resolver o template. A refeicao so passa pelo modelo depois da gravacao.
   */
  async prepare(
    input: CreateEventInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedEventSchedule,
  ): Promise<PreparedEvent> {
    const startedAt = schedule?.startedAt ?? parseInstant(input.startedAt) ?? this.clock();
    const finishedAt = schedule?.finishedAt ?? parseInstant(input.finishedAt);
    if (input.kind !== undefined && !isEventKind(input.kind)) {
      throw new EventValidationError(`Unknown event kind: ${String(input.kind)}`);
    }

    const created = await Promise.all(
      (input.notes ?? []).map((noteInput) => this.noteBuilder.fromCreateInput(
        noteInput.type === "meal" && !noteInput.data?.inputText?.trim()
          ? { ...noteInput, data: { inputText: input.description?.trim() || input.name?.trim() || getMealEventName(startedAt, EVENT_TIME_ZONE) } }
          : noteInput,
        actor.userId, startedAt,
      )),
    );
    const existing = await this.assertOwnedNotes(input.noteIds ?? [], actor);

    const kind = input.kind ?? inferKind(created);
    if (kind === "meal" && ![...created, ...existing].some((note) => note.type === "meal")) {
      created.push(await this.noteBuilder.fromCreateInput({
        type: "meal",
        data: { inputText: input.description?.trim() || input.name?.trim() || getMealEventName(startedAt, EVENT_TIME_ZONE) },
      }, actor.userId, startedAt));
    }
    const noteLinks: NoteLink[] = [
      ...created.map((note) => ({ noteId: note.id, fromRecurrence: false })),
      ...(input.noteIds ?? []).map((noteId) => ({ noteId, fromRecurrence: false })),
    ];

    const event = Event.create({
      userId: actor.userId,
      name: input.name ?? this.deriveName(kind, startedAt, created),
      description: input.description ?? "",
      startedAt,
      finishedAt,
      tags: input.tags ?? [],
      interruptions: [],
      kind,
      noteLinks,
      missed: input.missed,
      priority: input.priority,
      notifyOffsetsMinutes: input.notifyOffsetsMinutes,
    });
    return { event, notes: created };
  }

  /** Notes existentes so entram no evento se forem do mesmo usuario. */
  private async assertOwnedNotes(noteIds: readonly string[], actor: AuthenticatedUser): Promise<Note[]> {
    if (noteIds.length === 0) return [];
    const found = await this.noteRepository.findByIds(noteIds);
    const byId = new Map(found.map((note) => [note.id, note]));
    for (const noteId of noteIds) {
      const note = byId.get(noteId);
      if (!note) throw new NoteNotFoundError(`Note not found: ${noteId}`);
      if (note.userId !== actor.userId) throw new NoteOwnershipError();
    }
    return found;
  }

  private deriveName(kind: EventKind, startedAt: Date, notes: readonly Note[]): string {
    switch (kind) {
      case "sleep":
        return "Sono";
      case "training":
        return "Treino";
      case "meal": {
        const meal = notes.find((note) => note.type === "meal");
        return meal ? (meal.data as { name: string }).name : getMealEventName(startedAt, EVENT_TIME_ZONE);
      }
      default:
        throw new EventValidationError("Event requires a name");
    }
  }
}

/** Sem `kind` dito, a primeira note de meal, sleep ou training da a natureza; senao e rotina. */
function inferKind(notes: readonly Note[]): EventKind {
  for (const note of notes) {
    if (isEventKind(note.type) && note.type !== DEFAULT_EVENT_KIND) return note.type;
  }
  return DEFAULT_EVENT_KIND;
}
