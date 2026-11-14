import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { StartRequestResponse } from "@repo/contracts";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentScreenContextSchema, agentTextSchema, clientMessageIdSchema, requestIdSchema } from "../../api-core/agent/agent-input.schemas";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const startRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
  sessionId: requestIdSchema.optional(),
  clientMessageId: clientMessageIdSchema.optional(),
});

/** `POST /api/requests`: um pedido ao agente, que se desdobra em passos (ADR 003). Acompanha-se em `GET /api/requests/:requestId`. */
@Controller("api/requests")
export class StartRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<StartRequestResponse> {
    const parsed = startRequestBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return { requestId: await this.requests.start(parsed.data, actor) };
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartRequestController] })
export class StartRequestModule {}
