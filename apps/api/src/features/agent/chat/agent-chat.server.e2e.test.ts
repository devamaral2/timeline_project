import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import WebSocket from "ws";
import type { AgentChatServerFrame } from "@repo/contracts";
import { DomainExceptionFilter } from "../../../common/domain-exception.filter";
import { InMemoryEventDatabase } from "../../events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../events/testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../../events/testing/in-memory-workout.catalog";
import { StubMealParsingGateway } from "../../events/testing/stub-meal-parsing.gateway";
import { CreateEventUseCase } from "../../events/usecases/create-event.usecase";
import { InMemoryNoteRepository } from "../../notes/testing/in-memory-note.repository";
import { InMemoryTaskRepository } from "../../tasks/testing/in-memory-task.repository";
import { AgentChatController } from "../http/agent-chat.controller";
import { InMemoryAgentChatTicketStore } from "../testing/in-memory-agent-chat-ticket-store";
import { InMemoryEntityBatchWriter } from "../testing/in-memory-entity-batch-writer";
import { InMemoryAgentConversationQuery } from "../testing/in-memory-agent-conversation.query";
import { RunChatTurnUseCase } from "../usecases/run-chat-turn.usecase";
import { ScriptedAgentGateway } from "../testing/scripted-agent.gateway";
import { StubScopedSqlQuery } from "../testing/stub-scoped-sql-query";
import { IssueAgentChatTicketUseCase } from "../usecases/issue-agent-chat-ticket.usecase";
import { RunAgentUseCase } from "../usecases/run-agent.usecase";
import { AgentChatServer } from "./agent-chat.server";

/**
 * O caminho inteiro por rede: o ticket pedido por HTTP com um bearer que um
 * apps/auth falso reconhece, o upgrade no mesmo servidor do Nest, e a conversa
 * chegando ao `RunAgentUseCase` de verdade (com o modelo trocado por roteiro).
 */

const silent = { log() {}, error() {}, warn() {} };
const tickets = new InMemoryAgentChatTicketStore();
const gateway = new ScriptedAgentGateway([{ name: "save_note", args: { content: "Comprar pão" } }], "Anotei.");
const notes = new InMemoryNoteRepository();

function buildRunChatTurn(): RunChatTurnUseCase {
  return new RunChatTurnUseCase(buildRunAgent(), new InMemoryAgentConversationQuery());
}

function buildRunAgent(): RunAgentUseCase {
  const events = new InMemoryEventRepository(new InMemoryEventDatabase());
  const tasks = new InMemoryTaskRepository();
  const createEvent = new CreateEventUseCase(
    events,
    new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    new InMemoryWorkoutCatalog(),
  );
  return new RunAgentUseCase(
    gateway,
    new StubScopedSqlQuery(),
    new InMemoryEntityBatchWriter({ events, tasks, notes }),
    { events, tasks, notes },
    createEvent,
  );
}

@Module({
  controllers: [AgentChatController],
  providers: [
    { provide: IssueAgentChatTicketUseCase, useFactory: () => new IssueAgentChatTicketUseCase(tickets) },
    {
      provide: AgentChatServer,
      inject: [HttpAdapterHost],
      useFactory: (host: HttpAdapterHost) =>
        new AgentChatServer(() => host.httpAdapter.getHttpServer(), tickets, buildRunChatTurn(), silent),
    },
  ],
})
class ChatProbeModule {}

let app: INestApplication;
let apiUrl: string;

beforeAll(async () => {
  process.env.AUTH_INTERNAL_SERVICE_KEY = "test-internal-service-key-32-bytes";

  app = await NestFactory.create(ChatProbeModule, { logger: false });
  app.useGlobalFilters(new DomainExceptionFilter(silent));
  await app.listen(0, "127.0.0.1");
  apiUrl = await app.getUrl();
});

afterAll(async () => {
  delete process.env.AUTH_INTERNAL_SERVICE_KEY;
});

beforeEach(() => {
  tickets.tickets.clear();
});

