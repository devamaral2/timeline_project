import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import type { CreateTaskInput } from "@repo/contracts";
import { CreateTaskUseCase } from "../../api-core/tasks/create-task.usecase";
import { assertTaskFields } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/tasks")
export class CreateTaskController {
  constructor(@Inject(CreateTaskUseCase) private readonly createTask: CreateTaskUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateTaskInput, @CurrentUser() actor: AuthenticatedUser): Promise<{ taskId: string }> {
    assertTaskFields(body as unknown as Record<string, unknown>, false);
    return this.createTask.execute(body, actor);
  }
}
