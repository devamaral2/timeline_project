import "reflect-metadata";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { statusOfThrown } from "../../api-core/events/testing/status-of";
import { InMemoryAgentChatTicketStore } from "../../api-core/agent/testing/in-memory-agent-chat-ticket-store";
import { IssueAgentChatTicketUseCase } from "./issue-agent-chat-ticket.usecase";
import { IssueAgentChatTicketController } from "./issue-agent-chat-ticket.controller";

const actor = { userId: "user-1", sessionId: "session-1" };

function controller() {
  const store = new InMemoryAgentChatTicketStore();
  return { store, controller: new IssueAgentChatTicketController(new IssueAgentChatTicketUseCase(store)) };
}

test("POST /api/ai/chat/tickets is guarded", () => {
  expect(Reflect.getMetadata(PATH_METADATA, IssueAgentChatTicketController)).toBe("api/ai/chat");
  expect(Reflect.getMetadata(PATH_METADATA, IssueAgentChatTicketController.prototype.execute)).toBe("tickets");
  expect(Reflect.getMetadata(GUARDS_METADATA, IssueAgentChatTicketController.prototype.execute)).toContain(GatewayIdentityGuard);
});

test("issues a ticket for a valid body", async () => {
  const { store, controller: subject } = controller();

  const response = await subject.execute({ userId: "user-1" }, actor);

  expect(response.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(store.tickets.size).toBe(1);
});

test.each([
  ["missing userId", {}],
  ["empty userId", { userId: "" }],
  ["userId too long", { userId: "a".repeat(129) }],
])("answers 400 for %s", async (_label, body) => {
  const { store, controller: subject } = controller();

  expect(await statusOfThrown(() => subject.execute(body, actor))).toBe(400);
  expect(store.tickets.size).toBe(0);
});
