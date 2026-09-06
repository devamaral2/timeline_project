import { expect, test } from "vitest";
import { mapTaskRow, type TaskRow } from "./task-row.mapper";

const taskRow: TaskRow = {
  id: "01TASK0000000000000000000",
  revision: 2,
  userId: "user-1",
  planId: "01PLAN0000000000000000000",
  name: "Comprar tinta",
  description: "",
  status: "todo",
  priority: "medium",
  startedAt: null,
  estimatedFinishAt: null,
  finishedAt: null,
};

test("rehydrates a task preserving planId and tags", () => {
  const task = mapTaskRow(taskRow, ["casa"]);

  expect(task.revision).toBe(2);
  expect(task.planId).toBe("01PLAN0000000000000000000");
  expect(task.tags).toEqual(["casa"]);
});

test("rehydrates a task without a plan", () => {
  const task = mapTaskRow({ ...taskRow, planId: null }, []);

  expect(task.planId).toBeUndefined();
});
