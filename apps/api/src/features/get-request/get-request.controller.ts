import { Controller, Get, Inject, Module, Param, UseGuards } from "@nestjs/common";
import type { RequestDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

/** `GET /api/requests/:requestId`: o pedido com os passos, o estado de cada um, o que foi tocado e a resposta. */
@Controller("api/requests")
@UseGuards(GatewayIdentityGuard)
export class GetRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Get(":requestId")
  async get(@Param("requestId") requestId: string, @CurrentUser() actor: AuthenticatedUser): Promise<RequestDto> {
    return this.requests.view(requestId, actor);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [GetRequestController] })
export class GetRequestModule {}
