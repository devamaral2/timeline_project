import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AgentChatTicketDto } from "@repo/contracts";
import { AGENT_CHAT_TICKET_STORE } from "../../infrastructure/persistence";
import type { AgentChatTicketStore } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { IssueAgentChatTicketUseCase } from "./issue-agent-chat-ticket.usecase";

const issueTicketBody = z.object({ userId: z.string().min(1).max(128) });

@Controller("api/ai/chat")
export class IssueAgentChatTicketController {
  constructor(@Inject(IssueAgentChatTicketUseCase) private readonly issueTicket: IssueAgentChatTicketUseCase) {}

  @Post("tickets")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  async execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AgentChatTicketDto> {
    const parsed = issueTicketBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.issueTicket.execute(parsed.data, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [IssueAgentChatTicketController],
  providers: [{
    provide: IssueAgentChatTicketUseCase,
    inject: [AGENT_CHAT_TICKET_STORE],
    useFactory: (tickets: AgentChatTicketStore) => new IssueAgentChatTicketUseCase(tickets),
  }],
  exports: [IssueAgentChatTicketUseCase],
})
export class IssueAgentChatTicketModule {}
