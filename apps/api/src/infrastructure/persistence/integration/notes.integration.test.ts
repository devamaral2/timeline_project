import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  Event,
  Note,
  NoteNotFoundError,
  NoteOwnershipError,
  NoteRevisionConflictError,
  Task,
} from "../../../domain";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresNoteRepository } from "../notes/repositories/postgres-note.repository";
import { PostgresNoteLinkQuery } from "../notes/queries/postgres-note-link.query";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";

describe("PostgresNoteRepository", () => {
  let ctx: PostgresTestContext;
  let notes: PostgresNoteRepository;
  let tasks: PostgresTaskRepository;
  let events: PostgresEventRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      notes = new PostgresNoteRepository(ctx.db);
      tasks = new PostgresTaskRepository(ctx.db);
      events = new PostgresEventRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const text = (body: string) => ({ body });

  function anEvent(noteIds: string[] = []): Event {
    return Event.create({
      userId: "user-1",
      name: "Reunião",
      description: "",
      startedAt: new Date("2026-09-16T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      noteLinks: noteIds.map((noteId) => ({ noteId, fromRecurrence: false })),
    });
  }

  async function savedTask(noteIds: string[] = []): Promise<Task> {
    const task = Task.create({
      userId: "user-1",
      name: "Limpar",
      description: "",
      tags: [],
      noteLinks: noteIds.map((noteId) => ({ noteId, fromRecurrence: false })),
    });
    await tasks.save(task);
    return task;
  }

  test("saves and reads back a free-floating text note with its type and data", async () => {
    const note = Note.create({ userId: "user-1", data: text("Comprar desinfetante") });
    await notes.save(note);

    const found = await notes.findById(note.id);
    expect(found).toMatchObject({
      type: "text",
      schemaVersion: 1,
      name: "Comprar desinfetante",
      data: { body: "Comprar desinfetante" },
      revision: 1,
    });
    // Uma note nao tem dono: nada no banco a liga a um evento ou tarefa.
    const links = await ctx.pool.query(
      "SELECT (SELECT count(*)::int FROM event_notes) AS events, (SELECT count(*)::int FROM task_notes) AS tasks",
    );
    expect(links.rows[0]).toEqual({ events: 0, tasks: 0 });
  });

  test("keeps typed data of every kind exactly as the type defines it", async () => {
    const sleep = Note.create({ userId: "user-1", type: "sleep", data: { trackedSleepTime: 450, score: 80 } });
    const training = Note.create({
      userId: "user-1",
      type: "training",
      data: {
        workouts: [{ id: "01K2R1J5M8S0Y2Z7ABCDFREEWK", workoutCode: "free", workoutName: "Livre", calories: 100, duration: 20 }],
        caloriesBurned: 100,
      },
    });
    await notes.save(sleep);
    await notes.save(training);

    const [foundSleep, foundTraining] = await notes.findByIds([sleep.id, training.id]).then((found) =>
      [sleep.id, training.id].map((id) => found.find((note) => note.id === id)),
    );
    expect(foundSleep).toMatchObject({ type: "sleep", name: "Sono", data: { trackedSleepTime: 450, score: 80 } });
    expect(foundTraining).toMatchObject({ type: "training", name: "Treino", data: { caloriesBurned: 100 } });
  });

  test("shares one tag row across a note and a task, and replaces note tags on update", async () => {
    const task = Task.create({ userId: "user-1", name: "Limpar", description: "", tags: ["casa"] });
    await tasks.save(task);
    const note = Note.create({ userId: "user-1", data: text("a"), tags: ["Casa", "urgente"] });
    await notes.save(note);

    expect((await notes.findById(note.id))?.tags.sort()).toEqual(["casa", "urgente"]);
    const shared = await ctx.pool.query("SELECT count(*)::int AS n FROM tags WHERE name = 'casa'");
    expect(shared.rows[0].n).toBe(1);

    await notes.update(note.revise({ tags: ["compras"] }), "user-1", note.revision);
    expect((await notes.findById(note.id))?.tags).toEqual(["compras"]);
  });

  test("updates with the matching revision, replacing the data and bumping the revision", async () => {
    const note = Note.create({ userId: "user-1", data: text("a") });
    await notes.save(note);

    await notes.update(note.revise({ data: text("b"), name: "Novo título" }), "user-1", note.revision);

    const found = await notes.findById(note.id);
    expect(found?.data).toEqual({ body: "b" });
    expect(found?.name).toBe("Novo título");
    expect(found?.revision).toBe(2);
  });

  test("changing the type replaces the data with a shape of the new type", async () => {
    const note = Note.create({ userId: "user-1", data: text("dormi mal") });
    await notes.save(note);

    await notes.update(
      note.revise({ type: "sleep", data: { trackedSleepTime: 300, score: 40 }, name: "Noite ruim" }),
      "user-1",
      note.revision,
    );

    expect(await notes.findById(note.id)).toMatchObject({ type: "sleep", data: { trackedSleepTime: 300, score: 40 } });
  });

  test("rejects a stale revision and a different owner", async () => {
    const note = Note.create({ userId: "user-1", data: text("a") });
    await notes.save(note);
    const changed = note.revise({ data: text("b") });

    await expect(notes.update(changed, "user-1", note.revision + 1)).rejects.toBeInstanceOf(
      NoteRevisionConflictError,
    );
    await expect(notes.update(changed, "user-2", note.revision)).rejects.toBeInstanceOf(
      NoteOwnershipError,
    );
    await expect(notes.delete(note.id, "user-2")).rejects.toBeInstanceOf(NoteOwnershipError);
  });

  test("a deleted note stays in the table but is invisible and immutable", async () => {
    const note = Note.create({ userId: "user-1", data: text("a") });
    await notes.save(note);

    await notes.delete(note.id, "user-1");

    expect(await notes.findById(note.id)).toBeNull();
    expect(await notes.findByIds([note.id])).toEqual([]);
    const { rows } = await ctx.pool.query("SELECT deleted_at FROM notes WHERE id = $1", [note.id]);
    expect(rows[0].deleted_at).not.toBeNull();
    await expect(notes.update(note.revise({ data: text("b") }), "user-1", note.revision)).rejects.toBeInstanceOf(
      NoteNotFoundError,
    );
    await expect(notes.delete(note.id, "user-1")).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  test("lists only the user's live notes, most recently edited first, with their tags", async () => {
    const older = Note.create({ userId: "user-1", data: text("antiga"), tags: ["casa"] });
    const newer = Note.create({ userId: "user-1", data: text("nova") });
    const deleted = Note.create({ userId: "user-1", data: text("apagada") });
    const foreign = Note.create({ userId: "user-2", data: text("de outro") });
    for (const note of [older, newer, deleted, foreign]) await notes.save(note);
    await notes.update(older.revise({ data: text("antiga editada") }), "user-1", older.revision);
    await notes.delete(deleted.id, "user-1");

    const listed = await notes.listByUserId("user-1");

    expect(listed.map((note) => (note.data as { body: string }).body)).toEqual(["antiga editada", "nova"]);
    expect(listed[0].tags).toEqual(["casa"]);
    expect(await notes.listByUserId("nobody")).toEqual([]);
  });

  test("the link query tells where each note appears: live events then tasks, never deleted ones", async () => {
    const shared = Note.create({ userId: "user-1", data: text("compartilhada") });
    const loose = Note.create({ userId: "user-1", data: text("solta") });
    await notes.save(shared);
    await notes.save(loose);
    const early = Event.create({
      userId: "user-1",
      name: "Cedo",
      description: "",
      startedAt: new Date("2026-09-16T08:00:00.000Z"),
      tags: [],
      interruptions: [],
      kind: "meal",
      noteLinks: [{ noteId: shared.id, fromRecurrence: false }],
    });
    const late = Event.create({
      userId: "user-1",
      name: "Tarde",
      description: "",
      startedAt: new Date("2026-09-16T18:00:00.000Z"),
      tags: [],
      interruptions: [],
      noteLinks: [{ noteId: shared.id, fromRecurrence: false }],
    });
    const gone = Event.create({
      userId: "user-1",
      name: "Apagado",
      description: "",
      startedAt: new Date("2026-09-16T10:00:00.000Z"),
      tags: [],
      interruptions: [],
      noteLinks: [{ noteId: shared.id, fromRecurrence: false }],
    });
    for (const event of [late, early, gone]) await events.save(event);
    await events.delete(gone.id, "user-1");
    const task = await savedTask([shared.id]);

    const links = await new PostgresNoteLinkQuery(ctx.db).linksOf([shared.id, loose.id]);

    expect(links.get(shared.id)).toEqual([
      { kind: "event", id: early.id, name: "Cedo", eventKind: "meal", at: early.startedAt },
      { kind: "event", id: late.id, name: "Tarde", eventKind: "routine", at: late.startedAt },
      { kind: "task", id: task.id, name: "Limpar" },
    ]);
    expect(links.has(loose.id)).toBe(false);
    expect((await new PostgresNoteLinkQuery(ctx.db).linksOf([])).size).toBe(0);
  });

  test("findByIds returns only the notes that exist, with their tags", async () => {
    const first = Note.create({ userId: "user-1", data: text("a"), tags: ["x"] });
    const second = Note.create({ userId: "user-1", data: text("b") });
    await notes.save(first);
    await notes.save(second);

    const found = await notes.findByIds([first.id, second.id, "01J00000000000000000000099"]);

    expect(found.map((note) => note.id).sort()).toEqual([first.id, second.id].sort());
    expect(found.find((note) => note.id === first.id)?.tags).toEqual(["x"]);
    expect(await notes.findByIds([])).toEqual([]);
  });

  test("the same note can be linked to several events and tasks, each with its own position", async () => {
    const note = Note.create({ userId: "user-1", data: text("compartilhada") });
    const other = Note.create({ userId: "user-1", data: text("outra") });
    await notes.save(note);
    await notes.save(other);
    const first = anEvent([note.id]);
    const second = anEvent([other.id, note.id]);
    await events.save(first);
    await events.save(second);
    const task = await savedTask([note.id]);

    const rows = await ctx.pool.query(
      `SELECT event_id, position FROM event_notes WHERE note_id = $1 ORDER BY event_id`,
      [note.id],
    );
    expect(rows.rows.map((row) => [row.event_id.trim(), row.position]).sort()).toEqual(
      [[first.id, 0], [second.id, 1]].sort(),
    );
    expect((await tasks.findById(task.id))?.noteLinks).toEqual([{ noteId: note.id, fromRecurrence: false }]);
    expect((await events.findById(second.id))?.noteLinks.map((link) => link.noteId)).toEqual([other.id, note.id]);
  });

  test("deleting an event or a task never deletes its notes", async () => {
    const note = Note.create({ userId: "user-1", data: text("sobrevive") });
    await notes.save(note);
    const event = anEvent([note.id]);
    await events.save(event);
    const task = await savedTask([note.id]);

    await events.delete(event.id, "user-1");
    await tasks.delete(task.id, "user-1");

    expect((await notes.findById(note.id))?.data).toEqual({ body: "sobrevive" });
    // O soft delete deixa o vinculo: e a leitura que o esconde junto do alvo apagado.
    const { rows } = await ctx.pool.query("SELECT deleted_at FROM notes WHERE id = $1", [note.id]);
    expect(rows[0].deleted_at).toBeNull();
  });

  test("a soft deleted note disappears from the event's links without breaking the event", async () => {
    const kept = Note.create({ userId: "user-1", data: text("fica") });
    const gone = Note.create({ userId: "user-1", data: text("some") });
    await notes.save(kept);
    await notes.save(gone);
    const event = anEvent([gone.id, kept.id]);
    await events.save(event);

    await notes.delete(gone.id, "user-1");

    expect((await events.findById(event.id))?.noteLinks.map((link) => link.noteId)).toEqual([kept.id]);
  });

  test("the database rejects a blank type, a version below 1 and data that is not an object", async () => {
    const insert = (type: string, version: number, data: string) =>
      ctx.pool.query(
        "INSERT INTO notes (id, user_id, type, schema_version, data) VALUES ('01J00000000000000000000000', 'user-1', $1, $2, $3::jsonb)",
        [type, version, data],
      );

    await expect(insert("   ", 1, "{}")).rejects.toThrow();
    await expect(insert("text", 0, "{}")).rejects.toThrow();
    await expect(insert("text", 1, "[]")).rejects.toThrow();
    await expect(insert("text", 1, '"texto"')).rejects.toThrow();
  });

  test("the database refuses the same note twice in one event and two notes in one position", async () => {
    const first = Note.create({ userId: "user-1", data: text("a") });
    const second = Note.create({ userId: "user-1", data: text("b") });
    await notes.save(first);
    await notes.save(second);
    const event = anEvent([first.id]);
    await events.save(event);

    await expect(
      ctx.pool.query("INSERT INTO event_notes (event_id, note_id, position) VALUES ($1, $2, 5)", [event.id, first.id]),
    ).rejects.toThrow(/event_notes_event_id_note_id_pk/);
    await expect(
      ctx.pool.query("INSERT INTO event_notes (event_id, note_id, position) VALUES ($1, $2, 0)", [event.id, second.id]),
    ).rejects.toThrow(/event_notes_event_position_unique/);
    await expect(
      ctx.pool.query("INSERT INTO event_notes (event_id, note_id, position) VALUES ($1, $2, -1)", [event.id, second.id]),
    ).rejects.toThrow(/event_notes_position_nonneg/);
  });

  test("positions can be shifted in one statement because the unique constraint is deferrable", async () => {
    const first = Note.create({ userId: "user-1", data: text("a") });
    const second = Note.create({ userId: "user-1", data: text("b") });
    await notes.save(first);
    await notes.save(second);
    const event = anEvent([first.id, second.id]);
    await events.save(event);

    await ctx.pool.query("UPDATE event_notes SET position = position + 1 WHERE event_id = $1", [event.id]);

    const { rows } = await ctx.pool.query("SELECT note_id, position FROM event_notes WHERE event_id = $1 ORDER BY position", [
      event.id,
    ]);
    expect(rows.map((row) => [row.note_id.trim(), row.position])).toEqual([
      [first.id, 1],
      [second.id, 2],
    ]);
  });
});
