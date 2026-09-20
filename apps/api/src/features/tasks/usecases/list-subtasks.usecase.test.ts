import { expect, test } from "vitest";
import { Task, TaskNotFoundError, TaskOwnershipError } from "../../../domain";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { ListSubtasksUseCase } from "./list-subtasks.usecase";

const actor: AuthenticatedUser = { userId: "user-1" };

test("lists only the direct subtasks of the given task", async () => {
  const parent = Task.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const child = Task.create({
    userId: "user-1",
    parentTaskId: parent.id,
    name: "A",
    description: "",
    tags: [],
  });
  const grandchild = Task.create({
    userId: "user-1",
    parentTaskId: child.id,
    name: "B",
    description: "",
    tags: [],
  });
  const useCase = new ListSubtasksUseCase(new InMemoryTaskRepository([parent, child, grandchild]));

  const subtasks = await useCase.execute({ taskId: parent.id }, actor);

  expect(subtasks).toHaveLength(1);
  expect(subtasks[0].id).toBe(child.id);
});

test("rejects listing the subtasks of a task that does not exist", async () => {
  const useCase = new ListSubtasksUseCase(new InMemoryTaskRepository());

  await expect(useCase.execute({ taskId: "missing" }, actor)).rejects.toBeInstanceOf(
    TaskNotFoundError,
  );
});

test("rejects listing the subtasks of a task owned by another user", async () => {
  const theirs = Task.create({ userId: "user-2", name: "Reforma", description: "", tags: [] });
  const useCase = new ListSubtasksUseCase(new InMemoryTaskRepository([theirs]));

  await expect(useCase.execute({ taskId: theirs.id }, actor)).rejects.toBeInstanceOf(
    TaskOwnershipError,
  );
});
