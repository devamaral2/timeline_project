import { expect, test } from "vitest";
import { statusOfThrown } from "../../events/testing/status-of";
import { InMemoryAgentChatTicketStore } from "../testing/in-memory-agent-chat-ticket-store";
import { hashAgentChatTicket, IssueAgentChatTicketUseCase } from "./issue-agent-chat-ticket.usecase";

const NOW = new Date("2026-09-17T12:00:00.000Z");

function setup() {
  const store = new InMemoryAgentChatTicketStore(() => NOW.getTime());
  return { store, useCase: new IssueAgentChatTicketUseCase(store, () => NOW) };
}

test("issues a ticket whose grant carries the resolved actor and the target", async () => {
  const { store, useCase } = setup();
  const actor = { userId: "user-1", roles: ["member"], permissions: ["events:read"], denies: [] };

  const { ticket, expiresAt } = await useCase.execute({ userId: "user-1" }, actor);

  expect(expiresAt).toBe("2026-09-17T12:00:30.000Z");
  expect(await store.consume(hashAgentChatTicket(ticket))).toEqual({ actor, targetUserId: "user-1" });
});

test("stores only the hash of the ticket", async () => {
  const { store, useCase } = setup();

  const { ticket } = await useCase.execute({ userId: "user-1" }, { userId: "user-1" });

  expect([...store.tickets.keys()]).toEqual([hashAgentChatTicket(ticket)]);
  expect(store.tickets.has(ticket)).toBe(false);
});

test("two tickets are never the same", async () => {
  const { useCase } = setup();

  const first = await useCase.execute({ userId: "user-1" }, { userId: "user-1" });
  const second = await useCase.execute({ userId: "user-1" }, { userId: "user-1" });

  expect(first.ticket).not.toBe(second.ticket);
});

test("refuses a ticket for someone else's data unless the actor is a super admin", async () => {
  const { store, useCase } = setup();

  expect(await statusOfThrown(() => useCase.execute({ userId: "user-2" }, { userId: "user-1" }))).toBe(403);
  expect(store.tickets.size).toBe(0);

  const admin = { userId: "admin", permissions: ["*:manage"], denies: [] };
  await expect(useCase.execute({ userId: "user-2" }, admin)).resolves.toMatchObject({ ticket: expect.any(String) });
});
