import { NotFoundException } from "@nestjs/common";
import type { CreateTaskInput, UpdateTaskInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateTaskUseCase } from "../create-task/create-task.usecase";
import type { DeleteTaskUseCase } from "../delete-task/delete-task.usecase";
import type { GetTaskUseCase } from "../get-task/get-task.usecase";
import type { ListSubtasksUseCase } from "../list-subtasks/list-subtasks.usecase";
import type { ListTasksUseCase } from "./list-tasks.usecase";
import type { UpdateTaskUseCase } from "../update-task/update-task.usecase";
import { assertExpectedRevision, assertParentTaskId, assertTaskFields } from "../../api-core/http-input-validation";

export class TasksController {
  constructor(
    private readonly listTasks: ListTasksUseCase,
    private readonly createTask: CreateTaskUseCase,
    private readonly getTask: GetTaskUseCase,
    private readonly updateTask: UpdateTaskUseCase,
    private readonly deleteTask: DeleteTaskUseCase,
    private readonly listSubtasks: ListSubtasksUseCase,
  ) {}

  async create(body: CreateTaskInput, actor: AuthenticatedUser) {
    assertTaskFields(body);
    assertParentTaskId(body);
    return this.createTask.execute(body, actor);
  }
  async detail(taskId: string, actor: AuthenticatedUser) {
    const task = await this.getTask.execute({ taskId }, actor);
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }
  async update(taskId: string, body: UpdateTaskInput, actor: AuthenticatedUser) {
    assertTaskFields(body);
    assertParentTaskId(body);
    assertExpectedRevision(body);
    return this.updateTask.execute({ ...body, taskId }, actor);
  }
  subtasks(taskId: string, actor: AuthenticatedUser) { return this.listSubtasks.execute({ taskId }, actor); }
  remove(taskId: string, actor: AuthenticatedUser) { return this.deleteTask.execute({ taskId }, actor); }
  list(actor: AuthenticatedUser) { return this.listTasks.execute(undefined, actor); }
}
