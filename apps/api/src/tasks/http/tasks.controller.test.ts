import { BadRequestException } from "@nestjs/common";
import { expect, test } from "vitest";
import { Task, TaskOwnershipError } from "@repo/entities";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { InMemoryPlanRepository } from "../../plans/testing/in-memory-plan.repository";
import { InMemoryTaskRepository } from "../testing/in-memory-task.repository";
import { CreateTaskUseCase } from "../usecases/create-task.usecase";
import { GetTaskUseCase } from "../usecases/get-task.usecase";
import { UpdateTaskUseCase } from "../usecases/update-task.usecase";
import { DeleteTaskUseCase } from "../usecases/delete-task.usecase";
import { ListTasksUseCase } from "../usecases/list-tasks.usecase";
import { TasksController } from "./tasks.controller";

const actor: AuthenticatedUser = { userId: "user-1" };
const attacker: AuthenticatedUser = { userId: "attacker-1" };

function makeController(tasks: Task[] = []) {
  const taskRepository = new InMemoryTaskRepository(tasks);
  const planRepository = new InMemoryPlanRepository();

  const controller = new TasksController(
    new ListTasksUseCase(taskRepository),
    new CreateTaskUseCase(taskRepository, planRepository),
    new GetTaskUseCase(taskRepository),
    new UpdateTaskUseCase(taskRepository, planRepository),
    new DeleteTaskUseCase(taskRepository),
  );

  return { controller, taskRepository };
}

test("POST /api/tasks rejects an invalid priority", async () => {
  const { controller } = makeController();

  await expect(
    controller.create({ name: "Comprar tinta", priority: "invalid" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("POST /api/tasks creates a task for the authenticated actor", async () => {
  const { controller, taskRepository } = makeController();

  const { taskId } = await controller.create({ name: "Comprar tinta" }, actor);

  expect((await taskRepository.findById(taskId))?.userId).toBe("user-1");
});

test("GET /api/tasks/:taskId answers 404 for a task that does not exist", async () => {
  const { controller } = makeController();

  await expect(controller.detail("missing", actor)).rejects.toThrow("Task not found");
});

test("GET /api/tasks/:taskId refuses to return another user's task", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const { controller } = makeController([task]);

  await expect(controller.detail(task.id, attacker)).rejects.toBeInstanceOf(TaskOwnershipError);
});

test("PATCH /api/tasks/:taskId rejects a request without expectedRevision", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const { controller } = makeController([task]);

  await expect(
    controller.update(task.id, { name: "Novo nome" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("POST /api/tasks rejects a non-array dependsOnTaskIds", async () => {
  const { controller } = makeController();

  await expect(
    controller.create({ name: "Comprar tinta", dependsOnTaskIds: "not-an-array" } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("PATCH /api/tasks/:taskId surfaces the domain rejection of self-dependency", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const { controller } = makeController([task]);

  await expect(
    controller.update(task.id, { expectedRevision: 1, dependsOnTaskIds: [task.id] } as never, actor),
  ).rejects.toThrow("Task cannot depend on itself");
});

test("DELETE /api/tasks/:taskId removes the task", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const { controller, taskRepository } = makeController([task]);

  await controller.remove(task.id, actor);

  expect(await taskRepository.findById(task.id)).toBeNull();
});
