import { act, renderHook, waitFor } from "@testing-library/react";
import type { RequestDto, RequestEntityDto } from "@repo/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, requestFixture, requestsArea } from "@/test/fake-api/requests";
import { useVoiceEventQueue } from "./use-voice-event-queue";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));
const session = vi.hoisted(() => ({ user: { userId: "u" } }));
vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: session.user, ready: true }),
}));

let api: FakeApi;
const requests = () => api.store.table<RequestDto>("requests");
const voicePosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests/voice");
const createdEvent: RequestEntityDto = { kind: "event", id: "ev-9", name: "Almoço", operation: "create", linkedTo: [] };

beforeEach(() => {
  localStorage.clear();
  session.user = { userId: "u" };
  api = createFakeApi({ areas: [requestsArea()] });
  net.authedFetch.mockReset().mockImplementation(api.authedFetch);
});

test("a lost submission response is retried under the same message id and tracks the accepted request", async () => {
  // A resposta do envio se perdeu: o servidor aceitou com o id estável, e o outbox ainda o guarda sem `requestId`.
  const accepted = await api.authedFetch("/api/requests/voice", json({ transcript: "almocei arroz", clientMessageId: "stable-voice" })) as { requestId: string };
  localStorage.setItem("voice-jobs:u", JSON.stringify([
    { id: "stable-voice", transcript: "almocei arroz", status: "pending" },
  ]));
  const onCreated = vi.fn();
  const { result } = renderHook(() => useVoiceEventQueue({ onCreated }));

  await waitFor(() => expect(result.current.jobs).toHaveLength(1));
  await waitFor(() => expect(result.current.jobs[0]?.requestId).toBe(accepted.requestId));
  // O envio sem resposta é refeito com o mesmo id: a API devolve o pedido aceito, sem criar outro.
  expect(voicePosts().every((call) => (call.body as { clientMessageId?: string }).clientMessageId === "stable-voice")).toBe(true);
  expect(requests().size).toBe(1);

  advanceRequest(api, accepted.requestId, { status: "done", entities: [createdEvent] });
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdEvent), { timeout: 4000 });
  expect(result.current.jobs).toEqual([]);
});

test("an old owner's in-flight submission cannot overwrite the next owner's queue", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // O envio do dono antigo responde depois da troca de usuário; a API não é tocada, para a lista do novo dono ficar vazia.
  net.authedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path !== "/api/requests/voice") return api.authedFetch(path, init);
    await gate;
    return { requestId: "R0000000000000000000000009" };
  });
  const onCreated = vi.fn();
  const { result, rerender } = renderHook(() => useVoiceEventQueue({ onCreated }));
  act(() => result.current.enqueue("pedido do primeiro usuário"));
  session.user = { userId: "other" };
  rerender();
  await act(async () => { release(); });
  expect(result.current.jobs).toEqual([]);
  expect(onCreated).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("voice-jobs:u") ?? "[]")).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem("voice-jobs:other") ?? "[]")).toEqual([]);
});

test("a voice request that ends without a created event shows the agent's failure message", async () => {
  const { result } = renderHook(() => useVoiceEventQueue({ onCreated: vi.fn() }));
  act(() => result.current.enqueue("isso não é uma tarefa"));
  await waitFor(() => expect(requests().size).toBe(1));
  const id = [...requests().keys()][0] as string;
  advanceRequest(api, id, { status: "failed", errorCode: "invalid_input", message: "Não entendi o que você falou." });

  await waitFor(() => expect(result.current.jobs[0]?.error).toBe("Não entendi o que você falou."), { timeout: 4000 });
  expect(result.current.jobs[0]?.status).toBe("error");
});

test("the pending queue survives a reload: the stored request id is polled, not submitted again", async () => {
  const seeded = requestFixture({ id: "R0000000000000000000000001", route: "voice", status: "running", text: "almocei arroz" });
  requests().set(seeded.id, seeded);
  localStorage.setItem("voice-jobs:u", JSON.stringify([
    { id: "stable-voice", requestId: seeded.id, transcript: "almocei arroz", status: "pending" },
  ]));
  const onCreated = vi.fn();
  const { result } = renderHook(() => useVoiceEventQueue({ onCreated }));

  await waitFor(() => expect(result.current.jobs).toHaveLength(1));
  expect(voicePosts()).toHaveLength(0);
  advanceRequest(api, seeded.id, { status: "done", entities: [createdEvent] });
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdEvent), { timeout: 4000 });
});

function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
