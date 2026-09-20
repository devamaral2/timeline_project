import { Controller, Get, Inject, Module, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AgentConversationPageDto } from "@repo/contracts";
import { AGENT_CONVERSATION_QUERY } from "../../infrastructure/persistence";
import type { AgentConversationQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { ListAgentConversationsUseCase } from "./list-agent-conversations.usecase";

const pageQuery = z.object({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

function parsePage(value: unknown): { cursor?: string; limit?: number } {
  const parsed = pageQuery.safeParse(value);
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
  return parsed.data;
}

@Controller("api/ai/conversations")
export class ListAgentConversationsController {
  constructor(@Inject(ListAgentConversationsUseCase) private readonly listConversations: ListAgentConversationsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AgentConversationPageDto> {
    return this.listConversations.execute(parsePage(query), actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListAgentConversationsController],
  providers: [{
    provide: ListAgentConversationsUseCase,
    inject: [AGENT_CONVERSATION_QUERY],
    useFactory: (conversations: AgentConversationQuery) =>
      new ListAgentConversationsUseCase(conversations),
  }],
})
export class ListAgentConversationsModule {}
