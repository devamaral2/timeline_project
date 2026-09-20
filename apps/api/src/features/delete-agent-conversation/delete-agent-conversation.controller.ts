import { Controller, Delete, HttpCode, HttpStatus, Inject, Module, Param, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AGENT_CONVERSATION_REPOSITORY } from "../../infrastructure/persistence";
import type { AgentConversationRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { CONVERSATION_ID_FORMAT } from "../../http/websocket/agent-chat/chat-protocol";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { DeleteAgentConversationUseCase } from "./delete-agent-conversation.usecase";

@Controller("api/ai/conversations")
export class DeleteAgentConversationController {
  constructor(@Inject(DeleteAgentConversationUseCase) private readonly deleteConversation: DeleteAgentConversationUseCase) {}

  @Delete(":conversationId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Param("conversationId") id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    const parsed = z.string().regex(CONVERSATION_ID_FORMAT).safeParse(id);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    await this.deleteConversation.execute({ conversationId: parsed.data }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [DeleteAgentConversationController],
  providers: [{
    provide: DeleteAgentConversationUseCase,
    inject: [AGENT_CONVERSATION_REPOSITORY],
    useFactory: (conversations: AgentConversationRepository) => new DeleteAgentConversationUseCase(conversations),
  }],
})
export class DeleteAgentConversationModule {}
