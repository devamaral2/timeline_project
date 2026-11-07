import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Inject, Module, NotFoundException, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AiJobDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentTextSchema } from "../../api-core/agent/agent-input.schemas";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { getServerEnv } from "../../config/env";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CONVERSATION_ID_FORMAT } from "../../http/websocket/agent-chat/chat-protocol";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";

const startHermesTurnBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  conversationId: z.string().regex(CONVERSATION_ID_FORMAT).optional(),
  /** Estavel por mensagem: reenviar o mesmo id devolve o job ja aceito, sem uma segunda mensagem ao Hermes. */
  clientMessageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

/**
 * `POST /api/ai/automation`: manda uma mensagem ao Hermes (ADR 004). Desligada por padrao
 * (`AI_AUTOMATION`): o 404 vem antes de ler o corpo, e e assim que o cliente descobre que a rota nao existe aqui.
 * O resultado (`{ text }`) se acompanha em `GET /api/ai/jobs/:id`.
 */
@Controller("api/ai/automation")
export class StartHermesTurnController {
  constructor(
    @Inject(QueuedAiOperations) private readonly operations: QueuedAiOperations,
    @Inject(AiJobsService) private readonly jobs: AiJobsService,
  ) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto> {
    if (getServerEnv().AI_AUTOMATION !== "on") throw new NotFoundException();
    const parsed = startHermesTurnBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    // O Hermes e do dono: so ele fala com o proprio, e nunca em nome de outro usuario.
    if (parsed.data.userId !== actor.userId) throw new ForbiddenException();
    const { clientMessageId, ...input } = parsed.data;
    const id = await this.operations.submitHermes(input, actor, clientMessageId);
    return toAiJobDto(await this.jobs.get(id, input.userId));
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartHermesTurnController] })
export class StartHermesTurnModule {}
