import { BadRequestException } from "@nestjs/common";
import { expect, test } from "vitest";
import {
  Event,
  EventNotFoundError,
  EventOwnershipError,
  Note,
  NoteNotFoundError,
  NoteOwnershipError,
  NoteRevisionConflictError,
  NoteValidationError,
  Task,
  TaskOwnershipError,
} from "../../domain";
import { createEventsKit } from "../../api-core/events/testing/in-memory-events-kit";
import { InMemoryNoteLinkQuery } from "../../api-core/notes/testing/in-memory-note-link.query";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { InMemoryEntityBatchWriter } from "../../api-core/agent/testing/in-memory-entity-batch-writer";
import { assertNoteRequest } from "../../api-core/http-input-validation";
import { CreateNoteUseCase } from "../create-note/create-note.usecase";
import { DeleteNoteUseCase } from "../delete-note/delete-note.usecase";
import { GetNoteUseCase } from "../get-note/get-note.usecase";
import { UpdateNoteUseCase } from "../update-note/update-note.usecase";
import { ListNotesUseCase } from "./list-notes.usecase";

const actor = { userId: "user-1" };
const attacker = { userId: "attacker-1" };

const text = (body: string, userId = "user-1", overrides: Partial<Parameters<typeof Note.create>[0]> = {}) =>
  Note.create({ userId, data: { body }, ...overrides });

function lunch(userId = "user-1", noteLinks: Event["noteLinks"] = []): Event {
  return Event.create({
    userId,
    name: "Almoço",
    description: "",
    startedAt: new Date("2026-09-14T12:40:00.000Z"),
    tags: [],
    interruptions: [],
    noteLinks: [...noteLinks],
  });
}

const link = (note: Note) => ({ noteId: note.id, fromRecurrence: false });

function setup(seed: { notes?: Note[]; events?: Event[]; tasks?: Task[] } = {}) {
  const kit = createEventsKit({ events: seed.events, notes: seed.notes });
  const tasks = new InMemoryTaskRepository(seed.tasks);
  const links = new InMemoryNoteLinkQuery(kit.database, tasks);
  const targets = { events: kit.eventRepository, tasks };
  const writer = new InMemoryEntityBatchWriter({ events: kit.eventRepository, tasks, notes: kit.noteRepository });
  return {
    ...kit,
    tasks,
    writer,
    list: new ListNotesUseCase(kit.noteRepository, links),
    get: new GetNoteUseCase(kit.noteRepository, links),
    create: new CreateNoteUseCase(kit.noteBuilder, targets, writer),
    update: new UpdateNoteUseCase(kit.noteRepository, links, kit.noteBuilder, targets, writer),
    remove: new DeleteNoteUseCase(kit.noteRepository),
  };
}

