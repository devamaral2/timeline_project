import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AiJobDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentScreenContextSchema, agentTextSchema } from "../../api-core/agent/agent-input.schemas";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CONVERSATION_ID_FORMAT } from "../../http/websocket/agent-chat/chat-protocol";

const submitBody = z.object({
  userId: z.string().min(1).max(128), text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
  conversationId: z.string().regex(CONVERSATION_ID_FORMAT).optional(),
  clientMessageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

@Controller("api/ai/jobs")
@UseGuards(GatewayIdentityGuard)
export class SubmitAiJobController {
  constructor(
    @Inject(QueuedAiOperations) private readonly operations: QueuedAiOperations,
    @Inject(AiJobsService) private readonly jobs: AiJobsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto> {
    const parsed = submitBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    const { clientMessageId, ...input } = parsed.data;
    const id = await this.operations.submitChat(input, actor, clientMessageId);
    return toAiJobDto(await this.jobs.get(id, input.userId));
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [SubmitAiJobController] })
export class SubmitAiJobModule {}
