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
import type { CreateTaskInput, TaskDetailDto, TaskSummaryDto, UpdateTaskInput } from "@repo/contracts";
import { isWorkItemPriority, isWorkItemStatus, isNotificationOffsetMinutes } from "../../../domain";
import { CurrentUser } from "../../request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
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
  @UseGuards(GatewayIdentityGuard)
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<TaskSummaryDto[]> {
    return this.listTasks.execute(undefined, actor);
  }

  @Post()
  @UseGuards(GatewayIdentityGuard)
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
  @UseGuards(GatewayIdentityGuard)
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
  @UseGuards(GatewayIdentityGuard)
  async subtasks(
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TaskSummaryDto[]> {
    return this.listSubtasks.execute({ taskId }, actor);
  }

  @Patch(":taskId")
  @UseGuards(GatewayIdentityGuard)
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
  @UseGuards(GatewayIdentityGuard)
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
  notifyOffsetsMinutes?: unknown;
  dependsOnTaskIds?: unknown;
}): void {
  if (body?.status !== undefined && !isWorkItemStatus(body.status)) {
    throw new BadRequestException("Invalid status");
  }
  if (body?.priority !== undefined && !isWorkItemPriority(body.priority)) {
    throw new BadRequestException("Invalid priority");
  }
  if (
    body?.notifyOffsetsMinutes !== undefined &&
    (!Array.isArray(body.notifyOffsetsMinutes) ||
      body.notifyOffsetsMinutes.some((offset) => !isNotificationOffsetMinutes(offset)))
  ) {
    throw new BadRequestException("Invalid notifyOffsetsMinutes");
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
