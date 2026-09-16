import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { CreateTaskInput, TaskDetailDto, TaskSummaryDto, UpdateTaskInput } from "@repo/entities/contracts";
import { isWorkItemPriority, isWorkItemStatus } from "@repo/entities";
import { CurrentUser } from "../../auth/current-user.decorator";
import { AuthServiceGuard } from "../../auth/auth-service.guard";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { CreateTaskUseCase } from "../usecases/create-task.usecase";
import { GetTaskUseCase } from "../usecases/get-task.usecase";
import { UpdateTaskUseCase } from "../usecases/update-task.usecase";
import { DeleteTaskUseCase } from "../usecases/delete-task.usecase";
import { ListTasksUseCase } from "../usecases/list-tasks.usecase";
import { ListSubtasksUseCase } from "../usecases/list-subtasks.usecase";

@Controller("api/tasks")
export class TasksController {
  constructor(
    private readonly listTasks: ListTasksUseCase,
    private readonly createTask: CreateTaskUseCase,
    private readonly getTask: GetTaskUseCase,
    private readonly updateTask: UpdateTaskUseCase,
    private readonly deleteTask: DeleteTaskUseCase,
    private readonly listSubtasks: ListSubtasksUseCase,
  ) {}

  @Get()
  @UseGuards(AuthServiceGuard)
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    return this.listTasks.execute(undefined, actor);
  }

  @Post()
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateTaskInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ taskId: string }> {
    assertValidWorkItemFields(body);
    assertValidParentTaskId(body);
    return this.createTask.execute(body, actor);
  }

  @Get(":taskId")
  @UseGuards(AuthServiceGuard)
  async detail(
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TaskDetailDto> {
    const task = await this.getTask.execute({ taskId }, actor);
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }

  /** Filhas diretas, nao a arvore inteira: quem quiser os netos pede de novo. */
  @Get(":taskId/subtasks")
  @UseGuards(AuthServiceGuard)
  async subtasks(
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TaskSummaryDto[]> {
    return this.listSubtasks.execute({ taskId }, actor);
  }

  @Patch(":taskId")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertValidWorkItemFields(body);
    assertValidParentTaskId(body);
    assertValidExpectedRevision(body);
    await this.updateTask.execute({ ...body, taskId }, actor);
  }

  @Delete(":taskId")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteTask.execute({ taskId }, actor);
  }
}

function assertValidWorkItemFields(body: {
  status?: unknown;
  priority?: unknown;
  dependsOnTaskIds?: unknown;
}): void {
  if (body?.status !== undefined && !isWorkItemStatus(body.status)) {
    throw new BadRequestException("Invalid status");
  }
  if (body?.priority !== undefined && !isWorkItemPriority(body.priority)) {
    throw new BadRequestException("Invalid priority");
  }
  if (
    body?.dependsOnTaskIds !== undefined &&
    (!Array.isArray(body.dependsOnTaskIds) ||
      body.dependsOnTaskIds.some((id) => typeof id !== "string"))
  ) {
    throw new BadRequestException("Invalid dependsOnTaskIds");
  }
}

/** `null` e desligar a subtarefa do pai; string vazia nao e id de coisa nenhuma. */
function assertValidParentTaskId(body: { parentTaskId?: unknown }): void {
  if (body?.parentTaskId === undefined || body.parentTaskId === null) return;
  if (typeof body.parentTaskId !== "string" || body.parentTaskId.length === 0) {
    throw new BadRequestException("Invalid parentTaskId");
  }
}

function assertValidExpectedRevision(body: { expectedRevision?: unknown }): void {
  if (!Number.isInteger(body?.expectedRevision) || (body.expectedRevision as number) < 1) {
    throw new BadRequestException("Invalid expectedRevision");
  }
}
