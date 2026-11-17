import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { StartRequestResponse } from "@repo/contracts";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { clientMessageIdSchema } from "../../api-core/agent/agent-input.schemas";
import { MAX_TRANSCRIPT_LENGTH } from "../../api-core/requests/voice-task-worker";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

export const startVoiceRequestBody = z.object({
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_LENGTH),
  clientMessageId: clientMessageIdSchema.optional(),
});

/**
 * `POST /api/requests/voice`: a fala vira um pedido, e o pedido gera a tarefa. A tarefa criada aparece em
 * `entities` de `GET /api/requests/:requestId`.
 */
@Controller("api/requests")
export class StartVoiceRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  @Post("voice")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<StartRequestResponse> {
    const parsed = startVoiceRequestBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return { requestId: await this.requests.startVoice(parsed.data, actor) };
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartVoiceRequestController] })
export class StartVoiceRequestModule {}
