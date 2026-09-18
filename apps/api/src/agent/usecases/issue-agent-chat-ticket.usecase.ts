import { createHash, randomBytes } from "node:crypto";
import type { AgentChatTicketDto, IssueAgentChatTicketRequest } from "@repo/entities/contracts";
import type { AgentChatTicketStore } from "@repo/entities/ports";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { assertCanActFor } from "../services/agent-access-policy";

/** Tempo para o cliente abrir o socket depois de receber o ticket. */
export const AGENT_CHAT_TICKET_TTL_SECONDS = 30;

export function hashAgentChatTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

/**
 * Autentica o chat antes do WebSocket existir. O navegador nao manda
 * `Authorization` no upgrade; esta chamada e HTTP comum e passa pelo mesmo
 * caminho de toda rota (cookie -> proxy do Next -> `AuthServiceGuard` ->
 * `/auth/me`). O ticket devolvido carrega o ator ja resolvido.
 *
 * A autorizacao sobre o alvo e decidida aqui, e de novo a cada mensagem.
 */
export class IssueAgentChatTicketUseCase {
  constructor(
    private readonly store: AgentChatTicketStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: IssueAgentChatTicketRequest, actor: AuthenticatedUser): Promise<AgentChatTicketDto> {
    assertCanActFor(actor, input.userId);

    const ticket = randomBytes(32).toString("base64url");
    await this.store.save({
      tokenHash: hashAgentChatTicket(ticket),
      grant: {
        actor: { userId: actor.userId, roles: actor.roles, permissions: actor.permissions, denies: actor.denies },
        targetUserId: input.userId,
      },
      ttlSeconds: AGENT_CHAT_TICKET_TTL_SECONDS,
    });

    const expiresAt = new Date(this.clock().getTime() + AGENT_CHAT_TICKET_TTL_SECONDS * 1000);
    return { ticket, expiresAt: expiresAt.toISOString() };
  }
}
