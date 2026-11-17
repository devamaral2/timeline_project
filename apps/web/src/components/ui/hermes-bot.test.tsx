import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useHermesBotState } from "./hermes-bot";

afterEach(() => vi.useRealTimers());

test("the robot thinks while the chat is busy and celebrates when it ends", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ pending, failed }: { pending: boolean; failed: boolean }) => useHermesBotState({ pending, failed }),
    { initialProps: { pending: false, failed: false } },
  );
  expect(result.current).toBe("idle");

  rerender({ pending: true, failed: false });
  expect(result.current).toBe("thinking");

  rerender({ pending: false, failed: false });
  expect(result.current).toBe("done");
  act(() => vi.advanceTimersByTime(2399));
  expect(result.current).toBe("done");
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe("idle");
});

test("a failed request shows the error for 2.6 s without a success in between", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ pending, failed }: { pending: boolean; failed: boolean }) => useHermesBotState({ pending, failed }),
    { initialProps: { pending: false, failed: false } },
  );

  rerender({ pending: true, failed: false });
  rerender({ pending: false, failed: true });
  expect(result.current).toBe("error");
  act(() => vi.advanceTimersByTime(2599));
  expect(result.current).toBe("error");
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe("idle");
});
