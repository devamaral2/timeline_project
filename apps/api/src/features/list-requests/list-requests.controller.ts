import { Controller, Get, Inject, Module, Query, UseGuards } from "@nestjs/common";
import type { RequestDto } from "@repo/contracts";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { MAX_REQUEST_LIST_LIMIT } from "../../api-core/requests/request-operations";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const limitQuery = z.coerce.number().int().min(1).max(MAX_REQUEST_LIST_LIMIT).optional();

/** `GET /api/requests`: os pedidos do usuario, do mais novo para o mais antigo. Passos nao entram, e o rastro fica no detalhe. */
@Controller("api/requests")
@UseGuards(GatewayIdentityGuard)
export class ListRequestsController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Get()
  async list(@Query("limit") limit: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<RequestDto[]> {
    const parsed = limitQuery.safeParse(limit);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.requests.list(actor, parsed.data);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [ListRequestsController] })
export class ListRequestsModule {}
