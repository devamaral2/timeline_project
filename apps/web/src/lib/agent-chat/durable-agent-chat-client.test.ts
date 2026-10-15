import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AiJobDto, SubmitAiJobRequest } from "@/lib/ai-jobs/ai-jobs";
import { DurableAgentChatClient } from "./durable-agent-chat-client";

const queued: AiJobDto = {
  id: "job-1", kind: "agent-turn", status: "queued", userId: "u",
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
  request: { text: "oi", clientMessageId: "stable-id" },
};
const succeeded: AiJobDto = {
  ...queued, status: "succeeded",
  result: { agentResponse: "Olá", conversationId: "new-conversation", assistantSeq: 2,
    entities: [], createdEntities: [], updatedEntities: [], deletedEntities: [] },
};
const clients: DurableAgentChatClient[] = [];
function setup(list: AiJobDto[] = []) {
  const api = {
    list: vi.fn(async () => list),
    submit: vi.fn(async (_request: SubmitAiJobRequest) => queued),
    get: vi.fn(async (_id: string) => succeeded),
    cancel: vi.fn(async (_id: string) => ({ ...queued, status: "cancelled" as const })),
  };
  const onEvent = vi.fn();
  const onRecover = vi.fn(() => true);
  const client = new DurableAgentChatClient({ userId: "u", api, onEvent, onRecover, pollMs: 10 });
  clients.push(client);
  return { api, client, onEvent, onRecover };
}
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { for (const client of clients.splice(0)) client.close(); vi.useRealTimers(); });

test("ambiguous submission retries exactly the same clientMessageId", async () => {
  const { api, client, onEvent } = setup();
  api.submit.mockRejectedValueOnce(new TypeError("offline"));
  await client.send({ id: "stable-id", text: "oi" });
  await vi.advanceTimersByTimeAsync(10);
  expect(api.submit).toHaveBeenCalledTimes(2);
  expect(api.submit.mock.calls[0]).toEqual(api.submit.mock.calls[1]);
  await vi.advanceTimersByTimeAsync(10);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "reply", id: "stable-id" }));
});

test("lost connection after acceptance polls the same job and never resubmits", async () => {
  const { api, client, onEvent } = setup();
  api.get.mockRejectedValueOnce(new TypeError("offline"));
  await client.send({ id: "stable-id", text: "oi" });
  await vi.advanceTimersByTimeAsync(20);
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenNthCalledWith(1, "job-1");
  expect(api.get).toHaveBeenNthCalledWith(2, "job-1");
  expect(onEvent.mock.calls.some(([event]) => event.type === "error")).toBe(false);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "reply" }));
});

test("explicit cancel targets the accepted job", async () => {
  const { api, client, onEvent } = setup();
  await client.send({ id: "stable-id", text: "oi" });
  client.cancel();
  await vi.advanceTimersByTimeAsync(10);
  expect(api.cancel).toHaveBeenCalledWith("job-1");
  expect(onEvent).toHaveBeenCalledWith({ type: "error", id: "stable-id", code: "cancelled" });
});

test("reopening recovers a completed new conversation through the jobs list", async () => {
  localStorage.setItem("ai-chat-outbox:u:stable-id", JSON.stringify({
    userId: "u", text: "oi", clientMessageId: "stable-id",
  }));
  const { api, onRecover, onEvent } = setup([succeeded]);
  await vi.advanceTimersByTimeAsync(0);
  expect(onRecover).toHaveBeenCalledWith(succeeded);
  expect(api.submit).not.toHaveBeenCalled();
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "reply", conversationId: "new-conversation" }));
  expect(localStorage.getItem("ai-chat-outbox:u:stable-id")).toBeNull();
});

test("a fresh panel does not replay arbitrary terminal history", async () => {
  const { onRecover, onEvent } = setup([succeeded]);
  await vi.advanceTimersByTimeAsync(0);
  expect(onRecover).not.toHaveBeenCalled();
  expect(onEvent).not.toHaveBeenCalled();
});

test("accepted receipts survive closing and two tabs cannot erase each other's request", async () => {
  const first = setup();
  const second = setup();
  await vi.advanceTimersByTimeAsync(0);
  await first.client.send({ id: "first", text: "one" });
  second.api.submit.mockRejectedValue(new TypeError("offline"));
  await second.client.send({ id: "second", text: "two" });
  first.client.close();
  expect(localStorage.getItem("ai-chat-outbox:u:first")).not.toBeNull();
  await vi.advanceTimersByTimeAsync(10);
  expect(localStorage.getItem("ai-chat-outbox:u:second")).not.toBeNull();
  expect(localStorage.getItem("ai-chat-outbox:u:first")).not.toBeNull();
});

test("terminal delivery removes only its own operation receipt", async () => {
  const first = setup();
  const second = setup();
  await vi.advanceTimersByTimeAsync(0);
  await first.client.send({ id: "first", text: "one" });
  second.api.submit.mockRejectedValue(new TypeError("offline"));
  await second.client.send({ id: "second", text: "two" });
  await vi.advanceTimersByTimeAsync(10);
  expect(localStorage.getItem("ai-chat-outbox:u:first")).toBeNull();
  expect(localStorage.getItem("ai-chat-outbox:u:second")).not.toBeNull();
});

test("reload during an unknown POST retains its original operation id", async () => {
  localStorage.setItem("ai-chat-outbox:u", JSON.stringify({ userId: "u", text: "oi", clientMessageId: "stable-id" }));
  const { api } = setup();
  await vi.advanceTimersByTimeAsync(0);
  expect(api.submit).toHaveBeenCalledWith({ userId: "u", text: "oi", clientMessageId: "stable-id" });
});

test("recovered pending work is polled, not posted", async () => {
  const { api, onEvent } = setup([queued]);
  await vi.advanceTimersByTimeAsync(10);
  expect(api.submit).not.toHaveBeenCalled();
  expect(api.get).toHaveBeenCalledWith("job-1");
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "reply" }));
});
