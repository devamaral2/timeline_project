import { describe, expect, test } from "vitest";
import type { CreateRecurrenceInput } from "@repo/contracts";
import {
  Artifact,
  ArtifactOwnershipError,
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  Recurrence,
  RecurrenceValidationError,
} from "../../domain";
import { createTasksKit, type TasksKitOptions } from "../tasks/testing/in-memory-tasks-kit";
import { prepareRecurrence } from "./prepare-recurrence";
import { buildOccurrence, sampleDayOf, storedTemplateOf, todayOf } from "./recurrence-templates";

const actor = { userId: "auth-user-1" };
// 15/09/2026, 12:00 em Sao Paulo.
const now = new Date("2026-09-15T15:00:00.000Z");

const daily = {
  frequency: "daily" as const,
  interval: 1,
  timeOfDay: "07:00",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
};
const dailyRun: CreateRecurrenceInput = { ...daily, durationMinutes: 30, template: { name: "Correr", tags: ["Saude"] } };
const zeroTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};

function setup(options: TasksKitOptions = {}) {
  const kit = createTasksKit({ clock: () => now, ...options });
  const prepare = (input: CreateRecurrenceInput, options?: { derivedArtifacts?: boolean }) =>
    prepareRecurrence({ createTask: kit.createTask, tasks: kit.taskRepository }, input, actor, options);
  return { ...kit, prepare };
}

