import { describe, expect, test } from "vitest";
import { Plan } from "./plan.entity";

describe("Plan aggregate", () => {
  test("creates an aggregate with revision 1 and default status/priority", () => {
    const plan = Plan.create({
      userId: "user-1",
      name: "Reforma da casa",
      description: "",
      tags: [" Casa ", "casa"],
    });

    expect(plan.revision).toBe(1);
    expect(plan.status).toBe("todo");
    expect(plan.priority).toBe("medium");
    expect(plan.tags).toEqual(["casa"]);
    expect(plan.dependsOnPlanIds).toEqual([]);
  });

  test("dedupes dependsOnPlanIds and revise replaces the whole list", () => {
    const plan = Plan.create({
      userId: "user-1",
      name: "Reforma",
      description: "",
      tags: [],
      dependsOnPlanIds: ["plan-1", "plan-1", "plan-2"],
    });

    expect(plan.dependsOnPlanIds).toEqual(["plan-1", "plan-2"]);

    const revised = plan.revise({ dependsOnPlanIds: ["plan-3"] });
    expect(revised.dependsOnPlanIds).toEqual(["plan-3"]);

    const unchanged = plan.revise({ name: "Outro" });
    expect(unchanged.dependsOnPlanIds).toEqual(["plan-1", "plan-2"]);
  });

  test("rejects a plan depending on itself", () => {
    expect(() =>
      Plan.create({
        id: "plan-self",
        userId: "user-1",
        name: "Reforma",
        description: "",
        tags: [],
        dependsOnPlanIds: ["plan-self"],
      }),
    ).toThrow("Plan cannot depend on itself");
  });

  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      Plan.create({
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
      Plan.rehydrate({
        userId: "user-1",
        name: "Invalido",
        description: "",
        tags: [],
        revision: 0,
      }),
    ).toThrow("Plan revision must be an integer >= 1");
  });

  test("rehydrate keeps the persisted revision instead of incrementing it", () => {
    const plan = Plan.rehydrate({
      userId: "user-1",
      name: "Existente",
      description: "",
      tags: [],
      revision: 5,
    });

    expect(plan.revision).toBe(5);
  });

  test("revise increments the revision and preserves unrelated fields", () => {
    const plan = Plan.create({
      userId: "user-1",
      name: "Reforma da casa",
      description: "",
      tags: ["casa"],
    });

    const revised = plan.revise({ status: "inProgress" });

    expect(revised.revision).toBe(2);
    expect(revised.status).toBe("inProgress");
    expect(revised.name).toBe("Reforma da casa");
    expect(revised.tags).toEqual(["casa"]);
    expect(plan.revision).toBe(1);
  });
});
