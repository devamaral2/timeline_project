import { BadRequestException } from "@nestjs/common";
import { expect, test } from "vitest";
import {
  Event,
  EventItem,
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
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { InMemoryNoteRepository } from "../../api-core/notes/testing/in-memory-note.repository";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { assertNoteFields } from "../../api-core/http-input-validation";
import { CreateNoteUseCase } from "../create-note/create-note.usecase";
import { DeleteNoteUseCase } from "../delete-note/delete-note.usecase";
import { GetNoteUseCase } from "../get-note/get-note.usecase";
import { UpdateNoteUseCase } from "../update-note/update-note.usecase";
import { ListNotesUseCase } from "./list-notes.usecase";

const actor = { userId: "user-1" };
const attacker = { userId: "attacker-1" };

function lunch(userId = "user-1"): Event {
  return Event.create({
    userId,
    name: "Almoço",
    description: "",
    startedAt: new Date("2026-09-14T12:40:00.000Z"),
    tags: [],
    interruptions: [],
    items: [EventItem.create({ position: 0, type: "routine", schemaVersion: 1, isPrimary: true, data: {} })],
  });
}

function setup(seed: { notes?: Note[]; events?: Event[]; tasks?: Task[] } = {}) {
  const notes = new InMemoryNoteRepository(seed.notes);
  const events = new InMemoryEventRepository(new InMemoryEventDatabase(seed.events));
  const tasks = new InMemoryTaskRepository(seed.tasks);
  const targets = { events, tasks };
  return {
    notes,
    list: new ListNotesUseCase(notes, targets),
    get: new GetNoteUseCase(notes, targets),
    create: new CreateNoteUseCase(notes, targets),
    update: new UpdateNoteUseCase(notes, targets),
    remove: new DeleteNoteUseCase(notes),
  };
}

test("lists only the actor's notes, resolving the event or task each one is attached to", async () => {
  const event = lunch();
  const task = Task.create({ userId: "user-1", name: "Revisar proposta", description: "", tags: [] });
  const onEvent = Note.create({ userId: "user-1", content: "Receita do frango", eventId: event.id });
  const onTask = Note.create({ userId: "user-1", content: "Ideias", taskId: task.id });
  const loose = Note.create({ userId: "user-1", content: "Livros para ler" });
  const foreign = Note.create({ userId: "user-2", content: "De outro usuário" });
  const { list } = setup({ notes: [onEvent, onTask, loose, foreign], events: [event], tasks: [task] });

  const result = await list.execute(undefined, actor);

  expect(result.map((note) => note.name).sort()).toEqual(["Ideias", "Livros para ler", "Receita do frango"]);
  const byName = Object.fromEntries(result.map((note) => [note.name, note]));
  expect(byName["Receita do frango"].link).toEqual({
    kind: "event",
    id: event.id,
    name: "Almoço",
    eventType: "routine",
    at: "2026-09-14T12:40:00.000Z",
  });
  expect(byName.Ideias.link).toMatchObject({ kind: "task", id: task.id, name: "Revisar proposta" });
  expect(byName["Livros para ler"].link).toBeUndefined();
});

test("a note whose target vanished is listed as a loose note", async () => {
  const note = Note.create({ userId: "user-1", content: "Sobrou", eventId: "01K2R1J5M8S0Y2Z7ABCD123456" });
  const { list } = setup({ notes: [note] });

  const [result] = await list.execute(undefined, actor);

  expect(result.link).toBeUndefined();
});

test("gets a note with its link, answers null when it does not exist and refuses another user's", async () => {
  const event = lunch();
  const note = Note.create({ userId: "user-1", content: "Receita", eventId: event.id });
  const { get } = setup({ notes: [note], events: [event] });

  expect((await get.execute({ noteId: note.id }, actor))?.link?.name).toBe("Almoço");
  expect(await get.execute({ noteId: "missing" }, actor)).toBeNull();
  await expect(get.execute({ noteId: note.id }, attacker)).rejects.toBeInstanceOf(NoteOwnershipError);
});

test("creates a note for the actor and derives its name from the first line", async () => {
  const { create, notes } = setup();

  const { noteId } = await create.execute({ content: "\nLista do mercado\nArroz, feijão", tags: ["casa"] }, actor);

  const stored = await notes.findById(noteId);
  expect(stored).toMatchObject({ userId: "user-1", name: "Lista do mercado", tags: ["casa"] });
});

test("creating a note attached to another user's event or task is refused", async () => {
  const foreignEvent = lunch("user-2");
  const foreignTask = Task.create({ userId: "user-2", name: "Dele", description: "", tags: [] });
  const { create } = setup({ events: [foreignEvent], tasks: [foreignTask] });

  await expect(create.execute({ content: "x", eventId: foreignEvent.id }, actor)).rejects.toBeInstanceOf(
    EventOwnershipError,
  );
  await expect(create.execute({ content: "x", taskId: foreignTask.id }, actor)).rejects.toBeInstanceOf(
    TaskOwnershipError,
  );
  await expect(create.execute({ content: "x", eventId: "missing" }, actor)).rejects.toBeInstanceOf(
    EventNotFoundError,
  );
});

test("rejects blank content", async () => {
  const { create } = setup();

  await expect(create.execute({ content: "   " }, actor)).rejects.toBeInstanceOf(NoteValidationError);
});

test("updates content, tags and the attachment, bumping the revision", async () => {
  const event = lunch();
  const note = Note.create({ userId: "user-1", content: "Antes", eventId: event.id });
  const { update, notes } = setup({ notes: [note], events: [event] });

  await update.execute(
    { noteId: note.id, expectedRevision: 1, content: "Depois", tags: ["trabalho"], eventId: null },
    actor,
  );

  const stored = await notes.findById(note.id);
  expect(stored).toMatchObject({ content: "Depois", tags: ["trabalho"], revision: 2 });
  expect(stored?.eventId).toBeUndefined();
});

test("update refuses a stale revision, a missing note and another user's note", async () => {
  const note = Note.create({ userId: "user-1", content: "a" });
  const { update } = setup({ notes: [note] });

  await expect(update.execute({ noteId: note.id, expectedRevision: 7, content: "b" }, actor)).rejects.toBeInstanceOf(
    NoteRevisionConflictError,
  );
  await expect(update.execute({ noteId: "missing", expectedRevision: 1, content: "b" }, actor)).rejects.toBeInstanceOf(
    NoteNotFoundError,
  );
  await expect(update.execute({ noteId: note.id, expectedRevision: 1, content: "b" }, attacker)).rejects.toBeInstanceOf(
    NoteOwnershipError,
  );
});

test("deletes the actor's note and refuses another user's", async () => {
  const note = Note.create({ userId: "user-1", content: "a" });
  const { remove, notes } = setup({ notes: [note] });

  await expect(remove.execute({ noteId: note.id }, attacker)).rejects.toBeInstanceOf(NoteOwnershipError);
  await remove.execute({ noteId: note.id }, actor);

  expect(await notes.findById(note.id)).toBeNull();
});

test("assertNoteFields validates the wire shape", () => {
  expect(() => assertNoteFields({}, true)).toThrow(BadRequestException);
  expect(() => assertNoteFields({ content: 1 }, false)).toThrow(BadRequestException);
  expect(() => assertNoteFields({ content: "a", name: 3 }, true)).toThrow(BadRequestException);
  expect(() => assertNoteFields({ content: "a", taskId: 3 }, true)).toThrow(BadRequestException);
  expect(() => assertNoteFields({ content: "a", tags: ["ok", 1] }, true)).toThrow(BadRequestException);
  expect(() => assertNoteFields({ eventId: null, tags: [] }, false)).not.toThrow();
});
