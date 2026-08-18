import { expect, test } from "vitest";
import { getFoodEventName } from "./food-event-name.service";

test.each([
  ["2026-08-17T05:00:00-03:00", "Desjejum"],
  ["2026-08-17T07:00:00-03:00", "Café da manhã"],
  ["2026-08-17T10:30:00-03:00", "Colação"],
  ["2026-08-17T12:00:00-03:00", "Almoço"],
  ["2026-08-17T16:30:00-03:00", "Lanche da tarde"],
  ["2026-08-17T20:00:00-03:00", "Jantar"],
])("derives the correct food name for %s", (iso, expectedName) => {
  expect(getFoodEventName(new Date(iso), "America/Sao_Paulo")).toBe(expectedName);
});

test("uses the requested timezone instead of the deployment timezone", () => {
  const instant = new Date("2026-08-17T03:01:00.000Z");

  expect(getFoodEventName(instant, "UTC")).toBe("Desjejum");
  expect(getFoodEventName(instant, "America/Sao_Paulo")).toBe("Jantar");
});
