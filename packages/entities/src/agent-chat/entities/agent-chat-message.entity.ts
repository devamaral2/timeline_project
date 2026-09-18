import type { AgentChatEntityRef } from "../../agent/contracts/agent-chat.dto";
import { AgentChatMessageId } from "../value-objects/agent-chat-message-id";
import { AgentConversationValidationError } from "../errors/agent-conversation.errors";

export type AgentChatRole = "user" | "assistant";

/**
 * Teto do que se grava por mensagem. O pedido do usuario ja chega capado em
 * 4000 pelo schema de entrada; a resposta do modelo nao tem teto nenhum, e um
 * relatorio longo iria inteiro para o banco, para a janela do prompt e para a
 * pagina REST. Corta-se em vez de recusar: a persistencia nao pode falhar num
 * texto que o usuario ja leu na tela.
 */
export const MAX_MESSAGE_CHARS = 20_000;

function truncate(content: string): string {
  return content.length <= MAX_MESSAGE_CHARS
    ? content
    : `${content.slice(0, MAX_MESSAGE_CHARS - 1)}…`;
}

export interface AgentChatMessageCreateProps {
  id?: string;
  conversationId: string;
  role: AgentChatRole;
  content: string;
  entities?: readonly AgentChatEntityRef[];
}

export interface AgentChatMessageRehydrateProps extends AgentChatMessageCreateProps {
  seq: number;
  createdAt: Date;
}

interface AgentChatMessageBuildProps {
  id: string;
  conversationId: string;
  role: AgentChatRole;
  content: string;
  entities: readonly AgentChatEntityRef[];
  /** Nulo enquanto a mensagem ainda nao foi gravada: quem o atribui e a trava. */
  seq: number | undefined;
  createdAt: Date;
}

/**
 * Uma mensagem de uma conversa. Imutavel e sem revisao: mensagem nao se edita,
 * so nasce — por isso nao ha `revise` aqui.
 *
 * **`seq` nao e do dominio.** A ordem dentro da conversa e atribuida na
 * gravacao, sob a trava da linha da conversa, porque so ali se sabe qual e a
 * ultima. Uma mensagem recem-criada tem `seq` indefinido ate ser gravada.
 */
export class AgentChatMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: AgentChatRole;
  readonly content: string;
  readonly entities: readonly AgentChatEntityRef[];
  readonly seq: number | undefined;
  readonly createdAt: Date;

  private constructor(props: AgentChatMessageBuildProps) {
    this.id = props.id;
    this.conversationId = props.conversationId;
    this.role = props.role;
    this.content = props.content;
    this.entities = props.entities;
    this.seq = props.seq;
    this.createdAt = props.createdAt;
  }

  private static build(props: AgentChatMessageBuildProps): AgentChatMessage {
    if (!props.content || props.content.trim().length === 0) {
      throw new AgentConversationValidationError("Chat message content cannot be empty");
    }
    if (!props.conversationId) {
      throw new AgentConversationValidationError("Chat message needs a conversation");
    }
    if (props.seq !== undefined && (!Number.isInteger(props.seq) || props.seq < 1)) {
      throw new AgentConversationValidationError("Chat message seq must be an integer >= 1");
    }

    return new AgentChatMessage(props);
  }

  static create(props: AgentChatMessageCreateProps): AgentChatMessage {
    return AgentChatMessage.build({
      id: props.id ?? AgentChatMessageId.create(),
      conversationId: props.conversationId,
      role: props.role,
      content: truncate(props.content),
      entities: props.entities ?? [],
      seq: undefined,
      createdAt: new Date(),
    });
  }

  static rehydrate(props: AgentChatMessageRehydrateProps): AgentChatMessage {
    return AgentChatMessage.build({
      id: props.id ?? AgentChatMessageId.create(),
      conversationId: props.conversationId,
      role: props.role,
      content: props.content,
      entities: props.entities ?? [],
      seq: props.seq,
      createdAt: props.createdAt,
    });
  }
}
