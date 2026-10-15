import {
  EventValidationError,
  Interruption,
  isEventKind,
  NoteNotFoundError,
  NoteOwnershipError,
  type Event,
  type Note,
  type NoteLink,
  type NoteWrites,
} from "../../../domain";
import type { NoteRepository } from "../../../domain/ports";
import type {
  InterruptionPatchInput,
  UpdateEventInput,
  UpdateEventNoteInput,
} from "@repo/contracts";
import type { NoteBuilder } from "../../notes/services/note-builder.service";

/** O evento revisado e as notes que precisam ser gravadas junto com ele. */
export interface MergedEventUpdate {
  event: Event;
  notes: NoteWrites;
}

export async function mergeEventUpdate(
  existingEvent: Event,
  input: UpdateEventInput,
  deps: { noteBuilder: NoteBuilder; noteRepository: Pick<NoteRepository, "findByIds"> },
  now: Date,
): Promise<MergedEventUpdate> {
  if (input.kind !== undefined && !isEventKind(input.kind)) {
    throw new EventValidationError(`Unknown event kind: ${String(input.kind)}`);
  }
  const merged: { noteLinks: NoteLink[] | undefined; writes: NoteWrites } = input.notes
    ? await mergeNotes(existingEvent, input.notes, deps)
    : { noteLinks: undefined, writes: {} as NoteWrites };

  if ((input.kind ?? existingEvent.kind) === "meal") {
    const links = merged.noteLinks ?? existingEvent.noteLinks;
    const staged = [
      ...(merged.writes.created ?? []),
      ...(merged.writes.updated ?? []).map(({ note }) => note),
    ];
    const byId = new Map(staged.map((note) => [note.id, note]));
    const unresolved = links.map(({ noteId }) => noteId).filter((id) => !byId.has(id));
    const persisted = unresolved.length ? await deps.noteRepository.findByIds(unresolved) : [];
    for (const note of persisted) byId.set(note.id, note);
    const hasMeal = links.some(({ noteId }) => {
      const note = byId.get(noteId);
      return note?.type === "meal" && note.userId === existingEvent.userId;
    });
    if (!hasMeal) {
      const note = await deps.noteBuilder.fromCreateInput({
        type: "meal",
        data: {
          inputText: (input.description ?? existingEvent.description).trim() ||
            (input.name ?? existingEvent.name),
        },
      }, existingEvent.userId, input.startedAt ? new Date(input.startedAt) : existingEvent.startedAt);
      merged.writes = { ...merged.writes, created: [...(merged.writes.created ?? []), note] };
      merged.noteLinks = [...links, { noteId: note.id, fromRecurrence: false }];
    }
  }

  const event = existingEvent.revise({
    name: input.name,
    description: input.description,
    startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
    finishedAt: input.finishedAt !== undefined ? new Date(input.finishedAt) : undefined,
    tags: input.tags,
    kind: input.kind,
    missed: input.missed,
    priority: input.priority,
    notifyOffsetsMinutes: input.notifyOffsetsMinutes,
    interruptions: mergeInterruptions(existingEvent.interruptions, input.interruptions, now),
    noteLinks: merged.noteLinks,
  });
  return { event, notes: merged.writes };
}

/**
 * A lista de notes de um evento ao editar. Cada entrada com `id` e uma note que
 * ja existe — ja estava no evento, ou e outra do mesmo usuario que passa a
 * estar —; sem `id`, nasce uma note nova. Quem nao esta na lista deixa de
 * aparecer no evento, mas a note continua existindo.
 */
async function mergeNotes(
  existingEvent: Event,
  entries: UpdateEventNoteInput[],
  deps: { noteBuilder: NoteBuilder; noteRepository: Pick<NoteRepository, "findByIds"> },
): Promise<{ noteLinks: NoteLink[]; writes: NoteWrites }> {
  const ids = entries.flatMap((entry) => (entry.id ? [entry.id] : []));
  const found = ids.length > 0 ? await deps.noteRepository.findByIds(ids) : [];
  const byId = new Map(found.map((note) => [note.id, note]));
  const currentLinks = new Map(existingEvent.noteLinks.map((link) => [link.noteId, link]));

  const created: Note[] = [];
  const updated: { note: Note; expectedRevision: number }[] = [];
  const noteLinks: NoteLink[] = [];

  for (const entry of entries) {
    if (!entry.id) {
      if (entry.data === undefined) throw new EventValidationError("A new note requires data");
      const note = await deps.noteBuilder.fromUpdateInput(entry, existingEvent.userId);
      created.push(note);
      noteLinks.push({ noteId: note.id, fromRecurrence: false });
      continue;
    }

    const note = byId.get(entry.id);
    if (!note) throw new NoteNotFoundError(`Note not found: ${entry.id}`);
    if (note.userId !== existingEvent.userId) throw new NoteOwnershipError();

    const revised = await reviseNote(note, entry, deps.noteBuilder);
    if (revised) updated.push({ note: revised, expectedRevision: note.revision });
    // O vinculo herdado da serie continua sendo da serie, mesmo se a note foi editada aqui.
    noteLinks.push({ noteId: note.id, fromRecurrence: currentLinks.get(note.id)?.fromRecurrence ?? false });
  }

  return { noteLinks, writes: { created, updated } };
}

/** `undefined` quando a entrada so mantem a note, sem mudar nada nela. */
async function reviseNote(note: Note, entry: UpdateEventNoteInput, noteBuilder: NoteBuilder): Promise<Note | undefined> {
  if (entry.name === undefined && entry.tags === undefined && entry.data === undefined) return undefined;

  const resolved = entry.data !== undefined ? await noteBuilder.resolveUpdateData(entry) : undefined;
  return note.revise({
    name: entry.name,
    tags: entry.tags,
    type: resolved?.type,
    schemaVersion: "schemaVersion" in entry ? entry.schemaVersion : undefined,
    data: resolved?.data,
  });
}

function mergeInterruptions(
  existingInterruptions: Interruption[],
  input: InterruptionPatchInput[] | undefined,
  now: Date,
): Interruption[] {
  if (!input) return existingInterruptions;

  const existingById = new Map(existingInterruptions.map((interruption) => [interruption.id, interruption]));
  const patchedById = new Map<string, Interruption>();
  const newInterruptions: Interruption[] = [];

  for (const patch of input) {
    if (!patch.id) {
      newInterruptions.push(createNewInterruption(patch, now));
      continue;
    }

    const existing = existingById.get(patch.id);
    if (!existing) throw new EventValidationError("Interruption not found on event");
    patchedById.set(patch.id, patchInterruption(existing, patch));
  }

  return [
    ...existingInterruptions.map((interruption) => patchedById.get(interruption.id) ?? interruption),
    ...newInterruptions,
  ];
}

function createNewInterruption(input: InterruptionPatchInput, now: Date): Interruption {
  if (!input.name) throw new EventValidationError("New interruptions require a name");
  const startedAt = input.startedAt ? new Date(input.startedAt) : now;
  const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date(now.getTime() + 120000);
  return Interruption.create({
    name: input.name,
    description: input.description ?? "",
    startedAt,
    finishedAt,
  });
}

function patchInterruption(existing: Interruption, input: InterruptionPatchInput): Interruption {
  return Interruption.create({
    id: existing.id,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    startedAt: input.startedAt ? new Date(input.startedAt) : existing.startedAt,
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : existing.finishedAt,
  });
}
