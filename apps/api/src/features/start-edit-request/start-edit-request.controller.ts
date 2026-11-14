import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { StartRequestResponse } from "@repo/contracts";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentTextSchema } from "../../api-core/agent/agent-input.schemas";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const startEditRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  entityType: z.enum([
    "event", "artifact", "food_artifact", "sleep_artifact", "training_artifact", "skill_artifact", "agent_artifact",
  ]),
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

/**
 * `POST /api/requests/edit`: o pedido de edicao da entidade aberta na tela de detalhe (ADR 006). Responde com o
 * `requestId`, que se acompanha em `GET /api/requests/:requestId`, como qualquer pedido.
 */
@Controller("api/requests")
export class StartEditRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Post("edit")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<StartRequestResponse> {
    const parsed = startEditRequestBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return { requestId: await this.requests.startEdit(parsed.data, actor) };
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartEditRequestController] })
export class StartEditRequestModule {}
