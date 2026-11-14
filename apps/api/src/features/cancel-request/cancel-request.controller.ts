import { Controller, HttpCode, HttpStatus, Inject, Module, Param, Post, UseGuards } from "@nestjs/common";
import type { RequestDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

/** `POST /api/requests/:requestId/cancel`: para o que o agente ainda nao terminou. O que ja foi gravado fica. */
@Controller("api/requests")
@UseGuards(GatewayIdentityGuard)
export class CancelRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Post(":requestId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@Param("requestId") requestId: string, @CurrentUser() actor: AuthenticatedUser): Promise<RequestDto> {
    return this.requests.cancel(requestId, actor);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [CancelRequestController] })
export class CancelRequestModule {}
