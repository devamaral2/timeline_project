import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Param, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AGENT_CONVERSATION_REPOSITORY } from "../../infrastructure/persistence";
import type { AgentConversationRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { CONVERSATION_ID_FORMAT } from "../../http/websocket/agent-chat/chat-protocol";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { RenameAgentConversationUseCase } from "./rename-agent-conversation.usecase";

const conversationId = z.string().regex(CONVERSATION_ID_FORMAT);
const renameBody = z.object({ title: z.string().trim().min(1).max(120), revision: z.number().int().min(1) });

@Controller("api/ai/conversations")
export class RenameAgentConversationController {
  constructor(@Inject(RenameAgentConversationUseCase) private readonly rename: RenameAgentConversationUseCase) {}

  @Patch(":conversationId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    const parsedId = conversationId.safeParse(id);
    const parsedBody = renameBody.safeParse(body);
    if (!parsedId.success) throw new InvalidInputError(z.prettifyError(parsedId.error));
    if (!parsedBody.success) throw new InvalidInputError(z.prettifyError(parsedBody.error));
    await this.rename.execute({ conversationId: parsedId.data, ...parsedBody.data }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [RenameAgentConversationController],
  providers: [{
    provide: RenameAgentConversationUseCase,
    inject: [AGENT_CONVERSATION_REPOSITORY],
    useFactory: (conversations: AgentConversationRepository) => new RenameAgentConversationUseCase(conversations),
  }],
})
export class RenameAgentConversationModule {}
