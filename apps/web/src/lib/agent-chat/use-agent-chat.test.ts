import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { AgentChatMessagePageDto } from "@/lib/api/contracts";
import { useAgentChat } from "./use-agent-chat";

const { list, submit, get, cancel } = vi.hoisted(() => ({
  list: vi.fn(), submit: vi.fn(), get: vi.fn(), cancel: vi.fn(),
}));
vi.mock("@/lib/ai-jobs/ai-jobs", async (original) => ({
  ...await original<typeof import("@/lib/ai-jobs/ai-jobs")>(),
  aiJobs: { list, submit, get, cancel },
}));
const job = {
  id: "job", kind: "agent-turn", status: "succeeded", createdAt: "2026-01-01", updatedAt: "2026-01-01",
  userId: "u", request: { text: "oi", clientMessageId: "original-id" },
  result: { conversationId: "new-conversation", assistantSeq: 2, agentResponse: "Olá",
    entities: [], createdEntities: [], updatedEntities: [], deletedEntities: [] },
};
const history: AgentChatMessagePageDto = {
  items: [
    { id: "assistant", seq: 2, role: "assistant", content: "Olá", entities: [], createdAt: "" },
    { id: "user", seq: 1, role: "user", content: "oi", entities: [], createdAt: "" },
  ],
};
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); list.mockResolvedValue([job]); });

test("reload recovers a new conversation and replaces optimistic messages with history exactly once", async () => {
  localStorage.setItem("ai-chat-outbox:u:original-id", JSON.stringify({
    userId: "u", text: "oi", clientMessageId: "original-id",
  }));
  const loadMessages = vi.fn(async () => history);
  const { result } = renderHook(() => useAgentChat({ userId: "u", loadMessages }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() => expect(result.current.conversationId).toBe("new-conversation"));
  expect(result.current.messages.map((message) => message.id)).toEqual(["user", "assistant"]);
  expect(result.current.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  expect(result.current.messages.filter((message) => message.role === "user")).toHaveLength(1);
  expect(submit).not.toHaveBeenCalled();
  await act(async () => { await result.current.openConversation("new-conversation"); });
  expect(result.current.messages).toHaveLength(2);
});

test("recovering older history retains an uncommitted request and its retry text on failure", async () => {
  list.mockResolvedValue([{ ...job, status: "queued", result: undefined,
    request: { ...job.request, conversationId: "existing" } }]);
  get.mockResolvedValue({ ...job, status: "failed", errorCode: "unavailable", result: undefined });
  const loadMessages = vi.fn(async () => history);
  const { result } = renderHook(() => useAgentChat({ userId: "u", loadMessages }));
  await waitFor(() => expect(result.current.messages.some((message) => message.id === "original-id")).toBe(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.messages.map((message) => message.id)).toEqual(["user", "assistant", "original-id"]);
  await waitFor(() => expect(result.current.pending).toBeNull(), { timeout: 3000 });
  expect(result.current.messages.at(-1)).toMatchObject({ role: "error", retryText: "oi" });
});
