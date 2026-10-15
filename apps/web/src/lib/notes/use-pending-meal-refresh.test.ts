import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePendingMealRefresh } from "./use-pending-meal-refresh";

afterEach(() => vi.useRealTimers());
test("refreshes pending data and stops when generation reaches terminal status", async () => {
  vi.useFakeTimers();
  const refresh = vi.fn(async () => {});
  const { rerender } = renderHook(({ pending }) => usePendingMealRefresh(pending, refresh), {
    initialProps: { pending: true },
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(refresh).toHaveBeenCalledTimes(2);
  rerender({ pending: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(refresh).toHaveBeenCalledTimes(2);
});
