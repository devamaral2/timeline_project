import { Body, Controller, HttpCode, HttpStatus, Inject, Module, NotFoundException, Post, UseGuards } from "@nestjs/common";
import type { RequestDto } from "@repo/contracts";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentTextSchema, clientMessageIdSchema, projectIdSchema, requestIdSchema } from "../../api-core/agent/agent-input.schemas";
import { getServerEnv } from "../../config/env";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

export const startHermesRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  /** O primeiro pedido da sessao: o Hermes continua o mesmo assunto e a mesma memoria. */
  sessionId: requestIdSchema.optional(),
  /** Estavel por mensagem: reenviar o mesmo id devolve o pedido ja aceito, sem uma segunda mensagem ao Hermes. */
  clientMessageId: clientMessageIdSchema,
  /** O projeto do pedido; vale sobre a sessao. Sem ele, o pedido fica no projeto do primeiro da sessao ou em `diario`. */
  projectId: projectIdSchema.optional(),
});

/**
 * `POST /api/requests/hermes`: manda uma mensagem ao Hermes (ADR 004). Desligada por padrao (`AI_AUTOMATION`): o
 * 404 vem antes de ler o corpo, e e assim que o cliente descobre que a rota nao existe aqui. A resposta se
 * acompanha em `GET /api/requests/:requestId`.
 */
@Controller("api/requests")
export class StartHermesRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Post("hermes")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<RequestDto> {
    if (getServerEnv().AI_AUTOMATION !== "on") throw new NotFoundException();
    const parsed = startHermesRequestBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.requests.startHermes(parsed.data, actor);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartHermesRequestController] })
export class StartHermesRequestModule {}
