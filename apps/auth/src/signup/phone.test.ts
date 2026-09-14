import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["+5511999990000", "+5511999990000"],
    ["+55 (11) 99999-0000", "+5511999990000"],
    ["0055 11 99999.0000", "+5511999990000"],
    ["  +1 415-555-2671 ", "+14155552671"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["11999990000", "+0511999990000", "+55 11 9999x0000", "+123", "+1234567890123456", ""])("rejects %s", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});
