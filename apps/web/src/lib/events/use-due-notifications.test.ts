import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useDueNotifications, type DueNotificationSource } from "./use-due-notifications";

function eventStartingIn(minutesFromNow: number, now: Date, overrides: Partial<DueNotificationSource> = {}) {
  return {
    id: "event-1",
    name: "Corrida",
    startedAt: new Date(now.getTime() + minutesFromNow * 60_000).toISOString(),
    notifyOffsetsMinutes: [5],
    ...overrides,
  } satisfies DueNotificationSource;
}

test("does not fire for an offset that was already overdue when first observed", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const overdueEvent = eventStartingIn(-10, now); // trigger (5 min before) is 15 minutes in the past

  const { result } = renderHook(({ events, at }: { events: DueNotificationSource[]; at: Date }) =>
    useDueNotifications(events, at),
  {
    initialProps: { events: [overdueEvent], at: now },
  });

  expect(result.current.due).toEqual([]);
});

test("fires once when the trigger is crossed after the hook starts watching", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const upcomingEvent = eventStartingIn(6, now); // trigger is 1 minute in the future

  const { result, rerender } = renderHook(
    ({ events, at }: { events: DueNotificationSource[]; at: Date }) => useDueNotifications(events, at),
    { initialProps: { events: [upcomingEvent], at: now } },
  );

  expect(result.current.due).toEqual([]);

  const afterTrigger = new Date(now.getTime() + 2 * 60_000);
  rerender({ events: [upcomingEvent], at: afterTrigger });

  expect(result.current.due).toEqual([
    { key: "event-1:5", eventId: "event-1", name: "Corrida", offsetMinutes: 5 },
  ]);

  // Nao dispara de novo em ticks seguintes.
  rerender({ events: [upcomingEvent], at: new Date(afterTrigger.getTime() + 60_000) });
  expect(result.current.due).toHaveLength(1);
});

test("dismiss removes a notification from the due list", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const upcomingEvent = eventStartingIn(6, now); // trigger is 1 minute in the future

  const { result, rerender } = renderHook(
    ({ events, at }: { events: DueNotificationSource[]; at: Date }) => useDueNotifications(events, at),
    { initialProps: { events: [upcomingEvent], at: now } },
  );
  rerender({ events: [upcomingEvent], at: new Date(now.getTime() + 60_000) });

  expect(result.current.due).toHaveLength(1);
  act(() => result.current.dismiss("event-1:5"));
  rerender({ events: [upcomingEvent], at: new Date(now.getTime() + 60_000) });
  expect(result.current.due).toEqual([]);
});
