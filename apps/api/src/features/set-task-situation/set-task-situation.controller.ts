import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Put, UseGuards } from "@nestjs/common";
import type { SetTaskSituationInput, TaskCardDto } from "@repo/contracts";
import { assertSituationBody } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { SetTaskSituationUseCase } from "./set-task-situation.usecase";

/** `PUT /api/tasks/:taskId/situation`: o usuario revisa, guarda ou devolve para revisar o pedido que terminou. */
@Controller("api/tasks")
export class SetTaskSituationController {
  constructor(@Inject(SetTaskSituationUseCase) private readonly setSituation: SetTaskSituationUseCase) {}

  @Put(":taskId/situation")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.OK)
  execute(
    @Param("taskId") taskId: string,
    @Body() body: SetTaskSituationInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TaskCardDto> {
    assertSituationBody(body as unknown as Record<string, unknown>);
    return this.setSituation.execute({ taskId, situation: body.situation }, actor);
  }
}
