import { expect, test } from "vitest";
import { Event, Note, type NoteLink } from "../../../domain";
import { createEventsKit } from "../testing/in-memory-events-kit";
import { mergeEventUpdate } from "./event-update-merger.service";

const workouts = [
  { id: "01K2R1J5M8S0Y2Z7ABCDFREEWK", workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 },
];

function trainingNote(userId = "auth-user-1") {
  return Note.create({ userId, type: "training", data: { workouts, caloriesBurned: 420 } });
}

function trainingEvent(noteLinks: NoteLink[] = []) {
  return Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123456",
    userId: "auth-user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-16T18:00:00.000Z"),
    tags: ["old"],
    interruptions: [],
    kind: "training",
    noteLinks,
  });
}

function depsOf(kit: ReturnType<typeof createEventsKit>) {
  return { noteBuilder: kit.noteBuilder, noteRepository: kit.noteRepository };
}

test.each(["change-kind", "remove-notes", "deleted-note"] as const)(
  "ensures a pending meal note after update: %s",
  async (scenario) => {
    const kit = createEventsKit({ mealParsingGateway: {
      parseMeal: async () => { throw new Error("Must not call provider synchronously"); },
    } });
    const existing = trainingEvent().revise({
      kind: scenario === "change-kind" ? "training" : "meal",
      noteLinks: scenario === "deleted-note" ? [{ noteId: "deleted-note-id", fromRecurrence: true }] : [],
    });
    const merged = await mergeEventUpdate(existing, {
      eventId: existing.id, expectedRevision: existing.revision, kind: "meal",
      description: "arroz e feijao", ...(scenario === "remove-notes" ? { notes: [] } : {}),
    }, depsOf(kit), new Date());
    expect(merged.event.kind).toBe("meal");
    expect(merged.event.revision).toBe(existing.revision + 1);
    expect(merged.notes.created).toHaveLength(1);
    const note = merged.notes.created?.[0];
    expect(note?.data).toMatchObject({
      description: "arroz e feijao", generation: { status: "pending" }, foodItems: [],
    });
    expect(merged.event.noteLinks).toContainEqual({ noteId: note?.id, fromRecurrence: false });
  },
);

test("meal updates preserve an existing owned meal note or explicitly reused note", async () => {
  const kit = createEventsKit();
  const note = await kit.noteBuilder.fromCreateInput(
    { type: "meal", data: { inputText: "salada" } }, "auth-user-1", new Date(),
  );
  await kit.noteRepository.save(note);
  const event = trainingEvent().revise({ kind: "meal", noteLinks: [{ noteId: note.id, fromRecurrence: true }] });
  for (const notes of [undefined, [{ id: note.id }]]) {
    const merged = await mergeEventUpdate(event, {
      eventId: event.id, expectedRevision: event.revision, notes,
    }, depsOf(kit), new Date());
    expect(merged.event.noteLinks).toEqual(event.noteLinks);
    expect(merged.notes.created ?? []).toEqual([]);
    expect(merged.notes.updated ?? []).toEqual([]);
  }
});

test("replaces training workouts of a linked note and recomputes what is derived", async () => {
  const note = trainingNote();
  const kit = createEventsKit({ notes: [note] });
  const event = trainingEvent([{ noteId: note.id, fromRecurrence: false }]);

  const merged = await mergeEventUpdate(
    event,
    {
      eventId: event.id,
      expectedRevision: 1,
      tags: ["new"],
      notes: [
        {
          id: note.id,
          type: "training",
          data: {
            workouts: [
              {
                id: "01K2R1J5M8S0Y2Z7ABCDLIFTWK",
                workoutCode: "weightlifting",
                workoutName: "ignored",
                calories: 300,
                duration: 45,
                sets: [{ id: "01K2R1J5M8S0Y2Z7ABCDSET001", exercise: "Squat", repetitions: 10, weight: 80 }],
              },
            ],
            caloriesBurned: 9999,
          },
        },
      ],
    },
    depsOf(kit),
    new Date("2026-08-17T12:00:00.000Z"),
  );

  expect(merged.event.tags).toEqual(["new"]);
  expect(merged.event.revision).toBe(2);
  expect(merged.notes.created).toEqual([]);
  expect(merged.notes.updated).toHaveLength(1);

  const [{ note: revised, expectedRevision }] = merged.notes.updated ?? [];
  expect(expectedRevision).toBe(1);
  expect(revised.id).toBe(note.id);
  expect(revised.revision).toBe(2);
  const data = revised.data as {
    caloriesBurned: number;
    workouts: Array<{ workoutCode: string; workoutName: string; calories: number; duration: number; id: string; sets: Array<{ id: string }> }>;
  };
  // O nome vem do catalogo e as calorias sao a soma — nao o que o cliente mandou.
  expect(data.workouts[0]).toMatchObject({ workoutCode: "weightlifting", workoutName: "Musculação", calories: 300, duration: 45 });
  expect(data.workouts[0].id).toBe("01K2R1J5M8S0Y2Z7ABCDLIFTWK");
  expect(data.workouts[0].sets[0].id).toBe("01K2R1J5M8S0Y2Z7ABCDSET001");
  expect(data.caloriesBurned).toBe(300);
});

