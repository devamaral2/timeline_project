import { describe, expect, test } from "vitest";
import { NoteValidationError } from "../errors/note.errors";
import { Note } from "./note.entity";

describe("Note aggregate", () => {
  test("creates with a 26-char id and revision 1", () => {
    const note = Note.create({ userId: "user-1", content: "Comprar pão" });

    expect(note.id).toHaveLength(26);
    expect(note.revision).toBe(1);
    expect(note.taskId).toBeUndefined();
  });

  test("rejects blank content", () => {
    expect(() => Note.create({ userId: "user-1", content: "   " })).toThrow(NoteValidationError);
  });

  test("revise bumps the revision and null clears a target", () => {
    const note = Note.create({ userId: "user-1", content: "a", taskId: "task-1" });

    const revised = note.revise({ content: "b", taskId: null });

    expect(revised.content).toBe("b");
    expect(revised.taskId).toBeUndefined();
    expect(revised.revision).toBe(2);
    expect(revised.id).toBe(note.id);
  });
});
