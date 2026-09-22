import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import { AgentChatClient, type AgentChatEvent, type ChatSocket } from "./agent-chat-client";

vi.mock("@/lib/session/refresh-session", () => ({ refreshSession: vi.fn(async () => false) }));

/** Um WebSocket que o teste conduz: o servidor fala por `serverSends`/`serverCloses`. */
class FakeSocket implements ChatSocket {
  readyState = 0;
  readonly sent: unknown[] = [];
  closedWith?: { code?: number; reason?: string };
  onmessage: ChatSocket["onmessage"] = null;
  onclose: ChatSocket["onclose"] = null;
  onerror: ChatSocket["onerror"] = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  serverSends(frame: unknown): void {
    this.readyState = 1;
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  serverCloses(code: number, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

let sockets: FakeSocket[];
let events: AgentChatEvent[];
let tickets: string[];

function client(fetchTicket?: (userId: string) => Promise<string>) {
  return new AgentChatClient({
    userId: "user-1",
    onEvent: (event) => events.push(event),
    fetchTicket:
      fetchTicket ??
      (async () => {
        const ticket = `ticket-${tickets.length + 1}`;
        tickets.push(ticket);
        return ticket;
      }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    readyTimeoutMs: 1000,
  });
}

/** Deixa as promessas pendentes andarem ate o proximo socket ser criado ou o frame ser enviado. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  sockets = [];
  events = [];
  tickets = [];
});

afterEach(() => {
  vi.useRealTimers();
});

test("asks for a ticket, waits for ready and only then sends the message", async () => {
  const chat = client();

  const sending = chat.send({ id: "m1", text: "oi", conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
  await flush();

  expect(sockets[0].url).toBe(`ws://${window.location.host}/api/ai/chat?ticket=ticket-1`);
  expect(sockets[0].sent).toEqual([]);

  sockets[0].serverSends({ type: "ready", userId: "user-1", expiresAt: "2026-09-17T12:15:00.000Z" });
  await sending;

  expect(sockets[0].sent).toEqual([
    { type: "message", id: "m1", text: "oi", conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  ]);
});

test("reuses the open connection for the next message", async () => {
  const chat = client();
  const first = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverSends({ type: "ready" });
  await first;

  await chat.send({ id: "m2", text: "de novo" });

  expect(sockets).toHaveLength(1);
  expect(tickets).toHaveLength(1);
  expect(sockets[0].sent.map((frame) => (frame as { id: string }).id)).toEqual(["m1", "m2"]);
});

test("delivers status and reply frames", async () => {
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverSends({ type: "ready" });
  await sending;

  sockets[0].serverSends({ type: "status", id: "m1", label: "Salvando" });
  sockets[0].serverSends({ type: "reply", id: "m1", agentResponse: "Feito.", entities: [], createdEntities: [], updatedEntities: [], deletedEntities: [] });

  expect(events.map((event) => event.type)).toEqual(["status", "reply"]);
});

test("a rejected ticket is retried once with a fresh one", async () => {
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverCloses(4401, "unauthorized");
  await flush();

  expect(tickets).toEqual(["ticket-1", "ticket-2"]);
  sockets[1].serverSends({ type: "ready" });
  await sending;
  expect(sockets[1].sent).toHaveLength(1);
  expect(events).toEqual([]);
});

test("a second rejected ticket fails the message", async () => {
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverCloses(4401);
  await flush();
  sockets[1].serverCloses(4401);
  await sending;

  expect(events).toEqual([{ type: "error", id: "m1", code: "connection_failed" }]);
});

test("a ticket refused with 401 means the session is over", async () => {
  const chat = client(async () => {
    throw new ApiError(401, "POST /api/ai/chat/tickets -> 401");
  });

  await chat.send({ id: "m1", text: "oi" });

  expect(events).toEqual([{ type: "error", id: "m1", code: "session_expired" }]);
  expect(sockets).toEqual([]);
});

test("a connection dropped mid-answer reports the message as lost", async () => {
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverSends({ type: "ready" });
  await sending;

  sockets[0].serverCloses(1006);

  expect(events).toEqual([{ type: "error", id: "m1", code: "connection_lost" }]);
});

test("an idle connection closed by the server is reopened on the next message, silently", async () => {
  const chat = client();
  const first = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverSends({ type: "ready" });
  await first;
  sockets[0].serverSends({ type: "reply", id: "m1", agentResponse: "Oi", entities: [], createdEntities: [], updatedEntities: [], deletedEntities: [] });

  sockets[0].serverCloses(4001, "reauthenticate");
  const second = chat.send({ id: "m2", text: "e agora?" });
  await flush();
  sockets[1].serverSends({ type: "ready" });
  await second;

  expect(events.filter((event) => event.type === "error")).toEqual([]);
  expect(tickets).toEqual(["ticket-1", "ticket-2"]);
  expect(sockets[1].sent).toEqual([{ type: "message", id: "m2", text: "e agora?" }]);
});

test("cancel is sent for the running message", async () => {
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverSends({ type: "ready" });
  await sending;

  chat.cancel("m1");

  expect(sockets[0].sent.at(-1)).toEqual({ type: "cancel", id: "m1" });
});

test("a server that never says ready fails the message", async () => {
  vi.useFakeTimers();
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await vi.advanceTimersByTimeAsync(1000);
  await sending;

  expect(sockets[0].closedWith).toMatchObject({ code: 1000 });
  expect(events).toEqual([{ type: "error", id: "m1", code: "connection_failed" }]);
});

test("closing the client stays quiet", async () => {
  const chat = client();
  const sending = chat.send({ id: "m1", text: "oi" });
  await flush();
  sockets[0].serverSends({ type: "ready" });
  await sending;

  chat.close();
  sockets[0].serverCloses(1000);

  expect(sockets[0].closedWith).toMatchObject({ code: 1000 });
  expect(events).toEqual([]);
});
