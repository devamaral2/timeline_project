import type { AgentChatGrant, AgentChatTicketStore } from "../../../domain/ports";

/** Mesmo contrato do store do Postgres: uso unico, e expirado conta como inexistente. */
export class InMemoryAgentChatTicketStore implements AgentChatTicketStore {
  readonly tickets = new Map<string, { grant: AgentChatGrant; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async save(input: { tokenHash: string; grant: AgentChatGrant; ttlSeconds: number }): Promise<void> {
    this.tickets.set(input.tokenHash, { grant: input.grant, expiresAt: this.now() + input.ttlSeconds * 1000 });
  }

  async consume(tokenHash: string): Promise<AgentChatGrant | null> {
    const entry = this.tickets.get(tokenHash);
    this.tickets.delete(tokenHash);
    if (!entry || entry.expiresAt <= this.now()) return null;
    return entry.grant;
  }
}
