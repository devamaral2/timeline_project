import { AgentConversation, AgentConversationNotFoundError } from "../../../domain";
import type { AgentConversationQuery } from "../../../domain/ports";
import type { AgentChatTurn, AgentScreenContext, RunAgentResponse } from "@repo/contracts";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { MAX_HISTORY_TURNS } from "../services/agent-chat-history";
import type { RunAgentUseCase } from "./run-agent.usecase";

export interface RunChatTurnRequest {
  userId: string;
  text: string;
  context?: AgentScreenContext;
  /** Ausente e conversa nova. */
  conversationId?: string;
}

export interface RunChatTurnOptions {
  signal?: AbortSignal;
  onProgress?(label: string): void;
}

export type RunChatTurnResponse = RunAgentResponse & {
  conversationId: string;
  assistantSeq: number;
};

/**
 * Um turno de conversa: resolve em que conversa ele entra, carrega dali o
 * historico que vai ao modelo e delega o resto ao `RunAgentUseCase`.
 *
 * O historico deixou de vir do cliente. Quem o le e este use case, do banco,
 * ja filtrado por dono — o frame so traz o id da conversa.
 *
 * A conversa nova nao e criada aqui: ela vai como parte do lote e nasce dentro
 * da transacao de commit. Um turno que falha nao deixa conversa vazia para
 * tras, e o retry cria outra, que e o comportamento certo.
 */
export class RunChatTurnUseCase {
  constructor(
    private readonly runAgent: Pick<RunAgentUseCase, "execute">,
    private readonly conversations: Pick<AgentConversationQuery, "loadHistoryWindow">,
  ) {}

  async execute(
    input: RunChatTurnRequest,
    actor: AuthenticatedUser,
    options: RunChatTurnOptions = {},
  ): Promise<RunChatTurnResponse> {
    // Antes de qualquer leitura: um ator que nao pode agir por este usuario nao
    // pode nem descobrir se a conversa existe.

    const { conversationId, create, history } = await this.resolveConversation(input);

    let assistantSeq = 0;
    const response = await this.runAgent.execute(
      { userId: input.userId, text: input.text, context: input.context },
      actor,
      {
        history,
        conversational: true,
        signal: options.signal,
        onProgress: options.onProgress,
        conversation: { conversationId, create },
        onConversationWritten: (seqs) => {
          assistantSeq = seqs.lastSeq;
        },
      },
    );

    return { ...response, conversationId, assistantSeq };
  }

  private async resolveConversation(input: RunChatTurnRequest): Promise<{
    conversationId: string;
    create?: AgentConversation;
    history: AgentChatTurn[];
  }> {
    if (!input.conversationId) {
      const create = AgentConversation.create({ userId: input.userId });
      return { conversationId: create.id, create, history: [] };
    }

    const history = await this.conversations.loadHistoryWindow({
      conversationId: input.conversationId,
      userId: input.userId,
      turns: MAX_HISTORY_TURNS,
    });
    // `null` e conversa inexistente, apagada ou de outro dono — e o unico
    // momento barato de descobrir isso: recusar aqui poupa uma chamada de
    // modelo inteira antes de o `FOR UPDATE` do commit recusar de qualquer jeito.
    if (history === null) {
      throw new AgentConversationNotFoundError(`Conversation not found: ${input.conversationId}`);
    }

    return { conversationId: input.conversationId, history };
  }
}
