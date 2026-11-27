import { describe, expect, test } from "vitest";
import { Artifact, Task, TaskNotFoundError, Recurrence, RecurrenceValidationError } from "../../domain";
import { createTasksKit, type TasksKitOptions } from "../tasks/testing/in-memory-tasks-kit";
import { reviseRecurrence, type RecurrenceRevision } from "./revise-recurrence";

const actor = { userId: "auth-user-1" };
// 15/09/2026, 12:00 em Sao Paulo.
const now = new Date("2026-09-15T15:00:00.000Z");

const rule = {
  frequency: "daily" as const,
  interval: 1,
  timeOfDay: "07:00",
  durationMinutes: 30,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
};
const template = {
  kind: "common",
  name: "Correr",
  description: "",
  tags: ["saude"],
  priority: "medium",
  notifyOffsetsMinutes: [5],
  artifactIds: ["series-note"],
};

function existing(overrides: { materializedThrough?: string; startsOn?: string } = {}): Recurrence {
  return Recurrence.rehydrate({
    id: "rec-1",
    userId: actor.userId,
    rule: { ...rule, startsOn: overrides.startsOn ?? rule.startsOn },
    template,
    revision: 3,
    materializedThrough: overrides.materializedThrough,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

function setup(options: TasksKitOptions = {}) {
  const seriesNote = Artifact.create({ id: "series-note", userId: actor.userId, data: { body: "alongar" } });
  const kit = createTasksKit({ clock: () => now, ...options, artifacts: [seriesNote, ...(options.artifacts ?? [])] });
  const revise = (
    series: Recurrence,
    revision: RecurrenceRevision,
    at: Date = now,
    options?: { derivedArtifacts?: boolean },
  ) => reviseRecurrence({ createTask: kit.createTask, tasks: kit.taskRepository }, series, revision, actor, at, options);
  return { ...kit, revise };
}

describe("rule", () => {
  test("changes only what was sent, keeps the template and bumps the revision once", async () => {
    const { revise } = setup();

    const { recurrence, artifacts, derivations } = await revise(existing(), { rule: { timeOfDay: "08:00" } });

    expect(recurrence.id).toBe("rec-1");
    expect(recurrence.revision).toBe(4);
    expect(recurrence.rule).toEqual({ ...rule, timeOfDay: "08:00" });
    expect(recurrence.template).toEqual(template);
    expect(artifacts).toEqual([]);
    expect(derivations).toEqual([]);
  });

  test("a rule key set to undefined removes the optional field", async () => {
    const { revise } = setup();

    const { recurrence } = await revise(existing(), { rule: { durationMinutes: undefined } });

    expect(recurrence.rule).not.toHaveProperty("durationMinutes");
  });

  test("an empty revision is still a revision", async () => {
    const { revise } = setup();

    expect((await revise(existing(), { rule: {} })).recurrence.revision).toBe(4);
  });

  test("refuses a rule that becomes invalid", async () => {
    const { revise } = setup();

    await expect(revise(existing(), { rule: { frequency: "weekly" } })).rejects.toThrow(RecurrenceValidationError);
    await expect(revise(existing(), { rule: { endsOn: "2026-08-01" } })).rejects.toThrow(
      "endsOn must be on or after startsOn",
    );
  });

  test("writes nothing", async () => {
    const kit = setup();

    await kit.revise(existing(), { rule: { timeOfDay: "08:00" }, template: { name: "Nadar", artifacts: [{ data: { body: "touca" } }] } });

    expect(kit.database.artifacts).toHaveLength(1);
    expect(kit.batchWriter.commits).toEqual([]);
  });
});

describe("from when the revision is valid", () => {
  test("from today on, in the time zone of the rule", async () => {
    const { revise } = setup();

    const noon = await revise(existing(), { rule: {} });
    // 16/09 01:30 UTC ainda e dia 15 em Sao Paulo.
    const lateNight = await revise(existing(), { rule: {} }, new Date("2026-09-16T01:30:00.000Z"));
    const inUtc = await revise(existing(), { rule: { timeZone: "UTC" } }, new Date("2026-09-16T01:30:00.000Z"));

    expect(noon.fromDay).toBe("2026-09-15");
    expect(lateNight.fromDay).toBe("2026-09-15");
    expect(inUtc.fromDay).toBe("2026-09-16");
  });

  test("a series that was already generated keeps the past: the watermark goes back to yesterday", async () => {
    const { revise } = setup();

    const { recurrence } = await revise(existing({ materializedThrough: "2026-11-14" }), { rule: { timeOfDay: "08:00" } });

    expect(recurrence.materializedThrough).toBe("2026-09-14");
    expect(recurrence.revision).toBe(4);
  });

  test("a series that was never generated stays without a watermark", async () => {
    const { revise } = setup();

    expect((await revise(existing(), { rule: {} })).recurrence.materializedThrough).toBeUndefined();
  });

  test("a series that only starts today or later has no past to keep", async () => {
    const { revise } = setup();

    const startsToday = await revise(existing({ materializedThrough: "2026-11-14", startsOn: "2026-09-15" }), { rule: {} });
    const startsLater = await revise(existing({ materializedThrough: "2026-11-14", startsOn: "2026-10-01" }), { rule: {} });

    expect(startsToday.recurrence.materializedThrough).toBeUndefined();
    expect(startsLater.recurrence.materializedThrough).toBeUndefined();
  });

  test("a series that started yesterday keeps exactly that day", async () => {
    const { revise } = setup();

    const { recurrence } = await revise(existing({ materializedThrough: "2026-11-14", startsOn: "2026-09-14" }), { rule: {} });

    expect(recurrence.materializedThrough).toBe("2026-09-14");
  });
});

describe("template", () => {
  test("replaces the whole template, and the artifacts of the series with it", async () => {
    const { revise } = setup();

    const { recurrence, artifacts } = await revise(existing(), { rule: {}, template: { name: "Nadar", status: "todo" } });

    expect(recurrence.template).toEqual({
      kind: "common",
      status: "todo",
      name: "Nadar",
      description: "",
      tags: [],
      priority: "medium",
      notifyOffsetsMinutes: [],
      artifactIds: [],
    });
    expect(artifacts).toEqual([]);
  });

  test("the new artifacts of the template come back to be written before the series", async () => {
    const { revise } = setup();

    const { recurrence, artifacts } = await revise(existing(), {
      rule: {},
      template: { name: "Nadar", artifacts: [{ data: { body: "levar touca" } }], artifactIds: ["series-note"] },
    });

    expect(artifacts).toHaveLength(1);
    expect(recurrence.template.artifactIds).toEqual([artifacts[0]?.id, "series-note"]);
  });

  test("the project of the series follows the template like any other field: replaced with it, kept when the template stays", async () => {
    const { revise } = setup();
    const inProject = Recurrence.rehydrate({
      id: "rec-1", userId: actor.userId, rule, template: { ...template, projectId: "project-1" }, revision: 3,
      createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const swapped = await revise(inProject, { rule: {}, template: { name: "Correr", projectId: "project-2" } });
    const dropped = await revise(inProject, { rule: {}, template: { name: "Correr" } });
    const untouched = await revise(inProject, { rule: { timeOfDay: "09:00" } });

    expect(swapped.recurrence.template).toMatchObject({ projectId: "project-2" });
    expect(dropped.recurrence.template).not.toHaveProperty("projectId");
    expect(untouched.recurrence.template).toMatchObject({ projectId: "project-1" });
  });

  test("`keepArtifacts` keeps the artifacts of the series when the new template brings none", async () => {
    const { revise } = setup();

    const { recurrence, artifacts } = await revise(existing(), { rule: {}, template: { name: "Nadar" }, keepArtifacts: true });

    expect(recurrence.template).toMatchObject({ name: "Nadar", tags: [], artifactIds: ["series-note"] });
    expect(artifacts).toEqual([]);
  });

  test("`keepArtifacts` does not hold back a template that brings its own artifacts", async () => {
    const { revise } = setup();

    const { recurrence, artifacts } = await revise(existing(), {
      rule: {},
      template: { name: "Nadar", artifacts: [{ data: { body: "levar touca" } }] },
      keepArtifacts: true,
    });

    expect(recurrence.template.artifactIds).toEqual([artifacts[0]?.id]);
  });

  test("`keepArtifacts` without a new template changes nothing in it", async () => {
    const { revise } = setup();

    const { recurrence } = await revise(existing(), { rule: { timeOfDay: "09:00" }, keepArtifacts: true });

    expect(recurrence.template).toEqual(template);
  });

  test("the new template is resolved with the revised rule", async () => {
    const { revise } = setup();

    const { recurrence, artifacts } = await revise(existing(), { rule: { timeOfDay: "20:00" }, template: { kind: "meal" } });

    expect(recurrence.template).toMatchObject({ kind: "meal", name: "Jantar" });
    expect(artifacts[0]?.data).toMatchObject({ generation: { status: "pending" } });
  });

  test("`derivedArtifacts: false` creates no food for a meal template", async () => {
    const { revise } = setup();

    const { recurrence, artifacts } = await revise(existing(), { rule: {}, template: { kind: "meal" } }, now, {
      derivedArtifacts: false,
    });

    expect(recurrence.template.artifactIds).toEqual([]);
    expect(artifacts).toEqual([]);
  });

  test("the previous tasks of the new template must exist, and are stored without being edited", async () => {
    const project = Task.create({ id: "project", userId: actor.userId, name: "Projeto", longRunning: true });
    const kit = setup({ tasks: [project] });

    const { recurrence } = await kit.revise(existing(), { rule: {}, template: { name: "Sessão", parentTaskId: "project" } });

    expect(recurrence.template.parentTaskId).toBe("project");
    expect(kit.database.tasks[0]?.revision).toBe(1);
    await expect(
      kit.revise(existing(), { rule: {}, template: { name: "Sessão", parentTaskId: "missing" } }),
    ).rejects.toThrow(TaskNotFoundError);
  });

  test("refuses a template that does not generate a valid task, or a rule that never happens with it", async () => {
    const { revise } = setup();

    await expect(revise(existing(), { rule: {}, template: {} })).rejects.toThrow("Task requires a name");
    await expect(
      revise(existing(), { rule: { frequency: "monthly", byMonthDay: 31, startsOn: "2026-04-01", endsOn: "2026-04-30" }, template: { name: "x" } }),
    ).rejects.toThrow("The recurrence never happens");
  });
});
