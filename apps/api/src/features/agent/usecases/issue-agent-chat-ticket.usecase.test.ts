import { expect, test } from "vitest";
import { InMemoryAgentChatTicketStore } from "../testing/in-memory-agent-chat-ticket-store";
import { hashAgentChatTicket, IssueAgentChatTicketUseCase } from "./issue-agent-chat-ticket.usecase";

const NOW = new Date("2026-09-17T12:00:00.000Z");

function setup() {
  const store = new InMemoryAgentChatTicketStore(() => NOW.getTime());
  return { store, useCase: new IssueAgentChatTicketUseCase(store, () => NOW) };
}

test("issues a ticket whose grant carries the resolved actor and the target", async () => {
  const { store, useCase } = setup();
  const actor = { userId: "user-1", sessionId: "session-1" };

  const { ticket, expiresAt } = await useCase.execute({ userId: "user-1" }, actor);

  expect(expiresAt).toBe("2026-09-17T12:00:30.000Z");
  expect(await store.consume(hashAgentChatTicket(ticket))).toEqual({ actor, targetUserId: "user-1" });
});

test("stores only the hash of the ticket", async () => {
  const { store, useCase } = setup();

  const { ticket } = await useCase.execute({ userId: "user-1" }, { userId: "user-1", sessionId: "session-1" });

  expect([...store.tickets.keys()]).toEqual([hashAgentChatTicket(ticket)]);
  expect(store.tickets.has(ticket)).toBe(false);
});

test("two tickets are never the same", async () => {
  const { useCase } = setup();

  const first = await useCase.execute({ userId: "user-1" }, { userId: "user-1", sessionId: "session-1" });
  const second = await useCase.execute({ userId: "user-1" }, { userId: "user-1", sessionId: "session-1" });

  expect(first.ticket).not.toBe(second.ticket);
});

test("requires the session resolved by apps/auth", async () => {
  const { useCase } = setup();
  await expect(useCase.execute({ userId: "user-1" }, { userId: "user-1" })).rejects.toThrow("sessionId");
});