async function issueTicket(authorization: string | undefined, userId = "user-1") {
  const actor = authorization === "Bearer token-2" ? "user-2" : authorization === "Bearer token-1" ? "user-1" : undefined;
  if (actor && actor !== userId) return new Response(null, { status: 403 });
  return fetch(`${apiUrl}/api/ai/chat/tickets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(actor ? { "x-auth-gateway-key": "test-internal-service-key-32-bytes", "x-auth-user-id": actor, "x-auth-session-id": "session-1" } : {}),
    },
    body: JSON.stringify({ userId }),
  });
}

async function ticketFor(authorization = "Bearer token-1"): Promise<string> {
  const response = await issueTicket(authorization);
  expect(response.status).toBe(201);
  return ((await response.json()) as { ticket: string }).ticket;
}

/** Um cliente que guarda os frames e deixa esperar pelo proximo ou pelo fechamento. */
function connect(path: string) {
  const socket = new WebSocket(`${apiUrl.replace("http", "ws")}${path}`);
  const frames: AgentChatServerFrame[] = [];
  const waiters: Array<() => void> = [];
  socket.on("message", (data) => {
    frames.push(JSON.parse(data.toString()) as AgentChatServerFrame);
    for (const wake of waiters.splice(0)) wake();
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  const failed = new Promise<Error>((resolve) => socket.on("error", resolve));

  async function frameWhere(predicate: (frame: AgentChatServerFrame) => boolean): Promise<AgentChatServerFrame> {
    for (;;) {
      const found = frames.find(predicate);
      if (found) return found;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  }
  return { socket, frames, closed, failed, frameWhere };
}

test("a ticket issued over HTTP opens a conversation that reaches the agent", async () => {
  const client = connect(`/api/ai/chat?ticket=${await ticketFor()}`);

  expect(await client.frameWhere((frame) => frame.type === "ready")).toMatchObject({ userId: "user-1" });
  client.socket.send(JSON.stringify({ type: "message", id: "m1", text: "anote comprar pão" }));
  const reply = await client.frameWhere((frame) => frame.type === "reply");

  expect(client.frames.filter((frame) => frame.type === "status")).toEqual([
    { type: "status", id: "m1", label: "Preparando nota" },
    { type: "status", id: "m1", label: "Salvando" },
  ]);
  expect(reply).toMatchObject({
    id: "m1",
    agentResponse: "Anotei.",
    entities: [{ kind: "note", change: "created", label: "Comprar pão" }],
  });
  if (reply.type !== "reply") throw new Error("expected a reply");
  expect((await notes.findById(reply.createdEntities[0].id))?.userId).toBe("user-1");

  client.socket.close();
  await client.closed;
});

test("a ticket works once", async () => {
  const ticket = await ticketFor();
  const first = connect(`/api/ai/chat?ticket=${ticket}`);
  await first.frameWhere((frame) => frame.type === "ready");

  const second = connect(`/api/ai/chat?ticket=${ticket}`);

  expect(await second.closed).toEqual({ code: 4401, reason: "unauthorized" });
  first.socket.close();
  await first.closed;
});

test.each([
  ["no ticket", "/api/ai/chat"],
  ["a malformed ticket", "/api/ai/chat?ticket=abc"],
  ["an unknown ticket", `/api/ai/chat?ticket=${"a".repeat(43)}`],
])("%s is refused with 4401", async (_label, path) => {
  const client = connect(path);

  expect(await client.closed).toEqual({ code: 4401, reason: "unauthorized" });
  expect(client.frames).toEqual([]);
});

test("the ticket itself requires an authenticated caller, allowed to act on the target", async () => {
  expect((await issueTicket(undefined)).status).toBe(401);
  expect((await issueTicket("Bearer revoked")).status).toBe(401);
  expect((await issueTicket("Bearer token-2", "user-1")).status).toBe(403);
  expect(tickets.tickets.size).toBe(0);
});

test("an upgrade to any other path is dropped", async () => {
  const client = connect("/api/events");

  expect((await client.failed).message).toMatch(/socket hang up|ECONNRESET/);
});

test("shutting the app down closes open conversations as going away", async () => {
  const client = connect(`/api/ai/chat?ticket=${await ticketFor()}`);
  await client.frameWhere((frame) => frame.type === "ready");

  await app.close();

  expect(await client.closed).toMatchObject({ code: 1001 });
});
