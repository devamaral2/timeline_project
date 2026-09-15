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
} from "@nestjs/common";
import { UseGuards } from "@nestjs/common";
import type {
  CreatePlanInput,
  PlanDetailDto,
  PlanSummaryDto,
  TaskSummaryDto,
  UpdatePlanInput,
} from "@repo/entities/contracts";
import { isWorkItemPriority, isWorkItemStatus } from "@repo/entities";
import { CurrentUser } from "../../auth/current-user.decorator";
import { AuthServiceGuard } from "../../auth/auth-service.guard";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { CreatePlanUseCase } from "../usecases/create-plan.usecase";
import { GetPlanUseCase } from "../usecases/get-plan.usecase";
import { UpdatePlanUseCase } from "../usecases/update-plan.usecase";
import { DeletePlanUseCase } from "../usecases/delete-plan.usecase";
import { ListPlansUseCase } from "../usecases/list-plans.usecase";
import { ListTasksByPlanUseCase } from "../../tasks/usecases/list-tasks-by-plan.usecase";

@Controller("api/plans")
export class PlansController {
  constructor(
    private readonly listPlans: ListPlansUseCase,
    private readonly createPlan: CreatePlanUseCase,
    private readonly getPlan: GetPlanUseCase,
    private readonly updatePlan: UpdatePlanUseCase,
    private readonly deletePlan: DeletePlanUseCase,
    private readonly listTasksByPlan: ListTasksByPlanUseCase,
  ) {}

  @Get()
  @UseGuards(AuthServiceGuard)
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<PlanSummaryDto[]> {
    return this.listPlans.execute(undefined, actor);
  }

  @Post()
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreatePlanInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ planId: string }> {
    assertValidWorkItemFields(body);
    return this.createPlan.execute(body, actor);
  }

  @Get(":planId/tasks")
  @UseGuards(AuthServiceGuard)
  async tasks(
    @Param("planId") planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TaskSummaryDto[]> {
    return this.listTasksByPlan.execute({ planId }, actor);
  }

  @Get(":planId")
  @UseGuards(AuthServiceGuard)
  async detail(
    @Param("planId") planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlanDetailDto> {
    const plan = await this.getPlan.execute({ planId }, actor);
    if (!plan) throw new NotFoundException("Plan not found");
    return plan;
  }

  @Patch(":planId")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("planId") planId: string,
    @Body() body: UpdatePlanInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    assertValidWorkItemFields(body);
    assertValidExpectedRevision(body);
    await this.updatePlan.execute({ ...body, planId }, actor);
  }

  @Delete(":planId")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("planId") planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deletePlan.execute({ planId }, actor);
  }
}

function assertValidWorkItemFields(body: {
  status?: unknown;
  priority?: unknown;
  dependsOnPlanIds?: unknown;
}): void {
  if (body?.status !== undefined && !isWorkItemStatus(body.status)) {
    throw new BadRequestException("Invalid status");
  }
  if (body?.priority !== undefined && !isWorkItemPriority(body.priority)) {
    throw new BadRequestException("Invalid priority");
  }
  if (
    body?.dependsOnPlanIds !== undefined &&
    (!Array.isArray(body.dependsOnPlanIds) ||
      body.dependsOnPlanIds.some((id) => typeof id !== "string"))
  ) {
    throw new BadRequestException("Invalid dependsOnPlanIds");
  }
}

function assertValidExpectedRevision(body: { expectedRevision?: unknown }): void {
  if (!Number.isInteger(body?.expectedRevision) || (body.expectedRevision as number) < 1) {
    throw new BadRequestException("Invalid expectedRevision");
  }
}
