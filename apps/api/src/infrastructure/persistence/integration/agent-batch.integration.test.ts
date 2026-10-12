import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  EntityBatchConflictError,
  Event,
  Note,
  Recurrence,
  Task,
} from "../../../domain";
import { MaterializeRecurrencesUseCase } from "../../../api-core/recurrences/materialize-recurrences.usecase";
import { buildEventOccurrence, buildTaskOccurrenceOf } from "../../../api-core/recurrences/recurrence-templates";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import type { EntityBatch } from "../../../domain/ports";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import { PostgresNoteRepository } from "../notes/repositories/postgres-note.repository";


describe("PostgresEntityBatchWriter", () => {
  let ctx: PostgresTestContext;
  let writer: PostgresEntityBatchWriter;
  let events: PostgresEventRepository;
  let tasks: PostgresTaskRepository;
  let notes: PostgresNoteRepository;
  let recurrences: PostgresRecurrenceRepository;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      writer = new PostgresEntityBatchWriter(ctx.db);
      events = new PostgresEventRepository(ctx.db);
      tasks = new PostgresTaskRepository(ctx.db);
      notes = new PostgresNoteRepository(ctx.db);
      recurrences = new PostgresRecurrenceRepository(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  function newEvent(userId = "user-1", noteLinks: Event["noteLinks"] = []) {
    return Event.create({
      userId,
      name: "Dormir",
      description: "",
      startedAt: new Date("2026-09-15T02:00:00.000Z"),
      tags: [],
      interruptions: [],
      kind: "sleep",
      noteLinks: [...noteLinks],
    });
  }

  const text = (body: string) => ({ body });

  function newTask(overrides: Partial<Parameters<typeof Task.create>[0]> = {}) {
    return Task.create({ userId: "user-1", name: "Casa", description: "", tags: [], ...overrides });
  }

  function batch(overrides: Partial<EntityBatch>): EntityBatch {
    return { userId: "user-1", events: [], tasks: [], notes: [], ...overrides };
  }

  async function count(table: string): Promise<number> {
    const { rows } = await ctx.pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE deleted_at IS NULL`);
    return rows[0].count;
  }

  test("creates, updates and deletes across kinds in one commit", async () => {
    const sleep = newEvent();
    await events.save(sleep);
    const oldTask = newTask({ name: "Velha" });
    await tasks.save(oldTask);

    const parent = newTask();
    const note = Note.create({ userId: "user-1", data: text("Usar vassoura nova") });
    const subtask = newTask({
      name: "Varrer a casa",
      parentTaskId: parent.id,
      noteLinks: [{ noteId: note.id, fromRecurrence: false }],
    });

    await writer.commit(
      batch({
        // Subtarefa antes do pai de proposito: a ordem de insercao e do writer.
        tasks: [
          { op: "create", entity: subtask },
          { op: "create", entity: parent },
          { op: "delete", id: oldTask.id, expectedRevision: oldTask.revision },
        ],
        events: [{ op: "update", entity: sleep.revise({ name: "Dormi pouco" }), expectedRevision: sleep.revision }],
        notes: [{ op: "create", entity: note }],
      }),
    );

    expect((await tasks.findById(subtask.id))?.parentTaskId).toBe(parent.id);
    expect(await tasks.findById(oldTask.id)).toBeNull();
    expect((await events.findById(sleep.id))?.name).toBe("Dormi pouco");
    // A nota entrou no mesmo commit que a tarefa que aponta para ela.
    expect((await notes.findById(note.id))?.data).toEqual(text("Usar vassoura nova"));
    expect((await tasks.findById(subtask.id))?.noteLinks).toEqual([{ noteId: note.id, fromRecurrence: false }]);
  });

  test("a note created in the batch can be linked to an event created in the same batch", async () => {
    const note = Note.create({ userId: "user-1", type: "sleep", data: { trackedSleepTime: 400, score: 70 } });
    const event = newEvent("user-1", [{ noteId: note.id, fromRecurrence: false }]);

    await writer.commit(batch({ events: [{ op: "create", entity: event }], notes: [{ op: "create", entity: note }] }));

    expect((await events.findById(event.id))?.noteLinks).toEqual([{ noteId: note.id, fromRecurrence: false }]);
  });

  test("an existing note can be linked to an event, and it is not changed", async () => {
    const note = Note.create({ userId: "user-1", data: text("solta") });
    await notes.save(note);
    const event = newEvent();
    await events.save(event);

    await writer.commit(
      batch({
        events: [
          {
            op: "update",
            entity: event.revise({ noteLinks: [{ noteId: note.id, fromRecurrence: false }] }),
            expectedRevision: event.revision,
          },
        ],
      }),
    );

    expect((await events.findById(event.id))?.noteLinks).toEqual([{ noteId: note.id, fromRecurrence: false }]);
    expect((await notes.findById(note.id))?.revision).toBe(1);
  });

  test("refuses to link a note of another user, and nothing is written", async () => {
    const foreign = Note.create({ userId: "user-2", data: text("de outro") });
    await notes.save(foreign);
    const created = newTask({ noteLinks: [{ noteId: foreign.id, fromRecurrence: false }] });

    await expect(writer.commit(batch({ tasks: [{ op: "create", entity: created }] }))).rejects.toThrow(/notes referenciados/);
    expect(await tasks.findById(created.id)).toBeNull();
  });

  test("deleting an event in a batch leaves its notes alone", async () => {
    const note = Note.create({ userId: "user-1", data: text("fica") });
    await notes.save(note);
    const event = newEvent("user-1", [{ noteId: note.id, fromRecurrence: false }]);
    await events.save(event);

    await writer.commit(batch({ events: [{ op: "delete", id: event.id, expectedRevision: event.revision }] }));

    expect(await events.findById(event.id)).toBeNull();
    expect((await notes.findById(note.id))?.data).toEqual(text("fica"));
  });

  test("a failure after earlier writes rolls back everything", async () => {
    const existing = Note.create({ userId: "user-1", data: text("já existe") });
    await notes.save(existing);
    const created = newTask();
    // Mesmo id: a insercao da nota falha na PK depois que a tarefa ja entrou.
    const duplicate = Note.create({ id: existing.id, userId: "user-1", data: text("de novo") });

    await expect(
      writer.commit(
        batch({
          tasks: [{ op: "create", entity: created }],
          notes: [{ op: "create", entity: duplicate }],
        }),
      ),
    ).rejects.toThrow();

    expect(await tasks.findById(created.id)).toBeNull();
    expect((await notes.findById(existing.id))?.data).toEqual(text("já existe"));
  });

  test("a target owned by another user is a conflict and nothing is written", async () => {
    const foreign = newEvent("user-2");
    await events.save(foreign);
    const created = newTask();

    await expect(
      writer.commit(
        batch({
          tasks: [{ op: "create", entity: created }],
          events: [{ op: "update", entity: foreign.revise({ name: "Roubado" }), expectedRevision: foreign.revision }],
        }),
      ),
    ).rejects.toBeInstanceOf(EntityBatchConflictError);

    expect((await events.findById(foreign.id))?.name).toBe("Dormir");
    expect(await count("tasks")).toBe(0);
  });

  test("a revision bumped or a row deleted after staging is a conflict", async () => {
    const event = newEvent();
    await events.save(event);
    const staged = event.revise({ name: "Staged" });
    await events.update(event.revise({ name: "Outra aba" }), "user-1", event.revision);

    await expect(
      writer.commit(batch({ events: [{ op: "update", entity: staged, expectedRevision: event.revision }] })),
    ).rejects.toThrow(/alterado/);

    const task = newTask();
    await tasks.save(task);
    await tasks.delete(task.id, "user-1");
    await expect(
      writer.commit(batch({ tasks: [{ op: "delete", id: task.id, expectedRevision: task.revision }] })),
    ).rejects.toThrow(/não existe mais/);
  });

  test("refuses a reference to another user's task", async () => {
    const foreignParent = newTask({ userId: "user-2" });
    await tasks.save(foreignParent);

    await expect(
      writer.commit(batch({ tasks: [{ op: "create", entity: newTask({ parentTaskId: foreignParent.id }) }] })),
    ).rejects.toThrow(/referenciados/);
    expect(await count("tasks")).toBe(1);
  });

  test("deleting a parent and its child in the same batch does not fail on the child", async () => {
    const parent = newTask();
    await tasks.save(parent);
    const child = newTask({ parentTaskId: parent.id });
    await tasks.save(child);
    const note = Note.create({ userId: "user-1", data: text("x") });
    await notes.save(note);

    await writer.commit(
      batch({
        tasks: [
          { op: "delete", id: parent.id, expectedRevision: parent.revision },
          { op: "delete", id: child.id, expectedRevision: child.revision },
        ],
        notes: [{ op: "delete", id: note.id, expectedRevision: note.revision }],
      }),
    );

    expect(await count("tasks")).toBe(0);
    expect(await count("notes")).toBe(0);
  });

  describe("series created in the batch", () => {
    const today = new Date("2026-09-16T15:00:00Z");
    const rule = {
      frequency: "daily",
      interval: 1,
      timeOfDay: "07:00",
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-16",
    } as const;

    const eventSeries = () =>
      Recurrence.create({
        userId: "user-1",
        target: "event",
        rule,
        template: { name: "Corrida", description: "", tags: [], priority: "normal", kind: "routine" },
      });

    const taskSeries = () =>
      Recurrence.create({
        userId: "user-1",
        target: "task",
        rule,
        template: { name: "Pagar o aluguel", description: "", tags: [] },
      });

    async function occurrencesOf(table: "events" | "tasks", recurrenceId: string) {
      const { rows } = await ctx.pool.query(
        `SELECT count(*)::int AS total, count(DISTINCT occurrence_on)::int AS days FROM ${table} WHERE recurrence_id = $1`,
        [recurrenceId],
      );
      return rows[0] as { total: number; days: number };
    }

    test("an event series is saved with its first occurrence, and the next reads add one row per day", async () => {
      const series = eventSeries();
      const first = buildEventOccurrence(series, "2026-09-16");

      await writer.commit(batch({ recurrences: [series], events: [{ op: "create", entity: first }] }));

      const stored = await recurrences.findById(series.id);
      expect(stored?.rule).toMatchObject({ frequency: "daily", timeOfDay: "07:00" });
      expect((await events.findById(first.id))?.occurrence).toEqual({
        recurrenceId: series.id,
        occurrenceOn: "2026-09-16",
        detached: false,
      });

      // O que a lista faz a cada leitura: duas passadas nao duplicam o dia da primeira.
      const materializer = new MaterializeRecurrencesUseCase(recurrences, () => today);
      await materializer.materialize("user-1");
      await materializer.materialize("user-1");

      const { total, days } = await occurrencesOf("events", series.id);
      expect(total).toBe(days);
      expect(total).toBeGreaterThan(30);
    });

    test("a task series is saved with its first task, without a duplicate on the first read", async () => {
      const series = taskSeries();
      const first = buildTaskOccurrenceOf(series, "2026-09-16");

      await writer.commit(batch({ recurrences: [series], tasks: [{ op: "create", entity: first }] }));

      expect((await tasks.findById(first.id))?.occurrence?.recurrenceId).toBe(series.id);
      await new MaterializeRecurrencesUseCase(recurrences, () => today).materialize("user-1");

      const { total, days } = await occurrencesOf("tasks", series.id);
      expect(total).toBe(days);
      expect(total).toBeGreaterThan(30);
    });

    test("a conflict in the batch rolls the series back too", async () => {
      const existing = newEvent();
      await events.save(existing);
      const series = eventSeries();

      await expect(
        writer.commit(
          batch({
            recurrences: [series],
            events: [
              { op: "create", entity: buildEventOccurrence(series, "2026-09-16") },
              { op: "update", entity: existing.revise({ name: "Outro" }), expectedRevision: existing.revision + 1 },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(EntityBatchConflictError);

      expect(await recurrences.findById(series.id)).toBeNull();
      expect(await count("events")).toBe(1);
    });
  });

  describe("series changed in the batch", () => {
    // A serie nasceu e foi gerada em 10/09; o agente age em 16/09.
    const seededAt = new Date("2026-09-10T15:00:00Z");
    const today = new Date("2026-09-16T15:00:00Z");
    const rule = {
      frequency: "daily",
      interval: 1,
      timeOfDay: "07:00",
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-10",
    } as const;

    async function seed(target: "event" | "task") {
      const series = Recurrence.create({
        userId: "user-1",
        target,
        rule,
        template:
          target === "event"
            ? { name: "Corrida", description: "", tags: [], priority: "normal", kind: "routine" }
            : { name: "Beber água", description: "", tags: [] },
      });
      await writer.commit(batch({ recurrences: [series] }));
      await new MaterializeRecurrencesUseCase(recurrences, () => seededAt).materialize("user-1");
      return (await recurrences.findById(series.id)) as Recurrence;
    }

    async function rows(table: "events" | "tasks", recurrenceId: string) {
      const { rows: found } = await ctx.pool.query(
        `SELECT to_char(occurrence_on, 'YYYY-MM-DD') AS day, to_char(started_at AT TIME ZONE 'UTC', 'HH24:MI') AS utc FROM ${table}
         WHERE recurrence_id = $1 ORDER BY occurrence_on`,
        [recurrenceId],
      );
      return found as Array<{ day: string; utc: string }>;
    }

    test("an altered event series replaces the upcoming occurrences and keeps the past, atomically", async () => {
      const series = await seed("event");
      const before = await rows("events", series.id);
      expect(before[0]?.day).toBe("2026-09-10");
      expect(before.length).toBeGreaterThan(30);

      const revised = series.revise({ rule: { timeOfDay: "08:00" } }).materializedUntil("2026-09-15");
      const first = buildEventOccurrence(revised, "2026-09-16");
      await writer.commit(batch({
        recurrenceChanges: [{ op: "update", recurrence: revised, expectedRevision: series.revision, fromDay: "2026-09-16" }],
        events: [{ op: "create", entity: first }],
      }));

      const afterWrite = await rows("events", series.id);
      expect(afterWrite.map((row) => row.day)).toEqual([
        "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16",
      ]);
      // O passado ficou as 07:00 locais (10:00Z); o dia novo, as 08:00 (11:00Z).
      expect(afterWrite.map((row) => row.utc)).toEqual(Array(6).fill("10:00").concat("11:00"));
      expect((await recurrences.findById(series.id))?.rule.timeOfDay).toBe("08:00");

      // A proxima leitura continua dali, com a regra nova e sem repetir o dia da primeira.
      await new MaterializeRecurrencesUseCase(recurrences, () => today).materialize("user-1");
      const regenerated = await rows("events", series.id);
      expect(new Set(regenerated.map((row) => row.day)).size).toBe(regenerated.length);
      expect(regenerated.filter((row) => row.day >= "2026-09-16").every((row) => row.utc === "11:00")).toBe(true);
    });

    test("a deleted series takes the upcoming occurrences and unlinks the past", async () => {
      const series = await seed("event");

      await writer.commit(batch({ recurrenceChanges: [{ op: "delete", id: series.id, fromDay: "2026-09-16" }] }));

      expect(await recurrences.findById(series.id)).toBeNull();
      const { rows: left } = await ctx.pool.query(
        "SELECT recurrence_id, occurrence_on, to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM events ORDER BY started_at",
      );
      expect(left.map((row) => row.day)).toEqual([
        "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15",
      ]);
      expect(left.every((row) => row.recurrence_id === null && row.occurrence_on === null)).toBe(true);
    });

    test("a task series is deleted the same way, in the same batch as a new task", async () => {
      const series = await seed("task");
      const extra = newTask({ name: "Outra" });

      await writer.commit(batch({
        tasks: [{ op: "create", entity: extra }],
        recurrenceChanges: [{ op: "delete", id: series.id, fromDay: "2026-09-16" }],
      }));

      expect(await recurrences.findById(series.id)).toBeNull();
      expect((await rows("tasks", series.id))).toEqual([]);
      expect(await tasks.findById(extra.id)).not.toBeNull();
      const { rows: left } = await ctx.pool.query("SELECT count(*)::int AS total FROM tasks WHERE name = 'Beber água'");
      expect(left[0].total).toBe(6);
    });

    test("a stale revision is a conflict and neither the series nor the occurrences change", async () => {
      const series = await seed("event");
      const total = (await rows("events", series.id)).length;

      const revised = series.revise({ rule: { timeOfDay: "08:00" } });
      await expect(
        writer.commit(batch({
          recurrenceChanges: [{ op: "update", recurrence: revised, expectedRevision: series.revision + 5, fromDay: "2026-09-16" }],
        })),
      ).rejects.toBeInstanceOf(EntityBatchConflictError);

      expect((await recurrences.findById(series.id))?.revision).toBe(series.revision);
      expect((await rows("events", series.id)).length).toBe(total);
    });

    test("a series of another user is not touched", async () => {
      const series = await seed("event");

      await expect(
        writer.commit({ userId: "user-2", events: [], tasks: [], notes: [], recurrenceChanges: [{ op: "delete", id: series.id, fromDay: "2026-09-16" }] }),
      ).rejects.toThrow();

      expect(await recurrences.findById(series.id)).not.toBeNull();
    });

    test("the next occurrence ignores the past, the detached and the deleted ones", async () => {
      const series = await seed("event");
      const upcoming = await rows("events", series.id);
      const next = upcoming.find((row) => row.day >= "2026-09-16");
      expect(next?.day).toBe("2026-09-16");

      const { rows: [firstId] } = await ctx.pool.query("SELECT id FROM events WHERE recurrence_id = $1 AND occurrence_on = '2026-09-16'", [series.id]);
      await ctx.pool.query("UPDATE events SET recurrence_detached = true WHERE id = $1", [firstId.id]);

      const found = await recurrences.findNextOccurrenceId(series.id, "2026-09-16");
      const { rows: [expected] } = await ctx.pool.query("SELECT id FROM events WHERE recurrence_id = $1 AND occurrence_on = '2026-09-17'", [series.id]);
      expect(found).toBe(expected.id);
      expect(await recurrences.findNextOccurrenceId("missing", "2026-09-16")).toBeNull();
    });
  });
});