describe("prepareRecurrence", () => {
  test("builds the series with the rule and the resolved template, without writing anything", async () => {
    const kit = setup();

    const { recurrence, artifacts, derivations } = await kit.prepare(dailyRun);

    expect(recurrence.userId).toBe("auth-user-1");
    expect(recurrence.revision).toBe(1);
    expect(recurrence.materializedThrough).toBeUndefined();
    expect(recurrence.rule).toEqual({ ...daily, durationMinutes: 30 });
    expect(recurrence.template).toEqual({
      kind: "common",
      name: "Correr",
      description: "",
      tags: ["saude"],
      priority: "medium",
      notifyOffsetsMinutes: [5],
      artifactIds: [],
    });
    expect(artifacts).toEqual([]);
    expect(derivations).toEqual([]);
    expect(kit.database.tasks).toEqual([]);
    expect(kit.batchWriter.commits).toEqual([]);
  });

  test("the project of the series is one more field of the template, stored when one was chosen", async () => {
    const kit = setup();

    const chosen = await kit.prepare({ ...dailyRun, template: { name: "Correr", projectId: "project-1" } });
    const none = await kit.prepare(dailyRun);

    expect(chosen.recurrence.template).toMatchObject({ projectId: "project-1" });
    expect(storedTemplateOf(chosen.recurrence).projectId).toBe("project-1");
    expect(none.recurrence.template).not.toHaveProperty("projectId");
    expect(storedTemplateOf(none.recurrence)).not.toHaveProperty("projectId");
  });

  test("the template has no target, no window and no status unless one was given", async () => {
    const kit = setup();

    const reference = await kit.prepare(dailyRun);
    const tracked = await kit.prepare({ ...dailyRun, template: { name: "Pagar aluguel", status: "todo", priority: "high" } });

    expect(reference.recurrence.template).not.toHaveProperty("status");
    expect(reference.recurrence.template).not.toHaveProperty("startedAt");
    expect(reference.recurrence).not.toHaveProperty("target");
    expect(tracked.recurrence.template).toMatchObject({ status: "todo", priority: "high", notifyOffsetsMinutes: [] });
  });

  test("the new artifacts of the template become ids: the content is stored once, outside the series", async () => {
    const kit = setup();

    const { recurrence, artifacts } = await kit.prepare({
      ...dailyRun,
      template: { name: "Correr", artifacts: [{ data: { body: "alongar antes" } }, { type: "sleep", data: { score: 80 } }] },
    });

    expect(artifacts.map((artifact) => artifact.type)).toEqual(["text", "sleep"]);
    expect(recurrence.template.artifactIds).toEqual(artifacts.map((artifact) => artifact.id));
    expect(recurrence.template).not.toHaveProperty("artifacts");
    // O primeiro artefato de sono da a natureza quando ninguem disse qual e.
    expect(recurrence.template.kind).toBe("sleep");
    expect(kit.database.artifacts).toEqual([]);
  });

  test("a meal series is named after the hour of the rule and shares one pending food", async () => {
    const kit = setup();

    const { recurrence, artifacts } = await kit.prepare({ ...daily, timeOfDay: "12:30", template: { kind: "meal" } });

    expect(recurrence.template).toMatchObject({ kind: "meal", name: "Almoço" });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.data).toMatchObject({ description: "Almoço", items: [], generation: { status: "pending" } });
    expect(recurrence.template.artifactIds).toEqual([artifacts[0]?.id]);
  });

  test("`derivedArtifacts: false` creates no food for a meal series", async () => {
    const kit = setup();

    const { recurrence, artifacts } = await kit.prepare(
      { ...daily, timeOfDay: "20:00", template: { kind: "meal" } },
      { derivedArtifacts: false },
    );

    expect(recurrence.template).toMatchObject({ kind: "meal", name: "Jantar", artifactIds: [] });
    expect(artifacts).toEqual([]);
  });

  test("a copy of a food comes with its derivation", async () => {
    const original = Artifact.create({
      id: "food-1",
      userId: actor.userId,
      type: "food",
      name: "Arroz",
      data: { description: "arroz", items: [], totals: zeroTotals },
    });
    const kit = setup({ artifacts: [original] });

    const { recurrence, artifacts, derivations } = await kit.prepare({
      ...daily,
      template: { artifacts: [{ copyOf: "food-1", quantity: "1 prato" }] },
    });

    expect(artifacts[0]).toMatchObject({ derived: true, name: "Arroz" });
    expect(artifacts[0]?.data).toMatchObject({ quantity: "1 prato" });
    expect(derivations).toEqual([{ originalId: "food-1", copyId: artifacts[0]?.id }]);
    expect(recurrence.template.artifactIds).toEqual([artifacts[0]?.id]);
  });

  test("artifacts that already exist are stored by id, after the new ones, and must be the user's or global", async () => {
    const own = Artifact.create({ id: "own", userId: actor.userId, data: { body: "checklist" } });
    const theirs = Artifact.create({ id: "theirs", userId: "someone-else", data: { body: "dele" } });
    const kit = setup({ artifacts: [own, theirs] });

    const { recurrence, artifacts } = await kit.prepare({
      ...daily,
      template: { name: "Correr", artifacts: [{ data: { body: "nova" } }], artifactIds: ["own"] },
    });

    expect(recurrence.template.artifactIds).toEqual([artifacts[0]?.id, "own"]);
    expect(artifacts).toHaveLength(1);
    await expect(kit.prepare({ ...daily, template: { name: "Correr", artifactIds: ["theirs"] } })).rejects.toThrow(
      ArtifactOwnershipError,
    );
  });

  describe("previous tasks", () => {
    const parent = () => Task.create({ id: "project", userId: actor.userId, name: "Projeto", longRunning: true });

    test("are stored in the template without repeats, and are not edited by preparing the series", async () => {
      const kit = setup({ tasks: [parent()] });

      const { recurrence } = await kit.prepare({
        ...daily,
        template: { name: "Sessão", status: "todo", parentTaskId: "project" },
      });

      expect(recurrence.template.parentTaskId).toBe("project");
      expect(kit.database.tasks[0]?.revision).toBe(1);
      expect(kit.database.tasks[0]?.subtaskIds).toEqual([]);
      expect(kit.database.edges).toEqual([]);
    });

    test("must exist and belong to the user", async () => {
      const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
      const kit = setup({ tasks: [theirs] });

      await expect(kit.prepare({ ...daily, template: { name: "Filha", parentTaskId: "missing" } })).rejects.toThrow(
        TaskNotFoundError,
      );
      await expect(kit.prepare({ ...daily, template: { name: "Filha", parentTaskId: "theirs" } })).rejects.toThrow(
        TaskOwnershipError,
      );
    });
  });

  describe("refusals", () => {
    test("the rule is validated before the template", async () => {
      const kit = setup();

      await expect(kit.prepare({ ...daily, interval: 0, template: {} })).rejects.toThrow(
        "Recurrence interval must be an integer >= 1",
      );
      await expect(kit.prepare({ ...daily, frequency: "weekly", template: { name: "x" } })).rejects.toThrow(
        RecurrenceValidationError,
      );
    });

    test("a series that never happens", async () => {
      const kit = setup();

      await expect(
        kit.prepare({
          ...daily,
          frequency: "monthly",
          byMonthDay: 31,
          startsOn: "2026-04-01",
          endsOn: "2026-04-30",
          template: { name: "Fechar o mês" },
        }),
      ).rejects.toThrow("The recurrence never happens");
    });

    test("a template that is not an object", async () => {
      const kit = setup();

      await expect(kit.prepare({ ...daily, template: "Correr" as never })).rejects.toThrow(
        "A recurrence template must be an object",
      );
      await expect(kit.prepare({ ...daily, template: null as never })).rejects.toThrow(RecurrenceValidationError);
    });

    test("a template that does not generate a valid task", async () => {
      const kit = setup();

      await expect(kit.prepare({ ...daily, template: {} })).rejects.toThrow("Task requires a name");
      await expect(kit.prepare({ ...daily, template: { name: "x", status: "queued" as never } })).rejects.toThrow(
        "Unknown task status: queued",
      );
      await expect(kit.prepare({ ...daily, template: { name: "x", notifyOffsetsMinutes: [0] } })).rejects.toThrow(
        "Invalid notification offset",
      );
    });

    test("a block longer than 31 days", async () => {
      const kit = setup();

      await expect(kit.prepare({ ...daily, durationMinutes: 32 * 24 * 60, template: { name: "Viagem" } })).rejects.toThrow(
        "A task longer than 31 days must be long-running",
      );
    });
  });
});

