import { describe, expect, it } from "vitest";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { ensureSigningKeyActive } from "./signing-key-startup";

const now = new Date("2026-01-02T03:04:05.000Z");

describe("signing key startup", () => {
  it("guarantees the active key before traffic with the startup audit event", async () => {
    const calls: Array<{ now: Date; audit: unknown }> = [];
    const key = { kid: "kid-1" };

    const result = await ensureSigningKeyActive(
      {
        ensureActive: async (at, audit) => {
          calls.push({ now: at, audit });
          return key as never;
        },
      },
      now,
    );

    expect(result).toBe(key);
    expect(calls).toEqual([
      {
        now,
        audit: {
          correlationId: "startup",
          actorUserId: null,
          action: "key.created",
          targetType: "signing_key",
          targetId: null,
          result: "succeeded",
          reason: null,
          metadata: {},
          context: ANONYMOUS_CONTEXT,
          occurredAt: now,
        },
      },
    ]);
  });
});
