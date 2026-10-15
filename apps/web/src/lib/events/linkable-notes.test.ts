import { expect, test } from "vitest";
import type { EventDetailDto, NoteDto } from "@/lib/api/contracts";
import { noteOf } from "@/components/events/note-fixtures";
import { linkableNotesOf, noteTypeForEventKind } from "./linkable-notes";

function anEvent(kind: EventDetailDto["kind"], notes: NoteDto[] = []): EventDetailDto {
  return {
    id: "event-1",
    name: "Evento",
    description: "",
    startedAt: "2026-09-14T12:00:00.000Z",
    tags: [],
    missed: false,
    priority: "normal",
    notifyOffsetsMinutes: [],
    interruptions: [],
    revision: 1,
    kind,
    notes,
  };
}

const meal = noteOf({ id: "meal-1", type: "meal", data: {} });
const otherMeal = noteOf({ id: "meal-2", type: "meal", data: {} });
const sleep = noteOf({ id: "sleep-1", type: "sleep", data: {} });
const training = noteOf({ id: "training-1", type: "training", data: {} });
const text = noteOf({ id: "text-1", type: "text", data: { body: "" } });

test("maps each event kind to the note type that fits it", () => {
  expect(noteTypeForEventKind("meal")).toBe("meal");
  expect(noteTypeForEventKind("sleep")).toBe("sleep");
  expect(noteTypeForEventKind("training")).toBe("training");
  expect(noteTypeForEventKind("routine")).toBe("text");
});

test("offers only the notes of the event's type", () => {
  const all = [meal, otherMeal, sleep, training, text];

  expect(linkableNotesOf(all, anEvent("meal")).map((note) => note.id)).toEqual(["meal-1", "meal-2"]);
  expect(linkableNotesOf(all, anEvent("sleep")).map((note) => note.id)).toEqual(["sleep-1"]);
  expect(linkableNotesOf(all, anEvent("routine")).map((note) => note.id)).toEqual(["text-1"]);
});

test("leaves out notes already on the event", () => {
  const event = anEvent("meal", [meal]);

  expect(linkableNotesOf([meal, otherMeal], event).map((note) => note.id)).toEqual(["meal-2"]);
});