test("lists only the actor's notes, with every event and task each one appears in", async () => {
  const onEventNote = text("Receita do frango", "user-1", { name: "Receita do frango" });
  const onTaskNote = text("Ideias", "user-1", { name: "Ideias" });
  const loose = text("Livros para ler", "user-1", { name: "Livros para ler" });
  const foreign = text("De outro usuário", "user-2");
  const event = lunch("user-1", [link(onEventNote)]);
  const secondEvent = Event.create({
    userId: "user-1",
    name: "Jantar",
    description: "",
    startedAt: new Date("2026-09-14T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    noteLinks: [link(onEventNote)],
  });
  const task = Task.create({
    userId: "user-1",
    name: "Revisar proposta",
    description: "",
    tags: [],
    noteLinks: [link(onTaskNote)],
  });
  const { list } = setup({
    notes: [onEventNote, onTaskNote, loose, foreign],
    events: [event, secondEvent],
    tasks: [task],
  });

  const result = await list.execute(undefined, actor);

  expect(result.map((note) => note.name).sort()).toEqual(["Ideias", "Livros para ler", "Receita do frango"]);
  const byName = Object.fromEntries(result.map((note) => [note.name, note]));
  // A mesma note em dois eventos: os dois vinculos, do mais antigo ao mais novo.
  expect(byName["Receita do frango"].links).toEqual([
    { kind: "event", id: event.id, name: "Almoço", eventKind: "routine", at: "2026-09-14T12:40:00.000Z" },
    { kind: "event", id: secondEvent.id, name: "Jantar", eventKind: "routine", at: "2026-09-14T22:00:00.000Z" },
  ]);
  expect(byName.Ideias.links).toMatchObject([{ kind: "task", id: task.id, name: "Revisar proposta" }]);
  expect(byName["Livros para ler"].links).toEqual([]);
});

test("a note whose targets vanished is listed as a loose note", async () => {
  const note = text("Sobrou");
  // O evento nao esta mais entre os vivos: so a note sobra.
  const { list } = setup({ notes: [note] });

  const [result] = await list.execute(undefined, actor);

  expect(result.links).toEqual([]);
});

test("gets a note with its links, answers null when it does not exist and refuses another user's", async () => {
  const note = text("Receita");
  const event = lunch("user-1", [link(note)]);
  const { get } = setup({ notes: [note], events: [event] });

  expect((await get.execute({ noteId: note.id }, actor))?.links?.[0]?.name).toBe("Almoço");
  expect(await get.execute({ noteId: "missing" }, actor)).toBeNull();
  await expect(get.execute({ noteId: note.id }, attacker)).rejects.toBeInstanceOf(NoteOwnershipError);
});

test("creates a free text note for the actor and derives its name from the first line", async () => {
  const { create, noteRepository } = setup();

  const { noteId } = await create.execute(
    { data: { body: "\nLista do mercado\nArroz, feijão" }, tags: ["casa"] },
    actor,
  );

  const stored = await noteRepository.findById(noteId);
  expect(stored).toMatchObject({ userId: "user-1", type: "text", name: "Lista do mercado", tags: ["casa"] });
});

test("creates a note that already appears in the given events and tasks, in one commit", async () => {
  const event = lunch();
  const task = Task.create({ userId: "user-1", name: "Revisar", description: "", tags: [] });
  const { create, eventRepository, tasks, noteRepository, writer } = setup({ events: [event], tasks: [task] });

  const { noteId } = await create.execute(
    { data: { body: "Anotação" }, eventIds: [event.id, event.id], taskIds: [task.id] },
    actor,
  );

  expect((await eventRepository.findById(event.id))?.noteLinks).toEqual([{ noteId, fromRecurrence: false }]);
  expect((await tasks.findById(task.id))?.noteLinks).toEqual([{ noteId, fromRecurrence: false }]);
  expect(await noteRepository.findById(noteId)).not.toBeNull();
  expect(writer.commits).toHaveLength(1);
});

test("creates typed notes through the same builder as events", async () => {
  const { create, noteRepository } = setup();

  const { noteId } = await create.execute({ type: "sleep", data: { trackedSleepTime: 400, score: 70 } }, actor);

  expect(await noteRepository.findById(noteId)).toMatchObject({ type: "sleep", name: "Sono" });
});

test("creating a note in another user's event or task is refused, and nothing is written", async () => {
  const foreignEvent = lunch("user-2");
  const foreignTask = Task.create({ userId: "user-2", name: "Dele", description: "", tags: [] });
  const { create, writer, database } = setup({ events: [foreignEvent], tasks: [foreignTask] });

  await expect(create.execute({ data: { body: "x" }, eventIds: [foreignEvent.id] }, actor)).rejects.toBeInstanceOf(
    EventOwnershipError,
  );
  await expect(create.execute({ data: { body: "x" }, taskIds: [foreignTask.id] }, actor)).rejects.toBeInstanceOf(
    TaskOwnershipError,
  );
  await expect(create.execute({ data: { body: "x" }, eventIds: ["missing"] }, actor)).rejects.toBeInstanceOf(
    EventNotFoundError,
  );
  expect(writer.commits).toEqual([]);
  expect(database.notes).toEqual([]);
});

test("rejects a blank text body", async () => {
  const { create } = setup();

  await expect(create.execute({ data: { body: "   " } }, actor)).rejects.toBeInstanceOf(NoteValidationError);
});

test("updates the content and tags, bumping the revision", async () => {
  const note = text("Antes");
  const { update, noteRepository } = setup({ notes: [note] });

  await update.execute(
    { noteId: note.id, expectedRevision: 1, type: "text", data: { body: "Depois" }, tags: ["trabalho"] },
    actor,
  );

  expect(await noteRepository.findById(note.id)).toMatchObject({ data: { body: "Depois" }, tags: ["trabalho"], revision: 2 });
});

test("replaces the events and tasks a note appears in: the new ones get it at the end, the dropped ones lose it", async () => {
  const note = text("Receita");
  const kept = lunch("user-1", [link(note)]);
  const dropped = Event.create({
    userId: "user-1",
    name: "Jantar",
    description: "",
    startedAt: new Date("2026-09-14T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    noteLinks: [link(note)],
  });
  const other = text("Outra");
  const added = Event.create({
    userId: "user-1",
    name: "Café",
    description: "",
    startedAt: new Date("2026-09-15T08:00:00.000Z"),
    tags: [],
    interruptions: [],
    noteLinks: [link(other)],
  });
  const { update, eventRepository, noteRepository } = setup({ notes: [note, other], events: [kept, dropped, added] });

  await update.execute({ noteId: note.id, expectedRevision: 1, eventIds: [kept.id, added.id] }, actor);

  expect((await eventRepository.findById(dropped.id))?.noteLinks).toEqual([]);
  expect((await eventRepository.findById(added.id))?.noteLinks.map((l) => l.noteId)).toEqual([other.id, note.id]);
  // Quem ja tinha a note e continua nao e tocado.
  expect((await eventRepository.findById(kept.id))?.revision).toBe(1);
  // Mudar so os vinculos nao edita a note.
  expect((await noteRepository.findById(note.id))?.revision).toBe(1);
});

test("an empty list takes the note out of every event, leaving it loose", async () => {
  const note = text("Solta depois");
  const event = lunch("user-1", [link(note)]);
  const { update, eventRepository, list } = setup({ notes: [note], events: [event] });

  await update.execute({ noteId: note.id, expectedRevision: 1, eventIds: [], taskIds: [] }, actor);

  expect((await eventRepository.findById(event.id))?.noteLinks).toEqual([]);
  expect((await list.execute(undefined, actor))[0].links).toEqual([]);
});

test("without eventIds and taskIds the links stay as they are", async () => {
  const note = text("Fica");
  const event = lunch("user-1", [link(note)]);
  const { update, eventRepository, writer } = setup({ notes: [note], events: [event] });

  await update.execute({ noteId: note.id, expectedRevision: 1, name: "Novo título" }, actor);

  expect((await eventRepository.findById(event.id))?.noteLinks).toEqual([link(note)]);
  expect(writer.commits[0].events).toEqual([]);
});

test("an update that changes nothing writes nothing", async () => {
  const note = text("a");
  const { update, writer } = setup({ notes: [note] });

  await update.execute({ noteId: note.id, expectedRevision: 1 }, actor);

  expect(writer.commits).toEqual([]);
});

test("update refuses a stale revision, a missing note, another user's note and another user's target", async () => {
  const note = text("a");
  const foreignEvent = lunch("user-2");
  const { update } = setup({ notes: [note], events: [foreignEvent] });
  const body = { type: "text", data: { body: "b" } } as const;

  await expect(update.execute({ noteId: note.id, expectedRevision: 7, ...body }, actor)).rejects.toBeInstanceOf(
    NoteRevisionConflictError,
  );
  await expect(update.execute({ noteId: "missing", expectedRevision: 1, ...body }, actor)).rejects.toBeInstanceOf(
    NoteNotFoundError,
  );
  await expect(update.execute({ noteId: note.id, expectedRevision: 1, ...body }, attacker)).rejects.toBeInstanceOf(
    NoteOwnershipError,
  );
  await expect(
    update.execute({ noteId: note.id, expectedRevision: 1, eventIds: [foreignEvent.id] }, actor),
  ).rejects.toBeInstanceOf(EventOwnershipError);
});

test("deletes the actor's note and refuses another user's", async () => {
  const note = text("a");
  const { remove, noteRepository } = setup({ notes: [note] });

  await expect(remove.execute({ noteId: note.id }, attacker)).rejects.toBeInstanceOf(NoteOwnershipError);
  await remove.execute({ noteId: note.id }, actor);

  expect(await noteRepository.findById(note.id)).toBeNull();
});

test("assertNoteRequest validates the wire shape", () => {
  // Criar: texto livre exige o corpo; tipos com default (sono) nao.
  expect(() => assertNoteRequest({}, true)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ type: "poem", data: {} }, true)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ data: [] }, true)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ data: { body: "a" }, name: 3 }, true)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ data: { body: "a" }, eventIds: [1] }, true)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ data: { body: "a" }, tags: ["ok", 1] }, true)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ data: { body: "a" }, taskIds: ["t"], eventIds: [] }, true)).not.toThrow();
  expect(() => assertNoteRequest({ type: "sleep" }, true)).not.toThrow();
  // Editar: `type` e `data` vem juntos ou nao vem.
  expect(() => assertNoteRequest({ data: { body: "a" } }, false)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ type: "text" }, false)).toThrow(BadRequestException);
  expect(() => assertNoteRequest({ eventIds: [], tags: [] }, false)).not.toThrow();
  expect(() => assertNoteRequest({ type: "text", data: { body: "a" } }, false)).not.toThrow();
});
