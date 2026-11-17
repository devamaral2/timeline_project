import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CreateRecurrenceInput } from "@repo/contracts";
import { Artifact, Task, RecurrenceRevisionConflictError, type Recurrence } from "../../domain";
import { InMemoryTaskCardQuery } from "../tasks/testing/in-memory-task-card.query";
import type { InMemoryTaskDatabase } from "../tasks/testing/in-memory-task-database";
import { createTasksKit, type TasksKitOptions } from "../tasks/testing/in-memory-tasks-kit";
import {
  DEFAULT_HORIZON_DAYS,
  MAX_HORIZON_DAYS,
  MaterializeRecurrencesUseCase,
  NO_RECURRENCES,
} from "./materialize-recurrences.usecase";
import { prepareRecurrence } from "./prepare-recurrence";
import { InMemoryRecurrenceRepository } from "./testing/in-memory-recurrence.repository";

const actor = { userId: "auth-user-1" };
// 15/09/2026, 12:00 em Sao Paulo.
const now = new Date("2026-09-15T15:00:00.000Z");

const dailyRun: CreateRecurrenceInput = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "07:00",
  durationMinutes: 30,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
  template: { name: "Correr", tags: ["saude"] },
};

function setup(options: TasksKitOptions = {}, clock: { now: Date } = { now }) {
  const kit = createTasksKit({ clock: () => clock.now, ...options });
  const recurrences = new InMemoryRecurrenceRepository(kit.database);
  const materializer = new MaterializeRecurrencesUseCase(recurrences, kit.artifactRepository, () => clock.now);
  /** Grava a serie como `POST /api/recurrences` gravaria. */
  const create = async (input: CreateRecurrenceInput, owner = actor): Promise<Recurrence> => {
    const prepared = await prepareRecurrence({ createTask: kit.createTask, tasks: kit.taskRepository }, input, owner);
    await recurrences.save(prepared.recurrence, { created: prepared.artifacts, derivations: prepared.derivations });
    return prepared.recurrence;
  };
  return { ...kit, recurrences, materializer, create };
}

function daysOf(database: InMemoryTaskDatabase): (string | undefined)[] {
  return database.tasks.map((task) => task.occurrence?.occurrenceOn).sort();
}

