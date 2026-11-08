import { BadRequestException } from "@nestjs/common";
import { expect, test } from "vitest";
import { Task, TaskOwnershipError } from "../../domain";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { CreateTaskUseCase } from "../create-task/create-task.usecase";
import { GetTaskUseCase } from "../get-task/get-task.usecase";
import { UpdateTaskUseCase } from "../update-task/update-task.usecase";
import { DeleteTaskUseCase } from "../delete-task/delete-task.usecase";
import { ListTasksUseCase } from "./list-tasks.usecase";
import { ListSubtasksUseCase } from "../list-subtasks/list-subtasks.usecase";
import { TasksController } from "./test-tasks-controller";

const actor: AuthenticatedUser = { userId: "user-1" };
const attacker: AuthenticatedUser = { userId: "attacker-1" };

function makeController(tasks: Task[] = []) {
  const taskRepository = new InMemoryTaskRepository(tasks);

  const controller = new TasksController(
    new ListTasksUseCase(taskRepository),
    new CreateTaskUseCase(taskRepository),
    new GetTaskUseCase(taskRepository),
    new UpdateTaskUseCase(taskRepository),
    new DeleteTaskUseCase(taskRepository),
    new ListSubtasksUseCase(taskRepository),
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

test("POST /api/tasks rejects a parentTaskId that is not a string", async () => {
  const { controller } = makeController();

  await expect(
    controller.create({ name: "Comprar tinta", parentTaskId: 7 } as never, actor),
  ).rejects.toBeInstanceOf(BadRequestException);
});

test("GET /api/tasks/:taskId/subtasks returns only the direct children", async () => {
  const parent = Task.create({ userId: "user-1", name: "Reforma", description: "", tags: [] });
  const child = Task.create({
    userId: "user-1",
    parentTaskId: parent.id,
    name: "Comprar tinta",
    description: "",
    tags: [],
  });
  const { controller } = makeController([parent, child]);

  const subtasks = await controller.subtasks(parent.id, actor);

  expect(subtasks.map((subtask) => subtask.id)).toEqual([child.id]);
});

test("GET /api/tasks/:taskId/subtasks refuses another user's task", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const { controller } = makeController([task]);

  await expect(controller.subtasks(task.id, attacker)).rejects.toBeInstanceOf(TaskOwnershipError);
});

test("DELETE /api/tasks/:taskId removes the task", async () => {
  const task = Task.create({ userId: "user-1", name: "Comprar tinta", description: "", tags: [] });
  const { controller, taskRepository } = makeController([task]);

  await controller.remove(task.id, actor);

  expect(await taskRepository.findById(task.id)).toBeNull();
});

test("GET /api/tasks filters by status, priority, tag, name and planned window", async () => {
  const make = (name: string, extra: Partial<Parameters<typeof Task.create>[0]> = {}) =>
    Task.create({ userId: "user-1", name, description: "", tags: [], ...extra });
  const tasks = [
    make("Pagar conta de luz", { priority: "urgent", tags: ["casa"], startedAt: new Date("2026-11-10T12:00:00.000Z") }),
    make("Revisar proposta", { priority: "low", tags: ["trabalho"], estimatedFinishAt: new Date("2026-11-20T12:00:00.000Z") }),
    make("Ideia solta"),
  ];
  const { controller } = makeController(tasks);
  const useCase = new ListTasksUseCase(new InMemoryTaskRepository(tasks));
  const names = async (filter: Parameters<ListTasksUseCase["execute"]>[0]) =>
    (await useCase.execute(filter, actor)).map((task) => task.name).sort();

  expect(await controller.list(actor)).toHaveLength(3);
  expect(await names({ priority: ["urgent"] })).toEqual(["Pagar conta de luz"]);
  expect(await names({ priority: ["urgent", "low"] })).toHaveLength(2);
  expect(await names({ tag: "Trabalho" })).toEqual(["Revisar proposta"]);
  expect(await names({ q: "conta" })).toEqual(["Pagar conta de luz"]);
  expect(await names({ status: ["done"] })).toEqual([]);
  // Sem data planejada a tarefa fica fora de qualquer janela; a data de fim estimada vale quando nao ha inicio.
  expect(await names({ from: new Date("2026-11-15T00:00:00.000Z") })).toEqual(["Revisar proposta"]);
  expect(await names({ to: new Date("2026-11-15T00:00:00.000Z") })).toEqual(["Pagar conta de luz"]);
  expect(await names({ limit: 2 })).toHaveLength(2);
});
