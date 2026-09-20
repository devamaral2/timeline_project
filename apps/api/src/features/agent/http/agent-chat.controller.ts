import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AgentChatTicketDto } from "@repo/contracts";
import { AuthServiceGuard } from "../../authorize-user/auth-service.guard";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { CurrentUser } from "../../authenticate-user/current-user.decorator";
import { AccessResource } from "../../authorize-user/access-resource.decorator";
import { InvalidInputError } from "../errors/agent.errors";
import { IssueAgentChatTicketUseCase } from "../usecases/issue-agent-chat-ticket.usecase";

const issueTicketBody = z.object({
  userId: z.string().min(1).max(128),
});

/**
 * O chat em si e o WebSocket de `/api/ai/chat` (`AgentChatServer`); por HTTP
 * so passa a emissao do ticket que autentica o upgrade.
 */
@Controller("api/ai/chat")
@AccessResource("agent")
export class AgentChatController {
  // `@Inject` explicito, como no apps/auth: o teste e2e roda sob esbuild, que
  // nao emite o metadata de tipo que a injecao implicita le.
  constructor(@Inject(IssueAgentChatTicketUseCase) private readonly issueTicket: IssueAgentChatTicketUseCase) {}

  @Post("tickets")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTicket(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AgentChatTicketDto> {
    const parsed = issueTicketBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.issueTicket.execute(parsed.data, actor);
  }
}