function on(database: InMemoryTaskDatabase, day: string): Task {
  return database.tasks.find((task) => task.occurrence?.occurrenceOn === day) as Task;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what is generated", () => {
  test("generates from today, not from startsOn, each occurrence in the window of the rule", async () => {
    const { create, materializer, database } = setup();
    const series = await create({ ...dailyRun, endsOn: "2026-09-17" });

    await materializer.materialize(actor.userId);

    expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
    const first = on(database, "2026-09-15");
    expect(first).toMatchObject({
      userId: "auth-user-1",
      kind: "common",
      name: "Correr",
      tags: ["saude"],
      revision: 1,
      occurrence: { recurrenceId: series.id, occurrenceOn: "2026-09-15", detached: false },
    });
    expect(first.startedAt?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
    expect(first.estimatedFinishAt?.toISOString()).toBe("2026-09-15T10:30:00.000Z");
    expect(first.finishedAt).toBeUndefined();
  });

  test("a series that starts in the future begins on its first day", async () => {
    const { create, materializer, database } = setup();
    await create({ ...dailyRun, startsOn: "2026-09-20", endsOn: "2026-09-21" });

    await materializer.materialize(actor.userId);

    expect(daysOf(database)).toEqual(["2026-09-20", "2026-09-21"]);
  });

  test("a template without status generates reference occurrences, which appear in the agenda", async () => {
    const { create, materializer, database, recurrences } = setup();
    const series = await create({ ...dailyRun, endsOn: "2026-09-16" });

    await materializer.materialize(actor.userId);

    expect(database.tasks.every((task) => task.isReference)).toBe(true);
    expect(on(database, "2026-09-15").notifyOffsetsMinutes).toEqual([5]);
    const query = new InMemoryTaskCardQuery(database, recurrences);
    const agenda = await query.agenda({ userId: actor.userId, limit: 10 });
    expect(agenda.items.map((card) => card.task.occurrence?.occurrenceOn)).toEqual(["2026-09-16", "2026-09-15"]);
    expect(agenda.items[0]?.recurrence?.id).toBe(series.id);
    expect(await query.tracked({ userId: actor.userId })).toEqual([]);
  });

  test("a template with a status generates tracked occurrences, and the series shows once in the tracked list", async () => {
    const { create, materializer, database, recurrences } = setup();
    await create({
      frequency: "monthly",
      interval: 1,
      byMonthDay: 5,
      timeOfDay: "09:00",
      durationMinutes: 60,
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-01",
      endsOn: "2026-11-30",
      template: { name: "Pagar aluguel", status: "todo", priority: "high" },
    });

    await materializer.materialize(actor.userId, new Date("2026-11-30T15:00:00.000Z"));

    expect(daysOf(database)).toEqual(["2026-10-05", "2026-11-05"]);
    const october = on(database, "2026-10-05");
    expect(october).toMatchObject({ status: "todo", priority: "high", notifyOffsetsMinutes: [] });
    expect(october.isReference).toBe(false);
    expect(october.startedAt?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(october.estimatedFinishAt?.toISOString()).toBe("2026-10-05T13:00:00.000Z");

    const tracked = await new InMemoryTaskCardQuery(database, recurrences).tracked({ userId: actor.userId });
    expect(tracked.map((card) => card.task.occurrence?.occurrenceOn)).toEqual(["2026-10-05"]);
  });

  test("skips the days that were removed from the series", async () => {
    const { create, materializer, recurrences, database } = setup();
    const series = await create({ ...dailyRun, endsOn: "2026-09-17" });
    await recurrences.addException(series.id, "2026-09-16");

    await materializer.materialize(actor.userId);

    expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-17"]);
  });

  test("another user's series is never generated into this user's agenda", async () => {
    const { create, materializer, database } = setup();
    await create(dailyRun, { userId: "someone-else" });

    await materializer.materialize(actor.userId);

    expect(database.tasks).toEqual([]);
  });
});

describe("horizon and watermark", () => {
  test("a common read generates the default horizon and records how far it went", async () => {
    const { create, materializer, database, recurrences } = setup();
    const series = await create(dailyRun);

    await materializer.materialize(actor.userId);

    expect(database.tasks).toHaveLength(DEFAULT_HORIZON_DAYS + 1);
    expect((await recurrences.findById(series.id))?.materializedThrough).toBe("2026-11-14");
    expect((await recurrences.findById(series.id))?.revision).toBe(1);
  });

  test("a second read writes nothing new", async () => {
    const { create, materializer, database } = setup();
    await create(dailyRun);

    await materializer.materialize(actor.userId);
    const afterFirst = [...database.tasks];
    await materializer.materialize(actor.userId);

    expect(database.tasks).toEqual(afterFirst);
  });

  test("a later read continues from the watermark", async () => {
    const clock = { now };
    const { create, materializer, database } = setup({}, clock);
    await create(dailyRun);
    await materializer.materialize(actor.userId);

    clock.now = new Date("2026-09-17T15:00:00.000Z");
    await materializer.materialize(actor.userId);

    expect(database.tasks).toHaveLength(DEFAULT_HORIZON_DAYS + 3);
    expect(daysOf(database).at(-1)).toBe("2026-11-16");
    expect(new Set(daysOf(database)).size).toBe(database.tasks.length);
  });

  test("reaching further generates up to the day asked, within the ceiling", async () => {
    const { create, materializer, recurrences } = setup();
    const series = await create(dailyRun);

    await materializer.materialize(actor.userId, new Date("2026-12-31T15:00:00.000Z"));
    expect((await recurrences.findById(series.id))?.materializedThrough).toBe("2026-12-31");

    await materializer.materialize(actor.userId, new Date("2099-01-01T15:00:00.000Z"));
    const ceiling = new Date(Date.UTC(2026, 8, 15 + MAX_HORIZON_DAYS)).toISOString().slice(0, 10);
    expect((await recurrences.findById(series.id))?.materializedThrough).toBe(ceiling);
  });

  test("asking for a day in the past still generates the default horizon", async () => {
    const { create, materializer, database } = setup();
    await create(dailyRun);

    await materializer.materialize(actor.userId, new Date("2026-01-01T15:00:00.000Z"));

    expect(database.tasks).toHaveLength(DEFAULT_HORIZON_DAYS + 1);
    expect(daysOf(database)[0]).toBe("2026-09-15");
  });

  test("a series generated up to its last day is not read again", async () => {
    const { create, materializer, recurrences } = setup();
    const series = await create({ ...dailyRun, endsOn: "2026-09-17" });
    await materializer.materialize(actor.userId);
    const write = vi.spyOn(recurrences, "materialize");

    await materializer.materialize(actor.userId, new Date("2026-12-31T15:00:00.000Z"));

    expect(write).not.toHaveBeenCalled();
    expect((await recurrences.findById(series.id))?.materializedThrough).toBe("2026-11-14");
  });

  test("an occurrence of a day that already exists is not duplicated", async () => {
    const { create, materializer, database, recurrences } = setup();
    const series = await create({ ...dailyRun, endsOn: "2026-09-16" });
    await materializer.materialize(actor.userId);
    const edited = on(database, "2026-09-16").revise({ description: "editada" });
    database.tasks = database.tasks.map((task) => (task.id === edited.id ? edited : task));

    // A marca d'agua volta, como numa edicao da serie que nao apagou a ocorrencia destacada.
    recurrences.recurrences = [series];
    await materializer.materialize(actor.userId);

    expect(daysOf(database)).toEqual(["2026-09-15", "2026-09-16"]);
    expect(on(database, "2026-09-16").description).toBe("editada");
  });
});

describe("artifacts of the template", () => {
  test("every occurrence uses the same artifact, each with its own link from the series", async () => {
    const { create, materializer, database } = setup();
    const series = await create({
      ...dailyRun,
      endsOn: "2026-09-17",
      template: { name: "Correr", artifacts: [{ data: { body: "alongar" } }] },
    });

    await materializer.materialize(actor.userId);

    const [note] = database.artifacts;
    expect(database.artifacts).toHaveLength(1);
    expect(series.template.artifactIds).toEqual([note?.id]);
    expect(database.tasks).toHaveLength(3);
    for (const task of database.tasks) {
      expect(task.artifactLinks).toEqual([{ artifactId: note?.id, relation: "uses", fromRecurrence: true }]);
    }
  });

  test("a meal series shares one pending food with every occurrence", async () => {
    const { create, materializer, database } = setup();
    await create({ ...dailyRun, timeOfDay: "12:30", endsOn: "2026-09-17", template: { kind: "meal", description: "arroz e feijão" } });

    await materializer.materialize(actor.userId);

    expect(database.artifacts).toHaveLength(1);
    expect(database.artifacts[0]?.data).toMatchObject({ description: "arroz e feijão", generation: { status: "pending" } });
    expect(database.tasks.every((task) => task.kind === "meal" && task.name === "Almoço")).toBe(true);
    expect(database.tasks.every((task) => task.artifactLinks[0]?.artifactId === database.artifacts[0]?.id)).toBe(true);
  });

  test("an artifact of the template that was deleted disappears from the new occurrences, and the series goes on", async () => {
    const clock = { now };
    const kept = Artifact.create({ id: "kept", userId: actor.userId, data: { body: "fica" } });
    const doomed = Artifact.create({ id: "doomed", userId: actor.userId, data: { body: "some" } });
    const { create, materializer, database, artifactRepository } = setup({ artifacts: [kept, doomed] }, clock);
    await create({ ...dailyRun, endsOn: "2026-11-30", template: { name: "Correr", artifactIds: ["doomed", "kept"] } });
    await materializer.materialize(actor.userId);

    await artifactRepository.delete("doomed", actor.userId);
    clock.now = new Date("2026-09-16T15:00:00.000Z");
    await materializer.materialize(actor.userId);

    // O dia que nasceu depois de o artefato ser apagado so tem o que ainda existe.
    expect(on(database, "2026-11-15").artifactLinks).toEqual([{ artifactId: "kept", relation: "uses", fromRecurrence: true }]);
    // Os que ja existiam guardam a relacao; ela so nao leva a lugar nenhum.
    expect(on(database, "2026-09-15").artifactLinks.map((link) => link.artifactId)).toEqual(["doomed", "kept"]);
  });
});

describe("main task of the template", () => {
  const project = () => Task.create({ id: "project", userId: actor.userId, name: "Projeto", longRunning: true });
  const sessions: CreateRecurrenceInput = {
    ...dailyRun,
    endsOn: "2026-09-17",
    template: { name: "Sessão", status: "todo", parentTaskId: "project" },
  };

  test("each occurrence is born a subtask of the main task, without counting as an edit of it", async () => {
    const { create, materializer, database, recurrences, taskRepository } = setup({ tasks: [project()] });
    await create(sessions);
    const materialize = vi.spyOn(recurrences, "materialize");

    await materializer.materialize(actor.userId);

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(materialize.mock.calls[0]?.[2]).toBe("project");
    const parent = await taskRepository.findById("project");
    const occurrences = database.tasks.filter((task) => task.occurrence);
    expect(occurrences).toHaveLength(3);
    expect(parent?.subtaskIds).toEqual(occurrences.map((task) => task.id));
    expect(parent?.revision).toBe(1);
    expect(database.edges).toEqual(occurrences.map((task) => ({ parentId: "project", subtaskId: task.id })));
    const first = await taskRepository.findById(occurrences[0]?.id as string);
    expect(first?.parentId).toBe("project");
    expect(first?.subtaskIds).toEqual([]);
    expect(occurrences.map((task) => task.occurrence?.occurrenceOn)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
  });

  test("a series without a main task passes none", async () => {
    const { create, materializer, recurrences } = setup();
    await create(dailyRun);
    const materialize = vi.spyOn(recurrences, "materialize");

    await materializer.materialize(actor.userId);

    expect(materialize.mock.calls[0]?.[2]).toBeUndefined();
  });

  test("a previous task that was deleted stops the series from generating, without breaking the read", async () => {
    const { create, materializer, database, recurrences, taskRepository } = setup({ tasks: [project()] });
    const series = await create(sessions);
    await taskRepository.delete("project", actor.userId);

    await materializer.materialize(actor.userId);

    expect(database.tasks).toEqual([]);
    expect((await recurrences.findById(series.id))?.materializedThrough).toBe("2026-11-14");
  });
});

describe("failures", () => {
  test("a series edited in the middle of the read is skipped: the next read generates with the new rule", async () => {
    const { create, materializer, database, recurrences } = setup();
    const series = await create({ ...dailyRun, endsOn: "2026-09-17" });
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    // Outra aba edita a serie depois de ela ter sido listada como pendente.
    const listed = recurrences.listPendingMaterialization.bind(recurrences);
    vi.spyOn(recurrences, "listPendingMaterialization").mockImplementationOnce(async (...args) => {
      const pending = await listed(...args);
      recurrences.recurrences = [series.revise({ rule: { timeOfDay: "08:00" } })];
      return pending;
    });

    await materializer.materialize(actor.userId);
    expect(database.tasks).toEqual([]);
    expect(error).not.toHaveBeenCalled();

    await materializer.materialize(actor.userId);
    expect(on(database, "2026-09-15").startedAt?.toISOString()).toBe("2026-09-15T11:00:00.000Z");
  });

  test("the repository refuses to advance a series whose revision changed", async () => {
    const { create, recurrences } = setup();
    const series = await create(dailyRun);
    recurrences.recurrences = [series.revise({ rule: { interval: 2 } })];

    await expect(recurrences.materialize(series.materializedUntil("2026-09-20"), [])).rejects.toThrow(
      RecurrenceRevisionConflictError,
    );
  });

  test("a broken series is logged and does not stop the others", async () => {
    const { create, materializer, database, recurrences } = setup();
    const broken = await create({ ...dailyRun, template: { name: "Quebrada" } });
    const healthy = await create({ ...dailyRun, endsOn: "2026-09-16", template: { name: "Inteira" } });
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const listExceptions = recurrences.listExceptions.bind(recurrences);
    vi.spyOn(recurrences, "listExceptions").mockImplementation(async (recurrenceId) => {
      if (recurrenceId === broken.id) throw new Error("banco fora do ar");
      return listExceptions(recurrenceId);
    });

    await materializer.materialize(actor.userId);

    expect(error).toHaveBeenCalledTimes(1);
    expect(database.tasks.map((task) => task.name)).toEqual(["Inteira", "Inteira"]);
    expect((await recurrences.findById(healthy.id))?.materializedThrough).toBe("2026-11-14");
    expect((await recurrences.findById(broken.id))?.materializedThrough).toBeUndefined();
  });

  test("NO_RECURRENCES does nothing, for the reads that have no series", async () => {
    await expect(NO_RECURRENCES.materialize(actor.userId, now)).resolves.toBeUndefined();
  });
});
