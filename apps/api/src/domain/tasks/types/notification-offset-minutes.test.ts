import { describe, expect, test } from "vitest";
import {
  isNotificationOffsetMinutes,
  MAX_NOTIFICATION_OFFSET_MINUTES,
  MIN_NOTIFICATION_OFFSET_MINUTES,
} from "./notification-offset-minutes";

describe("isNotificationOffsetMinutes", () => {
  test("accepts any positive integer within the bounds, in minutes or in days", () => {
    expect(isNotificationOffsetMinutes(5)).toBe(true);
    expect(isNotificationOffsetMinutes(45)).toBe(true);
    expect(isNotificationOffsetMinutes(3 * 1440)).toBe(true); // 3 dias
    expect(isNotificationOffsetMinutes(MIN_NOTIFICATION_OFFSET_MINUTES)).toBe(true);
    expect(isNotificationOffsetMinutes(MAX_NOTIFICATION_OFFSET_MINUTES)).toBe(true);
  });

  test("rejects zero, negative, non-integer and out-of-range values", () => {
    expect(isNotificationOffsetMinutes(0)).toBe(false);
    expect(isNotificationOffsetMinutes(-5)).toBe(false);
    expect(isNotificationOffsetMinutes(5.5)).toBe(false);
    expect(isNotificationOffsetMinutes(MAX_NOTIFICATION_OFFSET_MINUTES + 1)).toBe(false);
    expect(isNotificationOffsetMinutes("5")).toBe(false);
    expect(isNotificationOffsetMinutes(null)).toBe(false);
    expect(isNotificationOffsetMinutes(undefined)).toBe(false);
  });
});
