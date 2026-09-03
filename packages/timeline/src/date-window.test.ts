import { expect, test } from "vitest";
import { buildDateWindow, dayEventsUrl, timelineWindowUrl } from "./date-window";

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
  expect(timelineWindowUrl(0, now)).toBe(
    "/api/events?from=2026-08-12T03%3A00%3A00.000Z&to=2026-08-20T02%3A59%3A59.999Z",
  );
});

test("asks for a single civil day", () => {
  expect(dayEventsUrl("2026-08-31")).toBe(
    "/api/events?from=2026-08-31T03%3A00%3A00.000Z&to=2026-09-01T02%3A59%3A59.999Z",
  );
});

test("never carries the user in the query", () => {
  // Quem responde por autorizacao e o token no cabecalho. Um id aqui reabriria
  // a leitura anonima que a migracao fechou.
  expect(dayEventsUrl("2026-08-31")).not.toContain("userId");
  expect(timelineWindowUrl(0, now)).not.toContain("userId");
});

test("carries the opaque cursor of the next page as it came", () => {
  const cursor = "eyJzdGFydGVkQXQiOiIyMDI2LTA4LTMxVDEyOjAwOjAwLjAwMFoifQ==";

  expect(dayEventsUrl("2026-08-31", { cursor })).toBe(
    "/api/events?from=2026-08-31T03%3A00%3A00.000Z&to=2026-09-01T02%3A59%3A59.999Z" +
      `&cursor=${encodeURIComponent(cursor)}`,
  );
});

test("filters by item type and page size when asked", () => {
  const url = dayEventsUrl("2026-08-31", { itemType: "meal", limit: 20 });

  // O parametro do backend chama-se `type` — o que ele filtra e o item.
  expect(url).toContain("&type=meal");
  expect(url).toContain("&limit=20");
});

test("leaves out the filters nobody asked for", () => {
  const url = dayEventsUrl("2026-08-31");

  expect(url).not.toContain("type=");
  expect(url).not.toContain("cursor=");
  expect(url).not.toContain("limit=");
});
