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

test("the open request is the one another call extends", () => {
  const requests = new LatestRequest();

  expect(requests.active()).toBeUndefined();

  const day = requests.start();
  // Ainda o mesmo token depois que a busca do dia terminou: carregar mais e
  // continuar essa busca, e nao comecar outra.
  expect(requests.active()).toBe(day);

  requests.cancel();
  expect(requests.active()).toBeUndefined();
});
