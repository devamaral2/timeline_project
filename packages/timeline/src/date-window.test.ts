import { expect, test } from "vitest";
import { buildDateWindow, timelineWindowUrl } from "./date-window";

const now = new Date("2026-08-19T15:00:00-03:00");

test("the first window covers today and the seven previous days in Sao Paulo", () => {
  expect(buildDateWindow(0, now)).toEqual({
    from: "2026-08-12T03:00:00.000Z",
    to: "2026-08-20T02:59:59.999Z",
  });
});

test("the second window covers the eighth to the fifteenth previous day", () => {
  expect(buildDateWindow(1, now)).toEqual({
    from: "2026-08-04T03:00:00.000Z",
    to: "2026-08-12T02:59:59.999Z",
  });
});

test("consecutive windows touch without gaps or overlaps", () => {
  const previous = buildDateWindow(2, now);
  const next = buildDateWindow(3, now);

  expect(new Date(previous.from).getTime() - new Date(next.to).getTime()).toBe(1);
});

test("builds the api url for a window", () => {
  const url = timelineWindowUrl("user-1", 0, now);

  expect(url).toBe(
    "/api/events?userId=user-1&from=2026-08-12T03%3A00%3A00.000Z&to=2026-08-20T02%3A59%3A59.999Z",
  );
});
