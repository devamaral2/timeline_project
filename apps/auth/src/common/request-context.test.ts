import { describe, expect, it } from "vitest";
import { resolveRequestContext } from "./request-context";

describe("request context", () => {
  it("keeps a well-formed correlation id sent by the client", () => {
    const context = resolveRequestContext(
      { receivedCorrelationId: "req-01_ABC.2", ipAddress: "10.0.0.1", userAgent: "Android" },
      () => "generated",
    );

    expect(context).toEqual({ correlationId: "req-01_ABC.2", ipAddress: "10.0.0.1", userAgent: "Android" });
  });

  it.each(["", "has space", "a/b", "x".repeat(129)])("replaces the unusable correlation id %j", (receivedCorrelationId) => {
    const context = resolveRequestContext({ receivedCorrelationId }, () => "generated");

    expect(context.correlationId).toBe("generated");
  });

  it("generates a correlation id when the client did not send one", () => {
    let calls = 0;
    const context = resolveRequestContext({}, () => {
      calls += 1;
      return "generated";
    });

    expect(context.correlationId).toBe("generated");
    expect(calls).toBe(1);
  });

  it("normalizes missing connection details to null", () => {
    const context = resolveRequestContext({ ipAddress: "", userAgent: "" }, () => "generated");

    expect(context).toEqual({ correlationId: "generated", ipAddress: null, userAgent: null });
  });

  it("is frozen so a handler cannot rewrite the audit identity", () => {
    const context = resolveRequestContext({ receivedCorrelationId: "req-1" }, () => "generated");

    expect(Object.isFrozen(context)).toBe(true);
  });
});
