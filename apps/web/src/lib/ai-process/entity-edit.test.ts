import { expect, test } from "vitest";
import { EDIT_TARGET_LABELS, editEntityTypeOfNote } from "./entity-edit";

test.each([
  ["text", "note"], ["meal", "meal_note"], ["sleep", "sleep_note"], ["training", "training_note"],
  ["skill", "skill_note"], ["agent", "agent_note"], ["router", null],
])("a nota %s edita como %s", (type, expected) => {
  expect(editEntityTypeOfNote({ type } as never)).toBe(expected);
});

test("todo tipo de edicao tem o seu rotulo", () => {
  expect(Object.keys(EDIT_TARGET_LABELS).sort()).toEqual([
    "agent_note", "event", "meal_note", "note", "skill_note", "sleep_note", "task", "training_note",
  ]);
});
