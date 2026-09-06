import { describe, expect, test } from "vitest";
import { Task } from "./task.entity";

describe("Task aggregate", () => {
  test("creates an aggregate with revision 1 and default status/priority", () => {
    const task = Task.create({
      userId: "user-1",
      name: "Comprar tinta",
      description: "",
      tags: [" Casa ", "casa"],
    });

    expect(task.revision).toBe(1);
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium");
    expect(task.tags).toEqual(["casa"]);
    expect(task.planId).toBeUndefined();
    expect(task.dependsOnTaskIds).toEqual([]);
  });

  test("dedupes dependsOnTaskIds and revise replaces the whole list", () => {
    const task = Task.create({
      userId: "user-1",
      name: "Comprar tinta",
      description: "",
      tags: [],
      dependsOnTaskIds: ["task-1", "task-1", "task-2"],
    });

    expect(task.dependsOnTaskIds).toEqual(["task-1", "task-2"]);

    const revised = task.revise({ dependsOnTaskIds: ["task-3"] });
    expect(revised.dependsOnTaskIds).toEqual(["task-3"]);

    const unchanged = task.revise({ name: "Outro" });
    expect(unchanged.dependsOnTaskIds).toEqual(["task-1", "task-2"]);
  });

  test("rejects a task depending on itself", () => {
    expect(() =>
      Task.create({
        id: "task-self",
        userId: "user-1",
        name: "Comprar tinta",
        description: "",
        tags: [],
        dependsOnTaskIds: ["task-self"],
      }),
    ).toThrow("Task cannot depend on itself");
  });

  test("creates an aggregate linked to a plan", () => {
    const task = Task.create({
      userId: "user-1",
      planId: "plan-1",
      name: "Comprar tinta",
      description: "",
      tags: [],
    });

    expect(task.planId).toBe("plan-1");
  });

  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      Task.create({
        userId: "user-1",
        name: "Invalido",
        description: "",
        tags: [],
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        finishedAt: new Date("2026-08-31T11:00:00.000Z"),
      }),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("rejects a revision below 1 on rehydrate", () => {
    expect(() =>
      Task.rehydrate({
        userId: "user-1",
        name: "Invalido",
        description: "",
        tags: [],
        revision: 0,
      }),
    ).toThrow("Task revision must be an integer >= 1");
  });

  test("rehydrate keeps the persisted revision instead of incrementing it", () => {
    const task = Task.rehydrate({
      userId: "user-1",
      name: "Existente",
      description: "",
      tags: [],
      revision: 5,
    });

    expect(task.revision).toBe(5);
  });

  test("revise increments the revision and preserves unrelated fields", () => {
    const task = Task.create({
      userId: "user-1",
      planId: "plan-1",
      name: "Comprar tinta",
      description: "",
      tags: ["casa"],
    });

    const revised = task.revise({ status: "inProgress" });

    expect(revised.revision).toBe(2);
    expect(revised.status).toBe("inProgress");
    expect(revised.planId).toBe("plan-1");
    expect(revised.tags).toEqual(["casa"]);
    expect(task.revision).toBe(1);
  });

  test("revise can unlink the plan by passing planId: null", () => {
    const task = Task.create({
      userId: "user-1",
      planId: "plan-1",
      name: "Comprar tinta",
      description: "",
      tags: [],
    });

    const revised = task.revise({ planId: null });

    expect(revised.planId).toBeUndefined();
  });
});
