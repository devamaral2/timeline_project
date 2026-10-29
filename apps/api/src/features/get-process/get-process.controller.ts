import { Controller, Get, Inject, Module, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ProcessOperations } from "../../api-core/process/process-operations";
import type { ProcessView } from "../../api-core/process/process-view";
import { getServerEnv } from "../../config/env";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

/** `GET /api/ai/process/:id`: a caixa de processo — passos, estado de cada um e o que foi vinculado. */
@Controller("api/ai/process")
@UseGuards(GatewayIdentityGuard)
export class GetProcessController {
  constructor(@Inject(ProcessOperations) private readonly processes: ProcessOperations) {}

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser): Promise<ProcessView> {
    if (getServerEnv().AI_PROCESS !== "on") throw new NotFoundException();
    return this.processes.view(id, actor);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [GetProcessController] })
export class GetProcessModule {}
