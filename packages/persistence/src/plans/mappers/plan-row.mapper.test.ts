import { expect, test } from "vitest";
import { mapPlanRow, type PlanRow } from "./plan-row.mapper";

const planRow: PlanRow = {
  id: "01PLAN0000000000000000000",
  revision: 3,
  userId: "user-1",
  name: "Reforma da casa",
  description: "",
  status: "inProgress",
  priority: "high",
  startedAt: new Date("2026-08-31T12:00:00.000Z"),
  estimatedFinishAt: null,
  finishedAt: null,
};

test("rehydrates a plan preserving revision and tags", () => {
  const plan = mapPlanRow(planRow, ["casa", "reforma"]);

  expect(plan.revision).toBe(3);
  expect(plan.status).toBe("inProgress");
  expect(plan.priority).toBe("high");
  expect(plan.tags).toEqual(["casa", "reforma"]);
  expect(plan.startedAt).toEqual(planRow.startedAt);
  expect(plan.finishedAt).toBeUndefined();
  expect(plan.dependsOnPlanIds).toEqual([]);
});

test("rehydrates dependsOnPlanIds when given", () => {
  const plan = mapPlanRow(planRow, [], ["plan-1", "plan-2"]);
  expect(plan.dependsOnPlanIds).toEqual(["plan-1", "plan-2"]);
});
