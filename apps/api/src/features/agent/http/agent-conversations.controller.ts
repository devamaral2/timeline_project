import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { AgentChatMessagePageDto, AgentConversationPageDto } from "@repo/contracts";
import { AuthServiceGuard } from "../../authorize-user/auth-service.guard";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { CurrentUser } from "../../authenticate-user/current-user.decorator";
import { AccessResource } from "../../authorize-user/access-resource.decorator";
import { CONVERSATION_ID_FORMAT } from "../chat/chat-protocol";
import { InvalidInputError } from "../errors/agent.errors";
import { DeleteAgentConversationUseCase } from "../usecases/delete-agent-conversation.usecase";
import { ListAgentChatMessagesUseCase } from "../usecases/list-agent-chat-messages.usecase";
import { ListAgentConversationsUseCase } from "../usecases/list-agent-conversations.usecase";
import { RenameAgentConversationUseCase } from "../usecases/rename-agent-conversation.usecase";

const conversationIdParam = z.string().regex(CONVERSATION_ID_FORMAT);

const pageQuery = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const renameBody = z.object({
  title: z.string().trim().min(1).max(120),
  revision: z.number().int().min(1),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
  return parsed.data;
}

/**
 * A leitura das conversas nao passa pelo WebSocket de proposito: o frame e
 * limitado a 64 KiB e a conexao morre a cada 15 min, entao paginar historico
 * por la seria brigar com as duas coisas. O socket ficou so com o comando.
 *
 * Nao ha rota que cria conversa vazia: a conversa nasce dentro da transacao do
 * primeiro turno que grava.
 */
@Controller("api/ai/conversations")
@AccessResource("agent")
export class AgentConversationsController {
  // `@Inject` explicito, como nos outros controllers do agente: o e2e roda sob
  // esbuild, que nao emite o metadata que a injecao implicita le.
  constructor(
    @Inject(ListAgentConversationsUseCase)
    private readonly listConversations: ListAgentConversationsUseCase,
    @Inject(ListAgentChatMessagesUseCase)
    private readonly listMessages: ListAgentChatMessagesUseCase,
    @Inject(RenameAgentConversationUseCase)
    private readonly rename: RenameAgentConversationUseCase,
    @Inject(DeleteAgentConversationUseCase)
    private readonly remove: DeleteAgentConversationUseCase,
  ) {}

  @Get()
  @UseGuards(AuthServiceGuard)
  async list(
    @Query() query: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgentConversationPageDto> {
    return this.listConversations.execute(parse(pageQuery, query), actor);
  }

  // Estatica antes da dinamica: `:conversationId` capturaria o segmento.
  @Get(":conversationId/messages")
  @UseGuards(AuthServiceGuard)
  async messages(
    @Param("conversationId") conversationId: string,
    @Query() query: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgentChatMessagePageDto> {
    return this.listMessages.execute(
      { conversationId: parse(conversationIdParam, conversationId), ...parse(pageQuery, query) },
      actor,
    );
  }

  @Patch(":conversationId")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async patch(
    @Param("conversationId") conversationId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.rename.execute(
      { conversationId: parse(conversationIdParam, conversationId), ...parse(renameBody, body) },
      actor,
    );
  }

  @Delete(":conversationId")
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param("conversationId") conversationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.remove.execute({ conversationId: parse(conversationIdParam, conversationId) }, actor);
  }
}
