import { describe, expect, test } from "vitest";
import { computeTriggerTimes } from "./trigger-times";

describe("computeTriggerTimes", () => {
  test("computes one trigger per offset, before startedAt", () => {
    const startedAt = new Date("2026-09-16T12:00:00.000Z");
    const now = new Date("2026-09-16T00:00:00.000Z");

    const triggers = computeTriggerTimes(startedAt, [5, 60], now);

    expect(triggers).toEqual([
      new Date("2026-09-16T11:55:00.000Z"),
      new Date("2026-09-16T11:00:00.000Z"),
    ]);
  });

  test("drops triggers that already passed", () => {
    const startedAt = new Date("2026-09-16T12:00:00.000Z");
    const now = new Date("2026-09-16T11:57:00.000Z");

    // 5 minutos antes ja passou (11:55); 1 minuto antes ainda esta por vir (11:59).
    const triggers = computeTriggerTimes(startedAt, [5, 1], now);

    expect(triggers).toEqual([new Date("2026-09-16T11:59:00.000Z")]);
  });

  test("returns nothing when there are no offsets", () => {
    expect(computeTriggerTimes(new Date(), [], new Date())).toEqual([]);
  });
});
