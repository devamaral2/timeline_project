import { describe, expect, test } from "vitest";
import { Artifact, Task, Recurrence } from "../../domain";
import { toArtifactDto, toArtifactTaskLinkDto } from "./artifact.dto";
import { toTaskCardDto, toTaskDto } from "./task.dto";

const userId = "auth-user-1";
const startedAt = new Date("2026-08-17T15:00:00.000Z");
const rule = { frequency: "daily" as const, interval: 1, timeOfDay: "12:00", timeZone: "America/Sao_Paulo", startsOn: "2026-08-01" };
const series = Recurrence.create({ id: "rec-1", userId, rule, template: { name: "Almoço" } });
const project = { id: "project-1", name: "diario", personal: true };
const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };

function artifact(id: string, body = id): Artifact {
  return Artifact.rehydrate({
    id,
    userId,
    name: `Nota ${id}`,
    type: "text",
    schemaVersion: 1,
    data: { body },
    tags: ["casa"],
    revision: 2,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
  });
}

describe("toTaskCardDto", () => {
  test("carries the project of the task as an id, a name and the personal flag", () => {
    const task = Task.create({ userId, name: "Ler", startedAt });
    const named = { id: "project-2", name: "timeline_project", personal: false, extra: "ignored" };

    expect(toTaskCardDto({ task, project: named, artifactTypes: [] }).project).toEqual({
      id: "project-2",
      name: "timeline_project",
      personal: false,
    });
    expect(toTaskDto(task, project).project).toEqual(project);
  });

  test("maps a reference task as it is stored, without a status", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const task = Task.create({
      id: "task-1", userId, name: "Reunião", description: "Semanal", location: "Sala 3, Av. Paulista, São Paulo", startedAt,
      tags: ["trabalho"], now,
    });

    const card = toTaskCardDto({ task, project, artifactTypes: ["text", "food"] });

    expect(card).toEqual({
      id: "task-1",
      actor: "human",
      kind: "common",
      priority: "medium",
      name: "Reunião",
      description: "Semanal",
      project,
      location: "Sala 3, Av. Paulista, São Paulo",
      startedAt: "2026-08-17T15:00:00.000Z",
      estimatedFinishAt: "2026-08-17T16:00:00.000Z",
      finishedAt: undefined,
      longRunning: false,
      notifyOffsetsMinutes: [5],
      tags: ["trabalho"],
      artifactTypes: ["text", "food"],
      revision: 1,
      createdAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    });
    expect(card).not.toHaveProperty("parentTaskId");
    expect(card).not.toHaveProperty("status");
    expect(card).not.toHaveProperty("recurrence");
    expect(card).not.toHaveProperty("missed");
  });

  describe("the model choice of an agent request", () => {
    const choice = { provider: "openrouter", model: "google/gemini-4-neon", effort: "medium" };
    const agentOf = (status: "queued" | "completed", data: Record<string, unknown>, actor: "agent" | "human" = "agent") =>
      Task.rehydrate({
        id: "req-1", userId, actor, kind: actor === "agent" ? "request" : "common", status: actor === "agent" ? status : "todo",
        priority: "medium", name: "Pedido", data, revision: 1,
        createdAt: new Date("2026-08-01T10:00:00.000Z"), updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      });

    test("carries the choice the request took", () => {
      const card = toTaskCardDto({ task: agentOf("completed", { route: "model", model: choice }), project, artifactTypes: [] });

      expect(card.model).toEqual(choice);
    });

    test("leaves it out when the request took none", () => {
      const card = toTaskCardDto({ task: agentOf("queued", { route: "steps" }), project, artifactTypes: [] });

      expect(card).not.toHaveProperty("model");
    });

    test("leaves it out on the Hermes route, which answers with its own model", () => {
      const card = toTaskCardDto({ task: agentOf("completed", { route: "hermes", model: choice }), project, artifactTypes: [] });

      expect(card).not.toHaveProperty("model");
    });

    test("leaves it out when the stored choice is not a whole one", () => {
      const card = toTaskCardDto({ task: agentOf("completed", { route: "model", model: { provider: "anthropic" } }), project, artifactTypes: [] });

      expect(card).not.toHaveProperty("model");
    });

    test("never shows a choice on a person's task", () => {
      const card = toTaskCardDto({ task: agentOf("queued", { model: choice }, "human"), project, artifactTypes: [] });

      expect(card).not.toHaveProperty("model");
    });
  });

  test("maps a tracked task without dates, with its status and its main task", () => {
    const task = Task.rehydrate({
      id: "task-1",
      userId,
      actor: "human",
      kind: "common",
      status: "inHold",
      priority: "urgent",
      name: "Projeto",
      longRunning: true,
      finishedAt: startedAt,
      parentId: "p1",
      revision: 4,
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    });

    const card = toTaskCardDto({ task, project, artifactTypes: [] });

    expect(card).toMatchObject({
      status: "inHold",
      priority: "urgent",
      longRunning: true,
      finishedAt: "2026-08-17T15:00:00.000Z",
      parentTaskId: "p1",
      notifyOffsetsMinutes: [],
      revision: 4,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
    });
    expect(card).not.toHaveProperty("location");
    expect(card.startedAt).toBeUndefined();
    expect(card.estimatedFinishAt).toBeUndefined();
  });

  test("maps a agent task with the agent kind and status", () => {
    const task = Task.create({ userId, actor: "agent", kind: "search_request", status: "waiting", name: "Pesquisar voos" });

    expect(toTaskCardDto({ task, project, artifactTypes: [] })).toMatchObject({
      actor: "agent",
      kind: "search_request",
      status: "waiting",
    });
  });

  test("shows the series of an occurrence, with its rule and whether it was detached", () => {
    const task = Task.create({ userId, name: "Almoço", startedAt, occurrence: { ...occurrence, detached: true } });

    const card = toTaskCardDto({ task, project, artifactTypes: [], recurrence: series });

    expect(card.recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-17", detached: true, rule });
  });

  test("leaves the series out when the task is not an occurrence or the series was not loaded", () => {
    const plain = Task.create({ userId, name: "Almoço", startedAt });
    const orphan = Task.create({ userId, name: "Almoço", startedAt, occurrence });

    expect(toTaskCardDto({ task: plain, project, artifactTypes: [], recurrence: series })).not.toHaveProperty("recurrence");
    expect(toTaskCardDto({ task: orphan, project, artifactTypes: [] })).not.toHaveProperty("recurrence");
  });

  test("the lists of the dto are copies of the lists of the task", () => {
    const task = Task.rehydrate({
      id: "task-1", userId, actor: "human", kind: "common", name: "x", startedAt, subtaskIds: ["s1"], notifyOffsetsMinutes: [5], revision: 1,
      createdAt: startedAt, updatedAt: startedAt,
    });

    const dto = toTaskDto(task, project);
    dto.subtaskIds.push("s2");
    dto.notifyOffsetsMinutes.push(10);

    expect(task.subtaskIds).toEqual(["s1"]);
    expect(task.notifyOffsetsMinutes).toEqual([5]);
  });
});

