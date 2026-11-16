import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AGENT_REQUEST_POLL_MS } from "./agent-request-model";
import { useOpenAgentRefresh } from "./use-open-agent-refresh";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("relê a cada intervalo enquanto estiver habilitado", async () => {
  const refresh = vi.fn();
  renderHook(() => useOpenAgentRefresh(true, refresh));

  await advance(AGENT_REQUEST_POLL_MS * 3);
  expect(refresh).toHaveBeenCalledTimes(3);
});

it("sem evento de agente em aberto (desabilitado), não relê", async () => {
  const refresh = vi.fn();
  renderHook(() => useOpenAgentRefresh(false, refresh));

  await advance(AGENT_REQUEST_POLL_MS * 5);
  expect(refresh).not.toHaveBeenCalled();
});

it("para de reler quando deixa de estar habilitado", async () => {
  const refresh = vi.fn();
  const { rerender } = renderHook(({ enabled }) => useOpenAgentRefresh(enabled, refresh), { initialProps: { enabled: true } });

  await advance(AGENT_REQUEST_POLL_MS);
  expect(refresh).toHaveBeenCalledTimes(1);

  rerender({ enabled: false });
  await advance(AGENT_REQUEST_POLL_MS * 4);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("para de reler quando a tela é desmontada", async () => {
  const refresh = vi.fn();
  const { unmount } = renderHook(() => useOpenAgentRefresh(true, refresh));

  await advance(AGENT_REQUEST_POLL_MS);
  unmount();
  await advance(AGENT_REQUEST_POLL_MS * 4);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("usa a releitura mais recente, não a da primeira renderização", async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const { rerender } = renderHook(({ refresh }) => useOpenAgentRefresh(true, refresh), { initialProps: { refresh: first } });

  rerender({ refresh: latest });
  await advance(AGENT_REQUEST_POLL_MS);
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
});

it("pula a batida enquanto a releitura anterior ainda não terminou", async () => {
  let finish: () => void = () => {};
  const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  renderHook(() => useOpenAgentRefresh(true, refresh));

  await advance(AGENT_REQUEST_POLL_MS);
  await advance(AGENT_REQUEST_POLL_MS);
  expect(refresh).toHaveBeenCalledTimes(1);

  await act(async () => { finish(); });
  await advance(AGENT_REQUEST_POLL_MS);
  expect(refresh).toHaveBeenCalledTimes(2);
});
