import { createHash, randomBytes } from "node:crypto";
import type { AgentChatTicketDto, IssueAgentChatTicketRequest } from "@repo/contracts";
import type { AgentChatTicketStore } from "../../../domain/ports";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";

/** Tempo para o cliente abrir o socket depois de receber o ticket. */
export const AGENT_CHAT_TICKET_TTL_SECONDS = 30;

export function hashAgentChatTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

/**
 * Autentica o chat antes do WebSocket existir. O navegador nao manda
 * `Authorization` no upgrade; esta chamada e HTTP comum e passa pelo mesmo
 * caminho de toda rota (cookie -> proxy do Next -> `GatewayIdentityGuard` ->
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
    if (!actor.sessionId) throw new Error("Authorized actor has no sessionId");

    const ticket = randomBytes(32).toString("base64url");
    await this.store.save({
      tokenHash: hashAgentChatTicket(ticket),
      grant: {
        actor: { userId: actor.userId, sessionId: actor.sessionId },
        targetUserId: input.userId,
      },
      ttlSeconds: AGENT_CHAT_TICKET_TTL_SECONDS,
    });

    const expiresAt = new Date(this.clock().getTime() + AGENT_CHAT_TICKET_TTL_SECONDS * 1000);
    return { ticket, expiresAt: expiresAt.toISOString() };
  }
}