describe("toTaskDto", () => {
  const linked = Task.rehydrate({
    id: "task-1",
    userId,
    actor: "human",
    kind: "common",
    name: "Reunião",
    startedAt,
    artifactLinks: [
      { artifactId: "b", relation: "uses", fromRecurrence: true },
      { artifactId: "gone", relation: "creates", fromRecurrence: false },
      { artifactId: "a", relation: "creates", fromRecurrence: false },
    ],
    parentId: "p1",
    subtaskIds: ["s1", "s2"],
    revision: 1,
    createdAt: startedAt,
    updatedAt: startedAt,
  });

  test("returns the artifacts in the order of the links, whatever the order they were loaded in", () => {
    const dto = toTaskDto(linked, project, [artifact("a"), artifact("b")]);

    expect(dto.artifacts.map((entry) => [entry.artifact.id, entry.relation, entry.fromRecurrence])).toEqual([
      ["b", "uses", true],
      ["a", "creates", false],
    ]);
    expect(dto.artifactTypes).toEqual(["text", "text"]);
  });

  test("an artifact that was deleted simply does not appear", () => {
    const dto = toTaskDto(linked, project, [artifact("a")]);

    expect(dto.artifacts.map((entry) => entry.artifact.id)).toEqual(["a"]);
    expect(dto.artifactTypes).toEqual(["text"]);
  });

  test("the artifacts inside a task come without the list of tasks they appear in", () => {
    const [entry] = toTaskDto(linked, project, [artifact("a", "corpo")]).artifacts;

    expect(entry?.artifact).toEqual({
      id: "a",
      name: "Nota a",
      type: "text",
      schemaVersion: 1,
      data: { body: "corpo" },
      global: false,
      derived: false,
      tags: ["casa"],
      revision: 2,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
    });
  });

  test("adds the subtasks to the card fields", () => {
    const dto = toTaskDto(linked, project);

    expect(dto).toMatchObject({ id: "task-1", name: "Reunião", parentTaskId: "p1", subtaskIds: ["s1", "s2"], revision: 1 });
    expect(dto.artifacts).toEqual([]);
    expect(dto.artifactTypes).toEqual([]);
    expect(dto).not.toHaveProperty("recurrence");
  });

  test("includes the series when the task is an occurrence", () => {
    const task = Task.create({ userId, name: "Almoço", startedAt, occurrence });

    expect(toTaskDto(task, project, [], series).recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-17", detached: false, rule });
  });
});

describe("toArtifactDto", () => {
  test("lists the tasks the artifact appears in when they are given, even if none", () => {
    const withTasks = toArtifactDto(artifact("a"), [
      { taskId: "e1", relation: "creates", name: "Reunião", actor: "human", kind: "common", startedAt, estimatedFinishAt: startedAt },
      { taskId: "e2", relation: "uses", name: "Projeto", actor: "human", kind: "common" },
    ]);

    expect(withTasks.tasks).toEqual([
      {
        taskId: "e1",
        relation: "creates",
        name: "Reunião",
        actor: "human",
        kind: "common",
        startedAt: "2026-08-17T15:00:00.000Z",
        estimatedFinishAt: "2026-08-17T15:00:00.000Z",
      },
      { taskId: "e2", relation: "uses", name: "Projeto", actor: "human", kind: "common" },
    ]);
    expect(toArtifactDto(artifact("a"), []).tasks).toEqual([]);
    expect(toArtifactDto(artifact("a"))).not.toHaveProperty("tasks");
  });

  test("marks global artifacts and derived copies", () => {
    const totals = { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 };
    const global = Artifact.create({ type: "food", name: "Banana", data: { description: "banana", items: [], totals } });
    const copy = global.copyForTask(userId, "1 unidade");

    expect(toArtifactDto(global)).toMatchObject({ global: true, derived: false, type: "food" });
    expect(toArtifactDto(copy)).toMatchObject({ global: false, derived: true, data: { quantity: "1 unidade" } });
  });

  test("a link without dates has no date keys", () => {
    const link = toArtifactTaskLinkDto({ taskId: "e1", relation: "updates", name: "Pedido", actor: "agent", kind: "request" });

    expect(link).toEqual({ taskId: "e1", relation: "updates", name: "Pedido", actor: "agent", kind: "request" });
    expect(link).not.toHaveProperty("startedAt");
  });
});
