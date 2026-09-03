import { expect, test } from "vitest";
import { decodeTimelineCursor, encodeTimelineCursor } from "./timeline-cursor";

test("round-trips an opaque timeline cursor", () => {
  const encoded = encodeTimelineCursor({
    startedAt: new Date("2026-08-31T12:00:00.000Z"),
    id: "01K4A000000000000000000000",
  });
  expect(decodeTimelineCursor(encoded)).toEqual({
    startedAt: new Date("2026-08-31T12:00:00.000Z"),
    id: "01K4A000000000000000000000",
  });
});

test("rejects a malformed cursor", () => {
  expect(() => decodeTimelineCursor("not-a-cursor")).toThrow("Invalid timeline cursor");
});
