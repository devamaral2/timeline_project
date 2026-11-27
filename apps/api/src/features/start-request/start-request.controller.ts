import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { StartRequestResponse } from "@repo/contracts";
import { modelSelectionSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentScreenContextSchema, agentTextSchema, clientMessageIdSchema, projectIdSchema, requestIdSchema } from "../../api-core/agent/agent-input.schemas";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { selectionProblem } from "../../api-core/requests/model-catalog";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

export const startRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
  sessionId: requestIdSchema.optional(),
  clientMessageId: clientMessageIdSchema.optional(),
  /** O provedor, o modelo e o esforco que o campo do chat mostra: os agentes do pedido rodam com ele. */
  model: modelSelectionSchema.optional(),
  /** O projeto do pedido; vale sobre a sessao. Sem ele, o pedido fica no projeto do primeiro da sessao ou em `personal`. */
  projectId: projectIdSchema.optional(),
});

/**
 * `POST /api/requests`: um pedido ao agente, que se desdobra em passos (ADR 003). Acompanha-se em
 * `GET /api/requests/:requestId`. Com `model`, o provedor precisa estar ligado e o modelo na lista dele.
 */
@Controller("api/requests")
export class StartRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<StartRequestResponse> {
    const parsed = startRequestBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    const problem = parsed.data.model && await selectionProblem(parsed.data.model);
    if (problem) throw new InvalidInputError(problem);
    return { requestId: await this.requests.start(parsed.data, actor) };
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartRequestController] })
export class StartRequestModule {}
