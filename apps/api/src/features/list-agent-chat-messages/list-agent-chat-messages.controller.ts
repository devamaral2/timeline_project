import { Controller, Get, Inject, Module, Param, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AgentChatMessagePageDto } from "@repo/contracts";
import { AGENT_CONVERSATION_QUERY } from "../../infrastructure/persistence";
import type { AgentConversationQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { CONVERSATION_ID_FORMAT } from "../../http/websocket/agent-chat/chat-protocol";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { ListAgentChatMessagesUseCase } from "./list-agent-chat-messages.usecase";

const conversationIdParam = z.string().regex(CONVERSATION_ID_FORMAT);
const pageQuery = z.object({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
  return parsed.data;
}

@Controller("api/ai/conversations")
export class ListAgentChatMessagesController {
  constructor(@Inject(ListAgentChatMessagesUseCase) private readonly listMessages: ListAgentChatMessagesUseCase) {}

  @Get(":conversationId/messages")
  @UseGuards(GatewayIdentityGuard)
  execute(
    @Param("conversationId") conversationId: string,
    @Query() query: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgentChatMessagePageDto> {
    return this.listMessages.execute({ conversationId: parse(conversationIdParam, conversationId), ...parse(pageQuery, query) }, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListAgentChatMessagesController],
  providers: [{
    provide: ListAgentChatMessagesUseCase,
    inject: [AGENT_CONVERSATION_QUERY],
    useFactory: (conversations: AgentConversationQuery) => new ListAgentChatMessagesUseCase(conversations),
  }],
})
export class ListAgentChatMessagesModule {}
