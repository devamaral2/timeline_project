import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import type { TaskDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GetTaskUseCase } from "./get-task.usecase";

@Controller("api/tasks")
export class GetTaskController {
  constructor(@Inject(GetTaskUseCase) private readonly getTask: GetTaskUseCase) {}

  @Get(":taskId")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Param("taskId") taskId: string, @CurrentUser() actor: AuthenticatedUser): Promise<TaskDto> {
    const task = await this.getTask.execute({ taskId: taskId }, actor);
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }
}