test("preserves the notes when an update does not mention them", async () => {
  const note = trainingNote();
  const kit = createEventsKit({ notes: [note] });
  const event = trainingEvent([{ noteId: note.id, fromRecurrence: true }]);

  const merged = await mergeEventUpdate(
    event,
    { eventId: event.id, expectedRevision: 1, description: "Imported workout" },
    depsOf(kit),
    new Date("2026-08-16T19:00:00.000Z"),
  );

  expect(merged.event.description).toBe("Imported workout");
  expect(merged.event.noteLinks).toEqual(event.noteLinks);
  expect(merged.notes).toEqual({});
});

test("an entry with only an id keeps the note, and the list is the new order", async () => {
  const first = Note.create({ userId: "auth-user-1", data: { body: "primeira" } });
  const second = Note.create({ userId: "auth-user-1", data: { body: "segunda" } });
  const kit = createEventsKit({ notes: [first, second] });
  const event = trainingEvent([
    { noteId: first.id, fromRecurrence: true },
    { noteId: second.id, fromRecurrence: false },
  ]);

  const merged = await mergeEventUpdate(
    event,
    { eventId: event.id, expectedRevision: 1, notes: [{ id: second.id }, { id: first.id }] },
    depsOf(kit),
    new Date(),
  );

  expect(merged.event.noteLinks).toEqual([
    { noteId: second.id, fromRecurrence: false },
    { noteId: first.id, fromRecurrence: true },
  ]);
  // So ordenar nao edita note nenhuma.
  expect(merged.notes.updated).toEqual([]);
  expect(merged.notes.created).toEqual([]);
});

test("a note left out of the list stops appearing but is not deleted", async () => {
  const note = Note.create({ userId: "auth-user-1", data: { body: "sai da lista" } });
  const kit = createEventsKit({ notes: [note] });
  const event = trainingEvent([{ noteId: note.id, fromRecurrence: false }]);

  const merged = await mergeEventUpdate(
    event,
    { eventId: event.id, expectedRevision: 1, notes: [] },
    depsOf(kit),
    new Date(),
  );

  expect(merged.event.noteLinks).toEqual([]);
  expect(merged.notes).toEqual({ created: [], updated: [] });
  expect(kit.database.notes).toContain(note);
});

test("an entry without id creates a new note with the full data", async () => {
  const kit = createEventsKit();
  const event = trainingEvent();

  const merged = await mergeEventUpdate(
    event,
    {
      eventId: event.id,
      expectedRevision: 1,
      notes: [{ type: "sleep", data: { trackedSleepTime: 400, score: 70 }, name: "Noite" }],
    },
    depsOf(kit),
    new Date(),
  );

  const [created] = merged.notes.created ?? [];
  expect(created).toMatchObject({ type: "sleep", name: "Noite", userId: "auth-user-1", data: { trackedSleepTime: 400, score: 70 } });
  expect(merged.event.noteLinks).toEqual([{ noteId: created.id, fromRecurrence: false }]);
});

test("can link an existing note of the same user, and refuses another user's note", async () => {
  const mine = Note.create({ userId: "auth-user-1", data: { body: "minha" } });
  const theirs = Note.create({ userId: "auth-user-2", data: { body: "dele" } });
  const kit = createEventsKit({ notes: [mine, theirs] });
  const event = trainingEvent();

  const linked = await mergeEventUpdate(
    event,
    { eventId: event.id, expectedRevision: 1, notes: [{ id: mine.id }] },
    depsOf(kit),
    new Date(),
  );
  expect(linked.event.noteLinks).toEqual([{ noteId: mine.id, fromRecurrence: false }]);

  await expect(
    mergeEventUpdate(event, { eventId: event.id, expectedRevision: 1, notes: [{ id: theirs.id }] }, depsOf(kit), new Date()),
  ).rejects.toThrow("Only the note owner can modify it");
  await expect(
    mergeEventUpdate(event, { eventId: event.id, expectedRevision: 1, notes: [{ id: "01HZZZZZZZZZZZZZZZZZZZZZZZ" }] }, depsOf(kit), new Date()),
  ).rejects.toThrow("Note not found");
});

test("the kind can change on update", async () => {
  const kit = createEventsKit();
  const event = trainingEvent();

  const merged = await mergeEventUpdate(event, { eventId: event.id, expectedRevision: 1, kind: "routine" }, depsOf(kit), new Date());

  expect(merged.event.kind).toBe("routine");
});