describe("recurrence templates", () => {
  const series = (template: Record<string, unknown>, rule: Partial<typeof daily & { durationMinutes: number }> = {}) =>
    Recurrence.create({ id: "rec-1", userId: actor.userId, rule: { ...daily, ...rule }, template });

  test("sampleDayOf is the first day the rule falls on", () => {
    expect(sampleDayOf(daily)).toBe("2026-09-01");
    // 01/09/2026 e uma terca; a primeira quinta e dia 3.
    expect(sampleDayOf({ ...daily, frequency: "weekly", byWeekday: 0b0010000 })).toBe("2026-09-03");
    expect(sampleDayOf({ ...daily, frequency: "yearly", byMonth: 2, byMonthDay: 29 })).toBe("2028-02-29");
    expect(() => sampleDayOf({ ...daily, frequency: "monthly", byMonthDay: 31, endsOn: "2026-09-30" })).toThrow(
      RecurrenceValidationError,
    );
  });

  test("storedTemplateOf fills what an old or empty template lacks", () => {
    expect(storedTemplateOf(series({}))).toEqual({
      kind: "common",
      status: undefined,
      name: "",
      description: "",
      tags: [],
      priority: "medium",
      notifyOffsetsMinutes: [],
      artifactIds: [],
    });
    expect(storedTemplateOf(series({ kind: "meal", status: "todo", artifactIds: ["a"], parentTaskId: "p" }))).toMatchObject({
      kind: "meal",
      status: "todo",
      artifactIds: ["a"],
      parentTaskId: "p",
    });
  });

  test("storedTemplateOf ignores the legacy lists of a template stored before the main task", () => {
    const legacy = series({ name: "Sessão", parentTaskIds: ["p"], previousTaskIds: ["q"] } as never);

    expect(storedTemplateOf(legacy).parentTaskId).toBeUndefined();
    expect(storedTemplateOf(legacy)).not.toHaveProperty("parentTaskIds");
    expect(storedTemplateOf(legacy)).not.toHaveProperty("previousTaskIds");
  });

  test("todayOf is the civil day in the time zone of the rule", () => {
    const lateNightUtc = new Date("2026-09-16T01:30:00.000Z");

    expect(todayOf(daily, lateNightUtc)).toBe("2026-09-15");
    expect(todayOf({ ...daily, timeZone: "UTC" }, lateNightUtc)).toBe("2026-09-16");
  });

  describe("buildOccurrence", () => {
    const template = {
      kind: "common",
      name: "Correr",
      description: "no parque",
      location: "Parque Ibirapuera, São Paulo",
      tags: ["saude"],
      priority: "high",
      notifyOffsetsMinutes: [15],
      artifactIds: ["a1", "a2"],
      parentTaskId: "project",
    };

    test("copies the template into the window of the day, linked to the series", () => {
      const occurrence = buildOccurrence(series(template, { durationMinutes: 30 }), "2026-09-15");

      expect(occurrence).toMatchObject({
        userId: "auth-user-1",
        actor: "human",
        kind: "common",
        name: "Correr",
        description: "no parque",
        location: "Parque Ibirapuera, São Paulo",
        tags: ["saude"],
        priority: "high",
        notifyOffsetsMinutes: [15],
        revision: 1,
        occurrence: { recurrenceId: "rec-1", occurrenceOn: "2026-09-15", detached: false },
      });
      expect(occurrence.startedAt?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
      expect(occurrence.estimatedFinishAt?.toISOString()).toBe("2026-09-15T10:30:00.000Z");
      expect(occurrence.status).toBeUndefined();
    });

    test("an occurrence carries no project of its own: the writer puts it in the project of the series", () => {
      const occurrence = buildOccurrence(series({ ...template, projectId: "project-1" }), "2026-09-15");

      expect(occurrence.projectId).toBeUndefined();
    });

    test("each occurrence uses the same artifacts, with links that belong to the series", () => {
      const occurrence = buildOccurrence(series(template), "2026-09-15");

      expect(occurrence.artifactLinks).toEqual([
        { artifactId: "a1", relation: "uses", fromRecurrence: true },
        { artifactId: "a2", relation: "uses", fromRecurrence: true },
      ]);
    });

    test("an artifact of the template that no longer exists is left out", () => {
      const occurrence = buildOccurrence(series(template), "2026-09-15", new Set(["a2"]));

      expect(occurrence.artifactLinks.map((link) => link.artifactId)).toEqual(["a2"]);
      expect(buildOccurrence(series(template), "2026-09-15", new Set()).artifactLinks).toEqual([]);
    });

    test("the previous tasks are not part of the occurrence: the sequence is written with the batch", () => {
      const occurrence = buildOccurrence(series(template), "2026-09-15");

      expect(occurrence.parentId).toBeUndefined();
      expect(occurrence.subtaskIds).toEqual([]);
    });

    test("a reference occurrence without a duration gets the typical one of its kind", () => {
      const occurrence = buildOccurrence(series({ ...template, kind: "training" }), "2026-09-15");

      expect(occurrence.estimatedFinishAt?.toISOString()).toBe("2026-09-15T11:30:00.000Z");
    });

    test("a tracked occurrence has the status of the template, and the duration of the rule as its deadline", () => {
      const tracked = { ...template, status: "todo", notifyOffsetsMinutes: [] };

      const open = buildOccurrence(series(tracked), "2026-09-15");
      const windowed = buildOccurrence(series(tracked, { durationMinutes: 60 }), "2026-09-15");

      expect(open.status).toBe("todo");
      expect(open.isReference).toBe(false);
      expect(open.estimatedFinishAt).toBeUndefined();
      expect(windowed.estimatedFinishAt?.toISOString()).toBe("2026-09-15T11:00:00.000Z");
    });
  });
});
