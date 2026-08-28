import { expect, test } from "vitest";
import { LatestRequest } from "./latest-request";

test("only the latest request can commit state", () => {
  const requests = new LatestRequest();
  const first = requests.start();
  const second = requests.start();

  expect(first.signal.aborted).toBe(true);
  expect(requests.isCurrent(first)).toBe(false);
  expect(requests.isCurrent(second)).toBe(true);
});

test("cancels the active request when the selected day changes", () => {
  const requests = new LatestRequest();
  const active = requests.start();

  requests.cancel();

  expect(active.signal.aborted).toBe(true);
  expect(requests.isCurrent(active)).toBe(false);
});
