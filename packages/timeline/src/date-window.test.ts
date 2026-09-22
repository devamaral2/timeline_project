import { expect, test } from "vitest";
import { dayEventsUrl } from "./date-window";

test("asks for a single civil day", () => {
  expect(dayEventsUrl("2026-08-31")).toBe(
    "/api/events?from=2026-08-31T03%3A00%3A00.000Z&to=2026-09-01T02%3A59%3A59.999Z",
  );
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
