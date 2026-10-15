import { expect, test, vi } from "vitest";
import { calculateMealTotals, Event, Note, type MealItem } from "../../../domain";
import type { AgentSkillContext } from "./agent-skill";
import { mealEventSkill } from "./meal-event.skill";

test.each(["pending", "completed", "legacy", "missing"] as const)(
  "meal additions replace the link with a new pending note, preserving the %s original",
  async (state) => {
    const previous = state === "missing" ? undefined : Note.create({
      userId: "user-1", type: "meal",
      data: {
        name: "Almoço", description: "100g de arroz", foodItems: [], totals: calculateMealTotals([]),
        ...(state !== "legacy" ? { generation: { status: state } } : {}),
        ...(state === "completed" ? { recipe: {
          source: "user", ingredients: [], steps: ["Cozinhe o arroz."],
        } } : {}),
      },
    });
    const text = Note.create({ userId: "user-1", data: { body: "Observação" } });
    const event = Event.create({
      userId: "user-1", name: "Almoço", description: "", kind: "meal",
      startedAt: new Date("2026-08-17T15:00:00Z"), tags: [], interruptions: [],
      noteLinks: [
        { noteId: text.id, fromRecurrence: false },
        ...(previous ? [{ noteId: previous.id, fromRecurrence: true }] : []),
      ],
    });
    let updated: Event | undefined;
    let created: Note | undefined;
    const session = {
      updateEvent: vi.fn(async (_id, _kind, revise: (current: Event) => Promise<Event>) => {
        updated = await revise(event);
        return { ok: true };
      }),
      noteOfType: vi.fn().mockResolvedValue(previous),
      buildNote: vi.fn(async (input: { data: { inputText: string } }) => Note.create({
        userId: "user-1", type: "meal",
        data: {
          name: "Almoço", description: input.data.inputText, foodItems: [], totals: calculateMealTotals([]),
          generation: { status: "pending" },
        },
      })),
      stageNewNote: vi.fn((note: Note) => { created = note; }),
      reviseNoteById: vi.fn(),
    };
    const query = { execute: vi.fn() };
    const result = await mealEventSkill.run(
      { id: event.id, inputText: "mais 100g de arroz" },
      { session, query } as unknown as AgentSkillContext,
    );
    expect(result).toEqual({ ok: true });
    expect(session.buildNote).toHaveBeenCalledWith({
      type: "meal", data: { inputText: previous ? "100g de arroz; mais 100g de arroz" : "mais 100g de arroz" },
    }, event.startedAt);
    expect(created?.data).toMatchObject({ generation: { status: "pending" }, foodItems: [] });
    expect(updated?.noteLinks).toEqual([
      { noteId: text.id, fromRecurrence: false },
      { noteId: created?.id, fromRecurrence: false },
    ]);
    expect(created?.id).not.toBe(previous?.id);
    expect(session.reviseNoteById).not.toHaveBeenCalled();
    expect(query.execute).not.toHaveBeenCalled();
    if (previous) {
      expect(previous.revision).toBe(1);
      expect((previous.data as MealItem).description).toBe("100g de arroz");
    }
  },
);

test.each([true, false])("metadata-only changes preserve a live note or repair its absence (exists=%s)", async (exists) => {
  const event = Event.create({
    userId: "user-1", name: "Almoço", description: "", kind: "meal",
    startedAt: new Date("2026-08-17T15:00:00Z"), tags: [], interruptions: [],
  });
  const note = Note.create({ userId: "user-1", type: "meal", data: {
    name: "Almoço", description: "arroz", foodItems: [], totals: calculateMealTotals([]),
    generation: { status: "pending" },
  } });
  const session = {
    updateEvent: vi.fn(async (_id, _kind, revise: (current: Event) => Promise<Event>) => revise(event)),
    noteOfType: vi.fn().mockResolvedValue(exists ? note : undefined),
    buildNote: vi.fn().mockResolvedValue(note), stageNewNote: vi.fn(),
  };
  const updated = await mealEventSkill.run(
    { id: event.id, name: "Almoço em casa" }, { session } as unknown as AgentSkillContext,
  );
  expect(updated).toMatchObject({ name: "Almoço em casa" });
  expect(session.noteOfType).toHaveBeenCalled();
  expect(session.buildNote).toHaveBeenCalledTimes(exists ? 0 : 1);
  expect(session.stageNewNote).toHaveBeenCalledTimes(exists ? 0 : 1);
  if (!exists) expect(updated).toMatchObject({ noteLinks: [{ noteId: note.id, fromRecurrence: false }] });
});
