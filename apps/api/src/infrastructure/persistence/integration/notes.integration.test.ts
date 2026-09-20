import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  Note,
  NoteNotFoundError,
  NoteOwnershipError,
  NoteRevisionConflictError,
  Task,
} from "../../../domain";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresNoteRepository } from "../notes/repositories/postgres-note.repository";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";

const RUN_INTEGRATION = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe.runIf(RUN_INTEGRATION)("PostgresNoteRepository", () => {
  let ctx: PostgresTestContext;
  let notes: PostgresNoteRepository;
  let tasks: PostgresTaskRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      notes = new PostgresNoteRepository(ctx.db);
      tasks = new PostgresTaskRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  async function savedTask(): Promise<Task> {
    const task = Task.create({ userId: "user-1", name: "Limpar", description: "", tags: [] });
    await tasks.save(task);
    return task;
  }

  test("saves and reads back a note attached to a task", async () => {
    const task = await savedTask();
    const note = Note.create({ userId: "user-1", content: "Comprar desinfetante", taskId: task.id });
    await notes.save(note);

    const found = await notes.findById(note.id);
    expect(found?.content).toBe("Comprar desinfetante");
    expect(found?.taskId).toBe(task.id);
    expect(found?.eventId).toBeUndefined();
    expect(found?.revision).toBe(1);
  });

  test("shares one tag row across a note and a task, and replaces note tags on update", async () => {
    const task = Task.create({ userId: "user-1", name: "Limpar", description: "", tags: ["casa"] });
    await tasks.save(task);
    const note = Note.create({ userId: "user-1", content: "a", tags: ["Casa", "urgente"] });
    await notes.save(note);

    expect((await notes.findById(note.id))?.tags.sort()).toEqual(["casa", "urgente"]);
    const shared = await ctx.pool.query("SELECT count(*)::int AS n FROM tags WHERE name = 'casa'");
    expect(shared.rows[0].n).toBe(1);

    await notes.update(note.revise({ tags: ["compras"] }), "user-1", note.revision);
    expect((await notes.findById(note.id))?.tags).toEqual(["compras"]);
  });

  test("updates with the matching revision and bumps it", async () => {
    const note = Note.create({ userId: "user-1", content: "a" });
    await notes.save(note);

    await notes.update(note.revise({ content: "b" }), "user-1", note.revision);

    const found = await notes.findById(note.id);
    expect(found?.content).toBe("b");
    expect(found?.revision).toBe(2);
  });

  test("rejects a stale revision and a different owner", async () => {
    const note = Note.create({ userId: "user-1", content: "a" });
    await notes.save(note);
    const changed = note.revise({ content: "b" });

    await expect(notes.update(changed, "user-1", note.revision + 1)).rejects.toBeInstanceOf(
      NoteRevisionConflictError,
    );
    await expect(notes.update(changed, "user-2", note.revision)).rejects.toBeInstanceOf(
      NoteOwnershipError,
    );
    await expect(notes.delete(note.id, "user-2")).rejects.toBeInstanceOf(NoteOwnershipError);
  });

  test("a deleted note stays in the table but is invisible and immutable", async () => {
    const note = Note.create({ userId: "user-1", content: "a" });
    await notes.save(note);

    await notes.delete(note.id, "user-1");

    expect(await notes.findById(note.id)).toBeNull();
    const { rows } = await ctx.pool.query("SELECT deleted_at FROM notes WHERE id = $1", [note.id]);
    expect(rows[0].deleted_at).not.toBeNull();
    await expect(notes.update(note.revise({ content: "b" }), "user-1", note.revision)).rejects.toBeInstanceOf(
      NoteNotFoundError,
    );
    await expect(notes.delete(note.id, "user-1")).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  test("the database rejects blank content", async () => {
    await expect(
      ctx.pool.query(
        "INSERT INTO notes (id, user_id, content) VALUES ('01J00000000000000000000000', 'user-1', '   ')",
      ),
    ).rejects.toThrow();
  });
});
