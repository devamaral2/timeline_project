import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useVoiceEventQueue } from "./use-voice-event-queue";

const { voice, get, list, cancel, session } = vi.hoisted(() => ({
  voice: vi.fn(), get: vi.fn(), list: vi.fn(), cancel: vi.fn(),
  session: { user: { userId: "u" } },
}));
vi.mock("@/lib/ai-jobs/ai-jobs", async (original) => ({
  ...await original<typeof import("@/lib/ai-jobs/ai-jobs")>(),
  aiJobs: { voice, get, list, cancel },
}));
vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ ...session, ready: true }),
}));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); session.user = { userId: "u" }; });

test("concurrent outbox retry and server recovery observe one voice operation", async () => {
  const pending = { id: "server-job", kind: "transcript-event", status: "queued",
    userId: "u", createdAt: "", updatedAt: "",
    request: { text: "almocei arroz", clientMessageId: "stable-voice" } };
  localStorage.setItem("voice-jobs:u", JSON.stringify([
    { id: "stable-voice", transcript: "almocei arroz", status: "pending" },
  ]));
  let finish!: (value: unknown) => void;
  voice.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  list.mockResolvedValue([pending]);
  const onAllDone = vi.fn();
  const { result } = renderHook(() => useVoiceEventQueue({ onAllDone }));
  await waitFor(() => expect(list).toHaveBeenCalledOnce());
  expect(result.current.jobs).toHaveLength(1);
  expect(voice).toHaveBeenCalledWith("almocei arroz", "stable-voice");
  await act(async () => { finish({ ...pending, status: "succeeded" }); });
  expect(result.current.jobs).toHaveLength(0);
  expect(onAllDone).toHaveBeenCalledOnce();
  expect(get).not.toHaveBeenCalled();
});

test("an old owner's in-flight result cannot overwrite the next owner's queue", async () => {
  list.mockResolvedValue([]);
  let finish!: (value: unknown) => void;
  voice.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onAllDone = vi.fn();
  const { result, rerender } = renderHook(() => useVoiceEventQueue({ onAllDone }));
  act(() => result.current.enqueue("pedido do primeiro usuário"));
  session.user = { userId: "other" };
  rerender();
  await act(async () => { finish({ id: "old-job", status: "succeeded" }); });
  expect(result.current.jobs).toEqual([]);
  expect(onAllDone).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("voice-jobs:u") ?? "[]")).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem("voice-jobs:other") ?? "[]")).toEqual([]);
});
