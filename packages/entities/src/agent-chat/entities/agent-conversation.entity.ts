import { AgentConversationId } from "../value-objects/agent-conversation-id";
import { AgentConversationValidationError } from "../errors/agent-conversation.errors";

export interface AgentConversationCreateProps {
  id?: string;
  userId: string;
  title?: string | null;
}

export interface AgentConversationRehydrateProps extends AgentConversationCreateProps {
  lastMessageAt?: Date | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConversationReviseChanges {
  title?: string | null;
}

interface AgentConversationBuildProps {
  id: string;
  userId: string;
  title: string | undefined;
  lastMessageAt: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Uma conversa com o agente. O titulo e opcional de proposito: uma conversa
 * nasce sem nome e a lista cai no texto da primeira mensagem, para que comecar
 * a conversar nao exija nomear nada antes.
 *
 * `lastMessageAt` e derivado — quem o move e a gravacao de mensagens, nao o
 * dominio; ele vive aqui so para a leitura da lista nao precisar de um join.
 * Nasce igual a `createdAt` porque a conversa e gravada na mesma transacao da
 * primeira mensagem: nunca ha uma conversa sem atividade para ordenar.
 */
export class AgentConversation {
  readonly id: string;
  readonly userId: string;
  readonly title: string | undefined;
  readonly lastMessageAt: Date;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AgentConversationBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.title = props.title;
    this.lastMessageAt = props.lastMessageAt;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  private static build(props: AgentConversationBuildProps): AgentConversation {
    if (!props.userId) {
      throw new AgentConversationValidationError("Conversation userId cannot be empty");
    }
    if (props.title !== undefined && props.title.trim().length === 0) {
      throw new AgentConversationValidationError("Conversation title cannot be blank");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new AgentConversationValidationError("Conversation revision must be an integer >= 1");
    }

    return new AgentConversation(props);
  }

  static create(props: AgentConversationCreateProps): AgentConversation {
    const now = new Date();
    return AgentConversation.build({
      id: props.id ?? AgentConversationId.create(),
      userId: props.userId,
      title: props.title ?? undefined,
      lastMessageAt: now,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: AgentConversationRehydrateProps): AgentConversation {
    return AgentConversation.build({
      id: props.id ?? AgentConversationId.create(),
      userId: props.userId,
      title: props.title ?? undefined,
      lastMessageAt: props.lastMessageAt ?? props.createdAt,
      revision: props.revision,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  /** So o titulo se revisa: anexar mensagem nao e uma mudanca da conversa. */
  revise(changes: AgentConversationReviseChanges): AgentConversation {
    return AgentConversation.build({
      id: this.id,
      userId: this.userId,
      title: changes.title !== undefined ? (changes.title ?? undefined) : this.title,
      lastMessageAt: this.lastMessageAt,
      revision: this.revision + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
