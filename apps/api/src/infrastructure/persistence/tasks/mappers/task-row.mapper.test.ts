import { expect, test } from "vitest";
import { mapTaskRow, type TaskRow } from "./task-row.mapper";

const taskRow: TaskRow = {
  id: "01TASK0000000000000000000",
  revision: 2,
  userId: "user-1",
  parentTaskId: "01PARENTTASK00000000000000",
  name: "Comprar tinta",
  description: "",
  status: "todo",
  priority: "medium",
  notifyOffsetsMinutes: [],
  startedAt: null,
  estimatedFinishAt: null,
  finishedAt: null,
};

test("rehydrates a task preserving parentTaskId and tags", () => {
  const task = mapTaskRow(taskRow, ["casa"]);

  expect(task.revision).toBe(2);
  expect(task.parentTaskId).toBe("01PARENTTASK00000000000000");
  expect(task.tags).toEqual(["casa"]);
});

test("rehydrates a task without a parent", () => {
  const task = mapTaskRow({ ...taskRow, parentTaskId: null }, []);

  expect(task.parentTaskId).toBeUndefined();
});

test("rehydrates dependsOnTaskIds when given", () => {
  const task = mapTaskRow(taskRow, [], ["task-1", "task-2"]);
  expect(task.dependsOnTaskIds).toEqual(["task-1", "task-2"]);
});
