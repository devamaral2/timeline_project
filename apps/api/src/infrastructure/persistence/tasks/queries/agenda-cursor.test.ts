import { expect, test } from "vitest";
import { decodeAgendaCursor, encodeAgendaCursor } from "./agenda-cursor";

test("round-trips an opaque agenda cursor", () => {
  const encoded = encodeAgendaCursor({
    startedAt: new Date("2026-08-31T12:00:00.000Z"),
    id: "01K4A000000000000000000000",
  });
  expect(decodeAgendaCursor(encoded)).toEqual({
    startedAt: new Date("2026-08-31T12:00:00.000Z"),
    id: "01K4A000000000000000000000",
  });
});

test("rejects a malformed cursor", () => {
  expect(() => decodeAgendaCursor("not-a-cursor")).toThrow("Invalid agenda cursor");
});
